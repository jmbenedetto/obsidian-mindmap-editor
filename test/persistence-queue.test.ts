// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { MindmapView } from '../src/obsidian/map/mindmap-view';

vi.mock('obsidian', async (original) => ({
  ...(await original<object>()),
  ItemView: class {},
  TFile: class {},
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });

  return { promise, resolve };
}

function fixture() {
  let disk = '# Draft\n';
  const file = { path: 'Synthetic.md' };
  const source = { baseline: disk, validate: vi.fn(), show: vi.fn() };
  const view = Object.create(MindmapView.prototype) as MindmapView;
  const gate = deferred();
  const entered = deferred();
  let calls = 0;
  let external = false;
  const process = vi.fn(
    async (_: unknown, mutate: (value: string) => string) => {
      calls++;
      if (calls === 1) {
        entered.resolve();
        await gate.promise;
      }
      if (external) {
        disk += 'EXTERNAL\n';
        external = false;
      }
      disk = mutate(disk);

      return disk;
    },
  );

  Object.assign(view, {
    file,
    authority: source,
    app: { vault: { process } },
    requireAuthority: async () => source,
    render: vi.fn(async () => undefined),
    reportOpError: vi.fn(),
  });
  const write = Reflect.get(view, 'writeFile') as (
    file: unknown,
    mutate: (lines: string[]) => string[],
    ack?: () => void,
  ) => Promise<void>;
  const submit = (text: string, ack?: () => void) =>
    write.call(view, file, (lines) => [text, ...lines.slice(1)], ack);

  return {
    view,
    file,
    source,
    process,
    gate,
    entered,
    submit,
    disk: () => disk,
    external: () => {
      external = true;
    },
  };
}

describe('participating source queue', () => {
  it('validates the resulting source context before a label-shaped mutation commits', async () => {
    const f = fixture();

    f.gate.resolve();
    await expect(f.submit('# <!-- unclosed comment')).rejects.toThrow(
      'Unclosed',
    );
    expect(f.disk()).toBe('# Draft\n');
    expect(Reflect.get(f.view, 'undoable')).toBeUndefined();
  });

  it('does not let structural edits or Undo leapfrog an unacknowledged final draft', async () => {
    const f = fixture();

    f.gate.resolve();
    await f.submit('# A');
    const kept = Reflect.get(f.view, 'undoable') as unknown;
    const draft = {
      text: 'latest unsaved',
      revision: 2,
      applied: 1,
      error: 'refused',
    };

    Reflect.set(f.view, 'activeDraft', draft);
    Reflect.set(
      f.view,
      'closeEdit',
      vi.fn(async () => undefined),
    );
    const apply = Reflect.get(f.view, 'applyOp') as (
      mutate: (lines: string[]) => string[],
    ) => Promise<void>;

    await apply.call(f.view, () => ['# Should not write', '']);
    (Reflect.get(f.view, 'undoLastWrite') as () => boolean).call(f.view);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(f.disk()).toBe('# A\n');
    expect(Reflect.get(f.view, 'undoable')).toBe(kept);
    expect(Reflect.get(f.view, 'activeDraft')).toBe(draft);
  });

  it('refuses a second stale structural intent instead of relocating it after the first', async () => {
    const f = fixture();
    const first = f.submit('# A');

    await f.entered.promise;
    const second = f.submit('# Should not write');
    const refused = expect(second).rejects.toThrow('structural');

    f.gate.resolve();
    await first;
    await refused;
    expect(f.process).toHaveBeenCalledOnce();
    expect(f.disk()).toBe('# A\n');
  });

  it('allows a redraw-derived parent update without joining itself', async () => {
    const f = fixture();

    f.gate.resolve();
    Reflect.set(
      f.view,
      'render',
      vi.fn(async () => {
        await f.submit('# Parent derived');
      }),
    );
    const writeEdit = Reflect.get(f.view, 'writeEdit') as (
      file: unknown,
      mutate: (lines: string[]) => string[],
      ack: () => void,
    ) => Promise<boolean>;
    const ack = vi.fn();
    const saved = await writeEdit.call(
      f.view,
      f.file,
      (lines) => ['# Saved', ...lines.slice(1)],
      ack,
    );

    expect(saved).toBe(true);
    expect(ack).toHaveBeenCalledOnce();
    expect(f.process).toHaveBeenCalledTimes(2);
    expect(f.disk()).toBe('# Parent derived\n');
  });

  it('serializes immutable intents and acknowledges before the next dispatch', async () => {
    const f = fixture();
    const acknowledged: string[] = [];
    const first = f.submit('# B', () => {
      acknowledged.push('B');
    });

    await f.entered.promise;
    const final = f.submit('# Draft', () => {
      acknowledged.push('Draft');
    });

    expect(f.process).toHaveBeenCalledTimes(1);
    expect(acknowledged).toEqual([]);
    f.gate.resolve();
    await Promise.all([first, final]);
    expect(f.disk()).toBe('# Draft\n');
    expect(acknowledged).toEqual(['B', 'Draft']);
    expect(f.source.baseline).toBe(f.disk());
  });

  it('rejects the original queue token after a file-session A-to-B-to-A', async () => {
    const f = fixture();
    const writing = f.submit('# Should not write');

    await f.entered.promise;
    Reflect.set(f.view, 'navigationSeq', 2);
    f.gate.resolve();
    await expect(writing).rejects.toThrow('owner changed');
    expect(f.disk()).toBe('# Draft\n');
  });

  it('keeps the successful Undo record across a rejected later write', async () => {
    const f = fixture();

    f.gate.resolve();
    await f.submit('# A');
    const kept = Reflect.get(f.view, 'undoable') as unknown;

    expect(Object.isFrozen(kept)).toBe(true);
    f.external();
    await expect(f.submit('# B')).rejects.toThrow('baseline');
    expect(f.disk()).toBe('# A\nEXTERNAL\n');
    expect(Reflect.get(f.view, 'undoable')).toBe(kept);
  });

  it('does not spend Undo on a revision-acknowledging no-op', async () => {
    const f = fixture();

    f.gate.resolve();
    await f.submit('# A');
    const kept = Reflect.get(f.view, 'undoable') as unknown;
    const ack = vi.fn();

    await f.submit('# A', ack);
    expect(ack).toHaveBeenCalledOnce();
    expect(Reflect.get(f.view, 'undoable')).toBe(kept);
  });

  it('rejects an old queued operation after a file switch before the process callback', async () => {
    const f = fixture();
    const writing = f.submit('# A');

    await f.entered.promise;
    Reflect.set(f.view, 'file', { path: 'Other.md' });
    f.gate.resolve();
    await expect(writing).rejects.toThrow('owner changed');
    expect(f.disk()).toBe('# Draft\n');
  });

  it('puts Undo behind pending source edits rather than using an old snapshot', async () => {
    const f = fixture();
    const writing = f.submit('# A');

    await f.entered.promise;
    (Reflect.get(f.view, 'undoLastWrite') as () => boolean).call(f.view);
    f.gate.resolve();
    await writing;
    const settled = Reflect.get(f.view, 'sourceQueue') as Promise<void>;

    await settled;
    expect(f.disk()).toBe('# Draft\n');
    expect(Reflect.get(f.view, 'undoable')).toBeNull();
  });
});
