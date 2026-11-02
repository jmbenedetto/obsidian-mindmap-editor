import {
  apiVersion,
  App,
  ItemView,
  MarkdownView,
  Modal,
  TFile,
  WorkspaceLeaf,
} from 'obsidian';
import { sameWindow } from '../workspace';
import { joinLike } from './file-io';

export const INERT_VIEW = 'mindmap-editor-inert-source';

export interface RecoveryDraft {
  path: string;
  target: string;
  text: string;
  revision: number;
  applied: number;
  error?: string;
}

type RecoveryApp = App & { mindmapEditorRecovery?: RecoveryDraft[] };

/** App-lifetime memory survives view disposal and plugin reload, not process exit. */
export function recoveryDrafts(app: App): RecoveryDraft[] {
  const host = app as RecoveryApp;

  host.mindmapEditorRecovery ??= [];

  return host.mindmapEditorRecovery;
}

export class RecoveryModal extends Modal {
  onOpen(): void {
    this.contentEl.createEl('h2', { text: 'Recover map drafts' });
    this.contentEl.createEl('p', {
      text: 'Copy these exact drafts before restarting Obsidian. Nothing here is a persistent journal.',
    });
    for (const draft of recoveryDrafts(this.app).filter(
      (d) => d.error || d.applied < d.revision,
    )) {
      this.contentEl.createEl('h3', { text: `${draft.path}: ${draft.target}` });
      const area = this.contentEl.createEl('textarea');

      area.value = draft.text;
      area.readOnly = true;
      area.rows = 8;
      area.addClass('mindmap-recovery-draft');
    }
  }
}

/** Plain text only: Markdown rendering can create task and embed writers. */
export class InertSourceView extends ItemView {
  private path = '';

  getViewType(): string {
    return INERT_VIEW;
  }
  getDisplayText(): string {
    return 'Mind map source, inert';
  }
  getState(): Record<string, unknown> {
    return { file: this.path };
  }
  async setState(state: { file?: string }): Promise<void> {
    this.path = state.file ?? '';
    const file = this.app.vault.getAbstractFileByPath(this.path);

    if (file instanceof TFile) {
      this.show(await this.app.vault.read(file));
    }
  }
  show(text: string): void {
    this.contentEl.empty();
    this.contentEl.createEl('p', {
      text: 'Exclusive map editing. This source preview cannot write. Use release map editing before opening Markdown.',
    });
    this.contentEl.createEl('pre', { text });
  }
}

interface PendingSource extends MarkdownView {
  saving: boolean;
  saveAgain: boolean;
  dirty: boolean;
  lastSavedData: string | null;
}

const OWNERS = new WeakMap<App, Map<string, SourceAuthority>>();

function sameFile(leaf: WorkspaceLeaf, file: TFile): boolean {
  return leaf.getViewState().state?.file === file.path;
}

function idleLeaf(leaf: WorkspaceLeaf): boolean {
  return (leaf as WorkspaceLeaf & { working?: unknown }).working === false;
}

/** A cooperative lease, not a lock against filesystem or other plugin writers. */
export class SourceAuthority {
  baseline = '';
  retired = false;
  private readonly path: string;
  private readonly mapView: ItemView & {
    currentFile?: TFile;
    sourceSession?: number;
  };
  private readonly generation: number;

  private constructor(
    private readonly app: App,
    readonly file: TFile,
    private readonly owner: WorkspaceLeaf,
    private readonly preview: WorkspaceLeaf,
  ) {
    this.path = file.path;
    this.mapView = owner.view as typeof this.mapView;
    if (typeof this.mapView.sourceSession !== 'number') {
      throw new Error('Unrecognized map session. No authority was acquired.');
    }
    this.generation = this.mapView.sourceSession;
  }

