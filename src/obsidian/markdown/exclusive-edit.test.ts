import { describe, expect, it, vi } from 'vitest';
import { App, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';
import { INERT_VIEW, recoveryDrafts, SourceAuthority } from './exclusive-edit';

vi.mock('obsidian', async (original) => ({
  ...(await original<object>()),
  apiVersion: '1.14.5',
  ItemView: class {},
  MarkdownView: class {},
  TFile: class {},
}));

function fixture(buffer = '# Pending\n', stored = '# Original\n') {
  const container = {};
  const file = Object.assign(new TFile(), { path: 'Synthetic.md' });
  let disk = stored;
  let exists = file;
  let sourceType = 'markdown';
  let sourcePath = file.path;
  let second = false;
  let popout = false;
  let beforeProcess: () => void = () => undefined;
  const source = Object.assign(new MarkdownView({} as WorkspaceLeaf), {
    file,
    saving: false,
    saveAgain: false,
    dirty: true,
    lastSavedData: stored,
    getMode: (): 'source' | 'preview' => 'source',
    getState: () => ({ source: true }),
    getViewData: () => buffer,
    containerEl: { inert: false },
    editor: { cm: { composing: false, compositionStarted: false } },
  });
  const transition = vi.fn(async () => {
    if (!Reflect.get(leaf, 'working')) {
      sourceType = INERT_VIEW;
    }
  });
  const leaf = {
    view: source,
    working: false,
    isDeferred: false,
    getContainer: () => container,
    getViewState: () => ({
      type: sourceType,
      state: {
        file: sourceType === 'markdown' ? source.file?.path : sourcePath,
      },
    }),
    setViewState: transition,
  } as unknown as WorkspaceLeaf;
  const owner = {
    view: { currentFile: file, sourceSession: 0 },
    working: false,
    getContainer: () => container,
    getViewState: () => ({
      type: 'mindmap-editor',
      state: { file: file.path },
    }),
  } as unknown as WorkspaceLeaf;
  const extra = {
    ...owner,
    getContainer: () => (popout ? {} : container),
  } as WorkspaceLeaf;
  const process = vi.fn(async (_: TFile, mutate: (value: string) => string) => {
    beforeProcess();
    disk = mutate(disk);

    return disk;
  });
  const app = {
    vault: { process, getAbstractFileByPath: () => exists },
    workspace: {
      getLeavesOfType: (type: string) => {
        if (type === 'markdown') {
          return sourceType === 'markdown' ? [leaf] : [];
        }

        return second ? [owner, extra] : [owner];
      },
      iterateAllLeaves: (visit: (leaf: WorkspaceLeaf) => void) => {
        [owner, leaf, ...(popout ? [extra] : [])].forEach(visit);
      },
    },
  } as unknown as App;

  return {
    app,
    file,
    source,
    leaf,
    owner,
    process,
    transition,
    disk: () => disk,
    editWhileRevoked: (value: string) => {
      buffer = value;
    },
    beforeProcess: (run: () => void) => {
      beforeProcess = run;
    },
    inject: (value: string) => {
      beforeProcess = () => {
        disk = value;
      };
    },
    replace: () => {
      exists = Object.assign(new TFile(), { path: file.path });
    },
    second: () => {
      second = true;
    },
    popout: () => {
      popout = true;
    },
    reopen: (path = file.path) => {
      sourcePath = path;
      source.file = Object.assign(new TFile(), { path });
      sourceType = 'markdown';
    },
  };
}

describe('exclusive source handover', () => {
  for (const who of ['leaf', 'owner'] as const) {
    it(`refuses a non-idle ${who} before revocation`, async () => {
      const f = fixture();

      Reflect.set(f[who], 'working', true);
      await expect(
        SourceAuthority.acquire(f.app, f.file, f.owner),
      ).rejects.toThrow();
      expect(f.source.file).toBe(f.file);
      expect(f.process).not.toHaveBeenCalled();
    });
  }

  it('preserves the original draft when a late pane transition changes its buffer context', async () => {
    const f = fixture();

    f.beforeProcess(() => {
      Reflect.set(f.leaf, 'working', true);
      f.editWhileRevoked('# Buffer from a different file\n');
    });
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow();
    expect(f.disk()).toBe('# Original\n');
    expect(
      recoveryDrafts(f.app).some((draft) => draft.text === '# Pending\n'),
    ).toBe(true);
  });

  it('requires an acknowledged inert view transition, not a resolved no-op', async () => {
    const f = fixture();

    f.transition.mockImplementationOnce(async () => undefined);
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow();
    expect(recoveryDrafts(f.app).at(-1)?.text).toBe('# Pending\n');
  });

  it('retires authority when another Markdown pane has an unresolved transition target', async () => {
    const f = fixture();
    const lease = await SourceAuthority.acquire(f.app, f.file, f.owner);

    f.reopen('Other.md');
    Reflect.set(f.leaf, 'working', true);
    expect(() => lease.validate()).toThrow('interrupted');
    expect(lease.retired).toBe(true);
  });

  it('makes the old source inert synchronously before asynchronous storage', async () => {
    const f = fixture();

    f.beforeProcess(() => {
      expect(f.source.containerEl.inert).toBe(true);
    });
    await SourceAuthority.acquire(f.app, f.file, f.owner);
  });

  it('refuses active Source composition without revoking its editor', async () => {
    const f = fixture();

    f.source.editor.cm.composing = true;
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow('composition');
    expect(f.source.file).toBe(f.file);
    expect(f.process).not.toHaveBeenCalled();
  });

  it('retains a buffer changed after revocation and refuses successful acquisition', async () => {
    const f = fixture();

    f.beforeProcess(() => {
      f.editWhileRevoked('latest working buffer 👩🏽‍💻');
    });
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow('changed during');
    const draft = recoveryDrafts(f.app).slice(-1)[0];

    expect(draft?.text).toBe('latest working buffer 👩🏽‍💻');
    expect(draft?.applied).toBeLessThan(draft?.revision ?? 0);
  });
  for (const text of ['# Português 👩🏽‍💻 e\u0301\n', '']) {
    it(`transfers an exact pending buffer ${JSON.stringify(text)} after synchronous revocation`, async () => {
      const f = fixture(text);

      f.process.mockImplementationOnce(async (_, mutate) => {
        expect(f.source.file).toBeNull();

        return mutate('# Original\n');
      });
      const lease = await SourceAuthority.acquire(f.app, f.file, f.owner);

      expect(lease.baseline).toBe(text);
      expect(f.source.file).toBeNull();
      expect(f.transition).toHaveBeenCalledTimes(1);
      lease.validate();
      lease.retire();
    });
  }

  it('revalidates a late second map inside the transfer callback', async () => {
    const f = fixture();

    f.beforeProcess(f.second);
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow('second');
    expect(f.disk()).toBe('# Original\n');
    expect(recoveryDrafts(f.app).slice(-1)[0]?.text).toBe('# Pending\n');
  });

  it('refuses an unrecognized input adapter or deferred source before revocation', async () => {
    for (const missing of ['adapter', 'deferred']) {
      const f = fixture();

      if (missing === 'adapter') {
        Reflect.deleteProperty(f.source.editor.cm, 'compositionStarted');
      } else {
        Reflect.set(f.leaf, 'isDeferred', true);
      }
      await expect(
        SourceAuthority.acquire(f.app, f.file, f.owner),
      ).rejects.toThrow();
      expect(f.source.file).toBe(f.file);
      expect(f.process).not.toHaveBeenCalled();
    }
  });

  it('refuses a running/follow-up host save without revoking its buffer', async () => {
    for (const flag of ['saving', 'saveAgain'] as const) {
      const f = fixture();

      f.source[flag] = true;
      await expect(
        SourceAuthority.acquire(f.app, f.file, f.owner),
      ).rejects.toThrow('still saving');
      expect(f.source.file).toBe(f.file);
      expect(f.process).not.toHaveBeenCalled();
    }
  });

  it('compares inside process and retains the exact pending buffer on conflict', async () => {
    const f = fixture('');

    f.inject('# EXTERNAL\n');
    await expect(
      SourceAuthority.acquire(f.app, f.file, f.owner),
    ).rejects.toThrow('changed before handover');
    expect(f.disk()).toBe('# EXTERNAL\n');
    expect(f.source.file).toBeNull();
    const recovered = recoveryDrafts(f.app).slice(-1)[0];

    expect(recovered).toMatchObject({ text: '', applied: 0, revision: 1 });
    expect(recovered?.error).toContain('changed before handover');
  });

  it('refuses Reading and Live Preview before touching the source', async () => {
    for (const mode of ['preview', 'live']) {
      const f = fixture();

      f.source.getMode = () => (mode === 'preview' ? 'preview' : 'source');
      f.source.getState = () => ({ source: false });
      await expect(
        SourceAuthority.acquire(f.app, f.file, f.owner),
      ).rejects.toThrow('raw Source');
      expect(f.source.file).toBe(f.file);
    }
  });

  it('refuses another same-file map or any popout', async () => {
    const maps = fixture();

    maps.second();
    await expect(
      SourceAuthority.acquire(maps.app, maps.file, maps.owner),
    ).rejects.toThrow('second');
    const windows = fixture();

    windows.popout();
    await expect(
      SourceAuthority.acquire(windows.app, windows.file, windows.owner),
    ).rejects.toThrow('popouts');
  });

  it('invalidates on a second Markdown view, rename, replacement and retire', async () => {
    for (const action of [
      'reopen',
      'rename',
      'replace',
      'retire',
      'session',
      'owner',
    ] as const) {
      const f = fixture();
      const lease = await SourceAuthority.acquire(f.app, f.file, f.owner);

      if (action === 'reopen') {
        f.reopen();
      }
      if (action === 'rename') {
        f.file.path = 'Renamed.md';
      }
      if (action === 'replace') {
        f.replace();
      }
      if (action === 'retire') {
        lease.retire();
      }
      if (action === 'session') {
        Reflect.set(f.owner.view, 'sourceSession', 1);
      }
      if (action === 'owner') {
        Reflect.set(f.owner, 'view', { currentFile: f.file, sourceSession: 0 });
      }
      expect(() => lease.validate()).toThrow();
      expect(lease.retired).toBe(true);
      lease.retire();
    }
  });
});
