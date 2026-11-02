/** How long focus is given to arrive before the edit is retried, then given up. */
const FOCUS_RETRY_DELAY = 50;

/**
 * How long typing must pause before what was typed goes to the file. Short
 * enough that both sides are the same thing, long enough that a word is one
 * write rather than five.
 */
const SETTLE_DELAY = 300;

/** What an inline edit needs from the view it runs in. */
export interface EditSession {
  /** The element to run in; already in place, already styled. */
  input: HTMLElement;
  /** What the editor is holding, as it would go into the file. */
  value: () => string;
  placeCaret: () => void;
  /** Puts the drawn text back when the editor goes. */
  restore: () => void;
  /** Writes what is in the editor; called as it is typed, and once at the end. */
  write: (value: string) => void | Promise<void>;
  capture?: (reason: 'input' | 'compositionend' | 'finish') => void;
  interrupted?: () => void;
  setEditing: (editing: boolean) => void;
  /** Sizes the editor to what it holds, for one that does not grow by itself. */
  fit?: () => void;
  /** Re-lays out the map around the growing text. */
  reflow: () => void;
  /** Runs a render the edit held off; true when it did. */
  settle: () => boolean;
}

/**
 * Runs an inline edit of a node's label. What is typed goes to the file as it
 * is typed, a moment behind the keys - the map is one side of a note, not a
 * form to submit. Finalization joins the last requested save; failed or
 * interrupted input is retained by the owning view's recovery record.
 */
export function runEditor(session: EditSession): () => Promise<void> {
  const { input, placeCaret, restore, write, value } = session;

  session.setEditing(true);
  input.contentEditable = 'plaintext-only';
  let done = false;
  let composing = false;
  let pending: number | null = null;
  let lastWrite: Promise<void> | null = null;
  let finishing: Promise<void> | null = null;
  let failed = false;
  let interrupted = false;
  let requestId = 0;
  const put = (): void => {
    // A render can take the editor's element with it while a write is still
    // pending: what it holds is then older than the file it would go into.
    if (done || !input.isConnected) {
      return;
    }
    if (pending !== null) {
      input.win.clearTimeout(pending);
      pending = null;
    }
    // Mid-composition an IME's own working text is in the element: a CJK
    // reading would land in the file, to be replaced when it is confirmed.
    if (!composing) {
      const request = ++requestId;
      const result = write(value());

      if (result) {
        lastWrite = result.then(
          () => {
            if (request === requestId) {
              failed = false;
            }
          },
          () => {
            if (request === requestId) {
              failed = true;
            }
          },
        );
      } else {
        failed = false;
        lastWrite = null;
      }
    }
  };
  const soon = (): void => {
    if (done || finishing) {
      return;
    }
    if (pending !== null) {
      input.win.clearTimeout(pending);
    }
    pending = input.win.setTimeout(put, SETTLE_DELAY);
  };
  const finish = (): Promise<void> => {
    if (finishing) {
      return finishing;
    }
    let resolve!: () => void;

    finishing = new Promise<void>((done) => {
      resolve = done;
    });
    session.capture?.('finish');
    input.contentEditable = 'false';
    if (composing || !input.isConnected) {
      interrupted = true;
      session.interrupted?.();
    } else {
      put();
    }
    done = true;
    if (pending !== null) {
      input.win.clearTimeout(pending);
      pending = null;
    }
    input.doc.removeEventListener('keydown', onKey, true);
    const complete = (): void => {
      try {
        session.setEditing(false);
        if (!failed && !interrupted && !session.settle()) {
          restore();
        }
      } finally {
        resolve();
      }
    };

    if (lastWrite) {
      void lastWrite.then(complete);
    } else {
      complete();
    }

    return finishing;
  };

  // Clicks inside the editor must not reach the node handlers, which would
  // move focus to the map and close the edit.
  for (const type of ['pointerdown', 'click', 'dblclick'] as const) {
    input.addEventListener(type, (ev) => ev.stopPropagation());
  }

  // On the document, in the capture phase: a key this deep in the app can
  // otherwise be taken before the element ever sees it. Keys are only acted on
  // while the edit owns the focus.
  const onKey = (ev: KeyboardEvent): void => {
    if (done || input.doc.activeElement !== input) {
      return;
    }
    ev.stopPropagation();
    // An IME's confirming Enter is a real keydown with isComposing still set:
    // it belongs to the composition, not to this editor.
    if (ev.isComposing) {
      return;
    }
    if (ev.key === 'Escape' || ev.key === 'Enter') {
      ev.preventDefault();
      void finish();
    } else if (ev.key === 'Tab') {
      // Focus is what ends an edit, and Tab moves it: the edit would close on
      // a keystroke nobody means as "done". It does nothing here instead.
      ev.preventDefault();
    }
  };

  input.doc.addEventListener('keydown', onKey, true);
  // Blur joins the same finalization as Enter/Escape, including pending autosave.
  input.addEventListener('blur', () => {
    void finish();
  });
  input.addEventListener('focus', () => {
    if (!done) {
      session.setEditing(true);
    }
  });
  input.addEventListener('compositionstart', () => {
    composing = true;
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    session.capture?.('compositionend');
    soon();
  });
  // Growing text pushes the node's neighbours around, and renders are held off
  // while editing - so lay the map out again as it is typed, and put what was
  // typed in the file a moment later.
  input.addEventListener('input', () => {
    session.capture?.('input');
    if (done) {
      return;
    }
    session.fit?.();
    session.reflow();
    soon();
  });
  session.fit?.();
  input.focus();
  placeCaret();
  // A closing menu or leaf activation can keep focus away right as the edit
  // opens. Without focus the blur handler can never fire, so retry once, then
  // give up on the edit instead of leaving the map frozen.
  input.win.setTimeout(() => {
    if (done || input.doc.activeElement === input) {
      return;
    }
    input.focus();
    placeCaret();
    input.win.setTimeout(() => {
      if (!done && input.doc.activeElement !== input) {
        void finish();
      }
    }, FOCUS_RETRY_DELAY);
  }, 0);

  return finish;
}

/** Caret past the last character of a label, which is where a rename starts. */
export function caretAtEnd(input: HTMLElement): void {
  const range = input.doc.createRange();

  range.selectNodeContents(input);
  // Never a selection: the next keystroke would wipe the text it holds.
  range.collapse(false);
  const sel = input.win.getSelection();

  sel?.removeAllRanges();
  sel?.addRange(range);
}