  static async acquire(
    app: App,
    file: TFile,
    owner: WorkspaceLeaf,
  ): Promise<SourceAuthority> {
    if (apiVersion !== '1.14.5') {
      throw new Error(
        'Exclusive map editing requires the verified Obsidian 1.14.5 host.',
      );
    }
    const sources = app.workspace
      .getLeavesOfType('markdown')
      .filter((leaf) => sameFile(leaf, file));
    let popout = false;

    app.workspace.iterateAllLeaves((leaf) => {
      popout ||= !sameWindow(owner, leaf);
    });
    if (
      popout ||
      sources.length !== 1 ||
      sources[0]!.isDeferred ||
      !idleLeaf(sources[0]!) ||
      !idleLeaf(owner)
    ) {
      throw new Error(
        'Acquire from exactly one loaded raw Source pane, with no popouts.',
      );
    }
    const leaf = sources[0]!;
    const view = leaf.view as PendingSource;

    if (
      !(view instanceof MarkdownView) ||
      view.file !== file ||
      view.getMode() !== 'source' ||
      view.getState().source !== true
    ) {
      throw new Error(
        'Switch the sole Markdown pane to raw Source mode first. Reading and Live Preview are unsupported.',
      );
    }
    if (
      typeof view.saving !== 'boolean' ||
      typeof view.saveAgain !== 'boolean' ||
      typeof view.dirty !== 'boolean' ||
      typeof view.lastSavedData !== 'string'
    ) {
      throw new Error(
        'Unrecognized host save state; no authority was acquired.',
      );
    }
    if (view.saving || view.saveAgain) {
      throw new Error(
        'The Markdown pane is still saving. Its buffer was left untouched; retry when it finishes.',
      );
    }
    const cm = (
      view.editor as unknown as {
        cm?: { composing?: unknown; compositionStarted?: unknown };
      }
    )?.cm;

    if (
      typeof cm?.composing !== 'boolean' ||
      typeof cm.compositionStarted !== 'boolean' ||
      typeof view.containerEl?.inert !== 'boolean'
    ) {
      throw new Error(
        'Unrecognized source input state; no authority was acquired.',
      );
    }
    if (cm.composing || cm.compositionStarted) {
      throw new Error(
        'Finish source composition before acquiring map editing.',
      );
    }
    const owners = OWNERS.get(app) ?? new Map<string, SourceAuthority>();

    OWNERS.set(app, owners);
    if (owners.has(file.path)) {
      throw new Error('Another map owns this file.');
    }
    const source = new SourceAuthority(app, file, owner, leaf);
    const expected = view.lastSavedData;
    const raw = view.getViewData();
    const transferred = joinLike(raw.split(/\r?\n/), expected);
    const draft: RecoveryDraft = {
      path: file.path,
      target: 'Markdown handover',
      text: raw,
      revision: 1,
      applied: 0,
    };

    source.validateMaps();
    recoveryDrafts(app).push(draft);
    owners.set(file.path, source);
    // No await between the host-state check, snapshot and revocation. The pinned
    // host's already-bound debounce reads this field before it can capture a file.
    view.file = null;
    view.containerEl.inert = true;
    const retainChangedBuffer = (): boolean => {
      const latest = view.getViewData();

      if (latest === raw) {
        return false;
      }
      draft.text = latest;
      draft.revision = 2;

      return true;
    };

    try {
      source.baseline = await app.vault.process(file, (current) => {
        source.validateIdentity();
        source.validateMaps();
        source.validateParticipants(leaf);
        if (
          leaf.view !== view ||
          !idleLeaf(leaf) ||
          view.file !== null ||
          view.saving ||
          view.saveAgain ||
          !view.containerEl.inert
        ) {
          throw new Error('The source producer changed during handover.');
        }
        if (retainChangedBuffer()) {
          throw new Error(
            'The source buffer changed during handover. Recover the latest exact draft.',
          );
        }
        if (current !== expected) {
          throw new Error(
            'Source changed before handover; the exact pending buffer is in Recover map drafts.',
          );
        }

        return transferred;
      });
      draft.applied = 1;
      if (leaf.view !== view || !idleLeaf(leaf) || view.file !== null) {
        throw new Error(
          'The source pane changed context after transfer. Recover its retained snapshots.',
        );
      }
      if (retainChangedBuffer()) {
        throw new Error(
          'The source buffer changed during handover. Recover the latest exact draft.',
        );
      }
      await leaf.setViewState({ type: INERT_VIEW, state: { file: file.path } });
      if (
        view.file !== null ||
        view.saving ||
        view.saveAgain ||
        !idleLeaf(leaf) ||
        leaf.getViewState().type !== INERT_VIEW ||
        leaf.getViewState().state?.file !== file.path
      ) {
        throw new Error('The old Markdown pane did not remain revoked.');
      }
      source.validate();

      return source;
    } catch (error) {
      let message = String(error);

      try {
        if (leaf.view === view) {
          if (idleLeaf(leaf) && view.file === null) {
            retainChangedBuffer();
          } else {
            const latest = view.getViewData();

            if (latest !== raw) {
              recoveryDrafts(app).push({
                path: draft.path,
                target: 'buffer after pane transition (verify destination)',
                text: latest,
                revision: 1,
                applied: 0,
                error:
                  'The pane changed context. The original snapshot was retained separately.',
              });
            }
          }
        }
      } catch (snapshotError) {
        message += `; the final source snapshot was unavailable: ${String(snapshotError)}`;
      }
      draft.error = message;
      source.retire();
      // A failed handover must not reactivate a pending producer over a conflict.
      await leaf.setViewState({ type: INERT_VIEW, state: { file: file.path } });
      throw error;
    }
  }

