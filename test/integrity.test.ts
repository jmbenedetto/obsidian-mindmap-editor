// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MindmapView } from '../src/obsidian/map/mindmap-view';
import { parseMarkdown } from '../src/core/parse/parser';
import { moveNodesOp } from '../src/core/write/ops';
import { installObsidianDom } from './stubs/obsidian-dom';

vi.mock('obsidian', async (original) => ({
  ...(await original<object>()),
  ItemView: class {},
  MarkdownView: class {},
  TFile: class {},
}));
installObsidianDom();
Object.assign(HTMLElement.prototype, {
  createSpan(this: HTMLElement, options: { cls?: string; text?: string } = {}) {
    const span = document.createElement('span');

    span.className = options.cls ?? '';
    span.textContent = options.text ?? '';
    this.appendChild(span);

    return span;
  },
  hide(this: HTMLElement) {
    this.hidden = true;
  },
  show(this: HTMLElement) {
    this.hidden = false;
  },
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

function labelFixture(initial = '# Draft\n') {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const gate = deferred();
  let disk = initial;
  let writes = 0;
  const file = { path: 'Synthetic.md', basename: 'Synthetic' };
  const node = parseMarkdown(disk, 'Synthetic').children[0]!;
  const el = document.body.createDiv();

  el.createSpan({ cls: 'mindmap-node-text', text: 'Draft' });
  const view = Object.create(MindmapView.prototype) as MindmapView;

  Object.assign(view, {
    file,
    renderedFile: file,
    authority: {},
    app: {},
    laidByLine: new Map([[0, { node, el }]]),
    isBusy: () => false,
    editSession: () => ({
      setEditing: vi.fn(),
      reflow: vi.fn(),
      settle: () => false,
    }),
    render: vi.fn(async () => undefined),
    writeFile: async (
      _file: unknown,
      mutate: (lines: string[]) => string[],
      acknowledge?: () => void,
    ) => {
      await gate.promise;
      writes++;
      disk = mutate(disk.split('\n')).join('\n');
      acknowledge?.();
    },
  });
  const start = Reflect.get(view, 'startInlineEdit') as (
    node: unknown,
    el: HTMLElement,
  ) => void;

  start.call(view, node, el);
  const input = el.querySelector<HTMLElement>('.mindmap-edit-input')!;

  input.tabIndex = -1;
  input.focus();
  const type = (text: string) => {
    input.textContent = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const finish = () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  };

  return {
    view,
    node,
    input,
    gate,
    type,
    finish,
    disk: () => disk,
    writes: () => writes,
  };
}

describe('F01, actual inline writer', () => {
  for (const observed of [null, 'last actual input 👩🏽‍💻']) {
    it(`does not reinterpret an unobserved connected DOM reset as input: ${JSON.stringify(observed)}`, async () => {
      const f = labelFixture();

      if (observed !== null) {
        f.type(observed);
      }
      f.input.innerText = '';
      f.finish();
      f.gate.resolve();
      await vi.runAllTimersAsync();
      expect(f.disk()).toBe(`# ${observed ?? 'Draft'}\n`);
    });
  }

  it('acknowledges an exact empty label without discarding it as falsy', async () => {
    const f = labelFixture();

    f.type('');
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe('# \n');
    expect(f.node.text).toBe('');
    expect(Reflect.get(f.view, 'closeEdit')).toBeNull();
  });

  it('retains metadata through task-title autosave and an A-to-B-to-A finish', async () => {
    const original = '- [ ] Draft ▲ 📅 2026-12-31\n';
    const f = labelFixture(original);

    f.type('first');
    await vi.advanceTimersByTimeAsync(300);
    f.type('Draft');
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe(original);
    expect(f.node.taskMetadata?.title).toBe('Draft');
    expect(f.node.taskMetadata?.priority).toBe('high');
    expect(f.node.taskMetadata?.dueDate).toBe('2026-12-31');
  });

  it('refuses implicit task conversion from a plain label and retains its exact draft', async () => {
    const f = labelFixture('- Draft\n');

    f.type('[ ] intended task');
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    const draft = Reflect.get(f.view, 'activeDraft') as {
      text: string;
      error: string;
    };

    expect(f.disk()).toBe('- Draft\n');
    expect(draft.text).toBe('[ ] intended task');
    expect(draft.error).toContain('refused');
  });

  it('keeps late composition input recoverable without saving working IME text', async () => {
    const f = labelFixture();

    f.input.dispatchEvent(new CompositionEvent('compositionstart'));
    f.type('か');
    await (Reflect.get(f.view, 'closeEdit') as () => Promise<void>)();
    expect(f.input.isConnected).toBe(true);
    f.type('漢');
    f.input.dispatchEvent(new CompositionEvent('compositionend'));
    const draft = Reflect.get(f.view, 'activeDraft') as {
      text: string;
      error: string;
    };

    expect(draft.text).toBe('漢');
    expect(draft.error).toContain('composition');
    expect(f.disk()).toBe('# Draft\n');
    expect(f.writes()).toBe(0);
  });

  it('retains the last connected raw draft when the editing DOM is disposed', async () => {
    const f = labelFixture();

    f.type('exact raw draft 👩🏽‍💻');
    f.input.remove();
    f.input.innerText = '';
    await (Reflect.get(f.view, 'closeEdit') as () => Promise<void>)();
    const draft = Reflect.get(f.view, 'activeDraft') as {
      text: string;
      error: string;
    };

    expect(draft.text).toBe('exact raw draft 👩🏽‍💻');
    expect(draft.error).toContain('interrupted');
    expect(f.disk()).toBe('# Draft\n');
  });

  it('does not let an older failed request poison a newer successful acknowledgement', async () => {
    const f = labelFixture();
    const original = Reflect.get(f.view, 'writeFile') as (
      file: unknown,
      mutate: (lines: string[]) => string[],
      ack: () => void,
    ) => Promise<void>;
    let failed = false;

    Reflect.set(f.view, 'writeFile', (...args: Parameters<typeof original>) => {
      if (!failed) {
        failed = true;

        return Promise.reject(new Error('one transient failure'));
      }

      return original.apply(f.view, args);
    });
    f.gate.resolve();
    f.type('first');
    await vi.advanceTimersByTimeAsync(300);
    f.type('Draft');
    f.finish();
    await vi.runAllTimersAsync();
    const draft = Reflect.get(f.view, 'activeDraft') as {
      applied: number;
      revision: number;
      error?: string;
    };

    expect(f.disk()).toBe('# Draft\n');
    expect(draft.applied).toBe(draft.revision);
    expect(draft.error).toBeUndefined();
    expect(Reflect.get(f.view, 'closeEdit')).toBeNull();
  });

  it('keeps a newer raw draft dirty after an older acknowledgement', async () => {
    const f = labelFixture();

    f.type('first');
    await vi.advanceTimersByTimeAsync(300);
    f.type('newer é 👩🏽‍💻');
    f.gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    const draft = Reflect.get(f.view, 'activeDraft') as {
      text: string;
      revision: number;
      applied: number;
    };

    expect(f.node.text).toBe('first');
    expect(draft.text).toBe('newer é 👩🏽‍💻');
    expect(draft.applied).toBeLessThan(draft.revision);
    f.finish();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe('# newer é 👩🏽‍💻\n');
    expect(draft.applied).toBe(draft.revision);
  });

  it('retains the exact draft and original bytes after a file switch', async () => {
    const f = labelFixture();

    f.type('draft for the original file');
    Reflect.set(f.view, 'file', { path: 'Other.md' });
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    const draft = Reflect.get(f.view, 'activeDraft') as {
      text: string;
      error: string;
    };

    expect(f.disk()).toBe('# Draft\n');
    expect(draft.text).toBe('draft for the original file');
    expect(draft.error).toContain('refused');
  });

  it('does not replay a committed label when redraw fails', async () => {
    const f = labelFixture();

    Reflect.set(
      f.view,
      'render',
      vi.fn().mockRejectedValue(new Error('render failed')),
    );
    f.type('saved exactly once');
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe('# saved exactly once\n');
    expect(f.writes()).toBe(1);
  });

  it('persists final intent after a pending autosave, without a reopen flush', async () => {
    const f = labelFixture();

    f.type('first');
    await vi.advanceTimersByTimeAsync(300);
    f.type('final');
    f.finish();
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe('# final\n');
  });

  it('persists A to B to A while B is pending', async () => {
    const f = labelFixture();

    f.type('B');
    await vi.advanceTimersByTimeAsync(300);
    f.type('Draft');
    f.finish();
    f.gate.resolve();
    await vi.runAllTimersAsync();
    expect(f.disk()).toBe('# Draft\n');
  });
});

function undoFixture(inject: boolean) {
  let disk = '# After\n';
  const file = { path: 'Synthetic.md' };
  const kept = { path: file.path, before: '# Before\n', after: disk };
  const view = Object.create(MindmapView.prototype) as MindmapView;
  const vault = {
    read: async () => {
      const seen = disk;

      if (inject) {
        disk += 'EXTERNAL\n';
      }

      return seen;
    },
    modify: async (_: unknown, value: string) => {
      disk = value;
    },
    process: async (_: unknown, mutate: (value: string) => string) => {
      if (inject) {
        disk += 'EXTERNAL\n';
      }
      disk = mutate(disk);

      return disk;
    },
  };

  Object.assign(view, {
    file,
    undoable: kept,
    app: { vault },
    render: vi.fn(async () => undefined),
    enqueueWrite: async (operation: () => Promise<void>) => operation(),
    requireAuthority: async () => ({
      baseline: kept.after,
      validate: () => undefined,
    }),
    reportOpError: vi.fn(),
  });

  return { view, kept, disk: () => disk };
}

describe('F02, actual direct-file Undo', () => {
  it('refuses an interleaved writer inside the atomic callback and retains its record', async () => {
    const f = undoFixture(true);

    (Reflect.get(f.view, 'undoLastWrite') as () => boolean).call(f.view);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(f.disk()).toBe('# After\nEXTERNAL\n');
    expect(Reflect.get(f.view, 'undoable')).toBe(f.kept);
  });

  it('still applies uncontested Undo', async () => {
    const f = undoFixture(false);

    (Reflect.get(f.view, 'undoLastWrite') as () => boolean).call(f.view);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(f.disk()).toBe('# Before\n');
    expect(Reflect.get(f.view, 'undoable')).toBeNull();
  });
});

describe('N07, actual branch moves', () => {
  for (const fence of ['```', '~~~']) {
    it(`preserves literal headings in ${fence} while changing real hierarchy`, () => {
      const text = `# Source\n${fence}text\n# literal\n${fence}\n## Child\nbody\n# Target\n`;
      const root = parseMarkdown(text, 'Synthetic');
      const after = moveNodesOp(
        text.split('\n'),
        [root.children[0]!],
        root.children[1]!,
      ).join('\n');

      expect(after).toContain(`${fence}text\n# literal\n${fence}`);
      const target = parseMarkdown(after, 'Synthetic').children[0]!;

      expect(target.text).toBe('Target');
      expect(target.children[0]?.text).toBe('Source');
      expect(target.children[0]?.children[0]?.text).toBe('Child');
    });
  }
});