  private validateIdentity(): void {
    const shown = this.mapView.currentFile;

    if (
      this.retired ||
      !idleLeaf(this.owner) ||
      this.owner.view !== this.mapView ||
      this.mapView.sourceSession !== this.generation ||
      shown !== this.file ||
      !this.app.workspace
        .getLeavesOfType('mindmap-editor')
        .includes(this.owner) ||
      this.file.path !== this.path ||
      this.app.vault.getAbstractFileByPath(this.path) !== this.file
    ) {
      throw new Error(
        'The file/session was closed, renamed, deleted or replaced.',
      );
    }
  }

  private validateMaps(): void {
    const maps = this.app.workspace
      .getLeavesOfType('mindmap-editor')
      .filter((leaf) => sameFile(leaf, this.file));

    if (maps.some((leaf) => leaf !== this.owner)) {
      throw new Error('A second same-file map is unsupported.');
    }
  }

  private validateParticipants(ignored?: WorkspaceLeaf): void {
    let popout = false;

    this.app.workspace.iterateAllLeaves((leaf) => {
      popout ||= !sameWindow(this.owner, leaf);
    });
    if (
      popout ||
      this.app.workspace
        .getLeavesOfType('markdown')
        .some(
          (leaf) =>
            leaf !== ignored && (!idleLeaf(leaf) || sameFile(leaf, this.file)),
        )
    ) {
      throw new Error(
        'Exclusive editing was interrupted by a Markdown pane or popout. Recover drafts before releasing.',
      );
    }
  }

  validate(): void {
    try {
      this.validateCurrent();
    } catch (error) {
      this.retire();
      throw error;
    }
  }

  private validateCurrent(): void {
    this.validateIdentity();
    this.validateMaps();
    this.validateParticipants();
    if (OWNERS.get(this.app)?.get(this.path) !== this) {
      throw new Error('Map authority is no longer current.');
    }
  }

  show(): void {
    if (
      !this.retired &&
      this.mapView.sourceSession === this.generation &&
      this.owner.view === this.mapView &&
      this.preview.getViewState().state?.file === this.path &&
      this.preview.view instanceof InertSourceView
    ) {
      this.preview.view.show(this.baseline);
    }
  }

  retire(): void {
    this.retired = true;
    const owners = OWNERS.get(this.app);

    if (owners?.get(this.path) === this) {
      owners.delete(this.path);
    }
  }
}
