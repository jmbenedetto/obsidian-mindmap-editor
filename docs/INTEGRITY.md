# Editing integrity: bounded desktop mode

## 1. Status and scope

Implemented locally on `feat/editing-integrity`, starting from
`fb43537552c6712023191e8514f5f334f82e200a` (1.9.0). This is experimental,
version-specific work, not a production-safety assessment or a deployment
recommendation. Validation finished before publication. The archived evidence
records that pre-publication state; the user subsequently authorized a PR to
their fork. No release or existing-vault/profile installation is included.

The rejected `await MarkdownView.save()` handover remains documented below.
Its failure is not evidence against every possible handover. The replacement
protocol has passed actual-host pending-buffer acquisition for nonempty Unicode
and empty buffers. Additional live-flow results are recorded separately; a
harness error or safe refusal is never counted as successful functionality.

The implementation deliberately retains ordinary Markdown, autosave, label
editing, branch/node moves, sibling reorder and reparenting. It adds no required
IDs, scene storage, CRDT, filesystem lock, blanket Vault patch or global sync
pause. Dependency manifests and MIT notices are unchanged.

## 2. Authority and behavior contract

- Markdown is authoritative. A rendered map is only a projection, and a label
  draft is intent awaiting acknowledgement—not another canonical document.
- Start with one note/map in one desktop instance/window. Acquire from exactly
  one loaded, idle **raw Source** pane. Reading and Live Preview are not inert
  previews. Another instance and independent filesystem writers remain outside
  the supported contract; this plugin cannot prove their absence. Map-only use
  is available **after this handover**, by closing the inert preview. Merely
  closing Markdown and trying to acquire without a Source pane is refused.
- Acquisition recognizes the Obsidian **1.14.5** host state. It refuses unknown
  save/input/transition state, active or follow-up saves, source composition,
  deferred source panes, a second same-file map and any popout. A running save
  is not treated as drained merely because `save()` returned: retry only after
  the host is genuinely idle.
- A dirty buffer with a scheduled, not-running save is supported, including an
  empty buffer. Capture it and its `lastSavedData`; synchronously revoke the
  old view's `file` and make its container inert, before awaiting storage.
- Inside `Vault.process`, revalidate file identity, map identity/session,
  participants, revocation and exact baseline. Transfer the captured buffer,
  retaining the file's supported EOL convention. Then require an acknowledged
  transition to the plugin's plain-text inert view. A resolved no-op pane
  transition, closing a pane, a delay or matching a disk read is not the gate.
- The pinned bound/debounced save reads the revoked file field. Already-running
  writers are excluded before revocation; scheduled callbacks must no longer be
  able to capture this file. No global save function is replaced.
- While owned, selection must not reopen Markdown. The inert preview contains
  text, not Markdown-rendered tasks/embeds. Body-note editing requires release
  and a fresh raw Source pane; the old add-note route now refuses rather than
  making an uncoordinated write.
- New same-file Markdown panes or maps, popouts, owner/file replacement,
  rename/delete and file-session changes invalidate authority. An unresolved
  Markdown-pane transition is refused even while its destination is unknown.
  Every queued mutation rechecks these facts inside its process callback.
- Queue immutable value/revision intent. Resolve a label against its **last
  acknowledged** canonical target. A→B→A is a new revision, not a no-op inferred
  from the original label. Empty labels are valid; task kind/metadata changes
  use the dedicated actions instead of being smuggled through a title edit.
- Structural edits and Undo wait for finalization. An unacknowledged draft blocks
  them. Old acknowledgements/errors cannot clear newer raw input; repeated or
  reentrant finish joins one promise. IME working text is not committed as a
  final value. Late composition input and detached-DOM drafts remain recoverable.
- A source acknowledgement exits the queue before rendering. Render failure
  does not replay committed bytes, and render-derived task-parent writes cannot
  wait on the source job whose render requested them.
- One-step session Undo compares current bytes with its frozen record's `after`
  **inside the same synchronous process callback** that returns `before`.
  Refusal/failure retains that exact record. A logical no-op does not consume
  it. Release/file-session changes end the session's Undo; there is no Redo.
- `Vault.process` coordinates participating app operations, not independent
  processes or sync agents. An outside writer may act after a callback. There
  is no claim of losslessness against such writers or arbitrary plugins.

## 3. Structural and byte-preservation boundary

`source-context.ts` supplies the parser and writers with one visibility/context
model. Moves validate freshly parsed source ranges and genuine destinations,
reject ancestor/self/overlapping or stale targets, preserve list ancestry and
refuse heading overflow rather than clamp it. Only genuine heading prefixes
are shifted; fenced, frontmatter and comment literals are not rewritten.

Normal LF and CRLF, both final-newline states, nested lists, descriptions,
Unicode, links/embeds, task text and supported frontmatter/comment/fence cases
have byte-comparison regressions. The EOF terminator belongs to the document,
not whichever branch happened to be last. `joinLike` preserves an unchanged
input exactly and refuses changed mixed-EOL/bare-CR input rather than normalize
it globally. The source queue validates the resulting context as well as the
input context before committing.

This is not a complete CommonMark block parser. Unsupported or ambiguous
contexts are refused, including raw/container HTML or fences, unclosed syntax,
indented/bare/Setext headings, ambiguous marker indentation, unsupported
separators and some mixed indentation/BOM cases. Setext-like dash separators
can conservatively refuse a thematic break too. List moves in fenced documents
are refused; this is **not** reported as working fenced-list reparenting.
Heading moves with ordinary fenced literal headings have positive controls.
Viewing a note or transferring its raw Source buffer is not permission to
normalize unsupported Markdown with later map edits.

## 4. Draft recovery and failure boundaries

Recovery records are app-lifetime memory outside the editing DOM. They survive
view disposal and plugin reload in that same running app. The command
**Mindmap Editor: Recover map drafts** exposes raw text in read-only textareas;
it does not silently apply it over the current file.

On a source conflict the pending buffer remains available. If a pane transition
changes buffer context during handover, preserve the original snapshot and any
newly observed buffer separately. The latter is marked **verify destination**;
its path is original context, not proof that the new buffer belongs there.
After a failed revocation, close the frozen pane and open a fresh Source pane
rather than attempting to revive its old producer.

Copy unresolved drafts before restarting or quitting Obsidian. **There is no
persistent journal or process-restart recovery.** Successful labels intentionally
flatten pasted line breaks and trim their value; recovery keeps the unacknowledged
raw DOM text, rather than presenting that normalized value as the original input.

## 5. Regressions and validation layers

### 5.1 Failing before, fixed after

- **F01:** actual inline methods with delayed persistence lost final intent and
  A→B→A. Focused pre-fix failures are preserved in the evidence. Fixed tests also
  cover newer dirty raw text, older failures, joined finish, IME interruption,
  disposal, render failure, empty labels and terminal task metadata. Two more
  pre-fix failures cover connected DOM resets without an input event. Final
  values now come from the captured draft, not a fresh teardown DOM read.
- **F02:** actual Undo method with an injected interleaving erased an outside
  marker. The fixed method refuses the marker inside the process callback,
  retains the immutable record and still passes uncontested Undo.
- **N07:** actual branch operations changed literal `#` lines in backtick and
  tilde fences. The fixed operations preserve literals and still change real
  parent/child heading levels. Further tests exposed the EOF-terminator defect.
- **Handover review:** five assertions failed before transition-state guards:
  non-idle source/owner, late buffer-context change, a resolved no-op inert
  transition and an unknown transition destination. All now pass. This includes
  preserving the original source snapshot instead of replacing it with text
  loaded for a different context.

### 5.2 Pure/mocked-method matrix

- **PASS — persistence:** ordered acknowledgement, pending-write barriers,
  A→B→A, file-session A→B→A, failed writes, no-op/failing Undo, reentrant
  render-derived writes, stale errors and render failure without replay.
- **PASS — inline lifecycle:** repeated/reentrant finish, blur, rejected save,
  IME confirmation/interruption, late composition input and disconnected DOM.
- **PASS — structural functionality:** genuine heading/list moves, sibling
  reorder, multi-node reparenting, ancestry and intended hierarchy, literal/rich
  text preservation, LF/CRLF and final-newline variants.
- **SAFE REFUSAL — structural/context:** invalid source/destination, overflow,
  container/indented-code ambiguity and unsupported EOL/context changes. These
  controls do not establish successful functionality in those formats.
- **PASS / SAFE REFUSAL — authority model:** exact pending Unicode/empty
  transfer; active/follow-up saves, composition, deferred/unknown state, late
  participants, transition failure, owner/file replacement and lifecycle
  invalidation. These fixtures model host state; they are not Electron evidence.

### 5.3 Extracted installed-host diagnostic

The installed archive embeds Obsidian 1.14.5. Its `app.js` SHA-256 is
`95b9fd3944625c3b88116878b03d655147fed8cdfe6ddf931f2064ead78ccd5b`.
`test/probes/authority-handover.mjs` hash-checks it and evaluates actual extracted
save/unload methods in an isolated VM with delayed mock storage. Vendor source
is not copied into the repository. The running adapter checks exported
`apiVersion` and recognized private state, not this archive hash. This hash
identifies the tested host; it is not a runtime binary-signature gate.

```bash
OBSIDIAN_APP_ASAR=/Applications/Obsidian.app/Contents/Resources/obsidian.asar \
  node --test test/probes/authority-handover.mjs
```

This intentionally remains **red** for the rejected public-method-only barrier:
three uncontested controls pass, three drain/empty-pending assertions fail,
exit 1. It is not in the regular Vitest suite and is not a plugin integration
or Electron execution. A `save()` promise can return while another save runs,
and the follow-up write does not join that promise. An unload delegates to a
clearing save. The declaration package (1.13.1) does not promise a drain-all gate.

### 5.4 Actual isolated-host evidence

The user authorized a new synthetic-only HOME/profile/vault in the session's
`authority-lab` directory. Every CDP evaluation verifies exact HOME and vault
identity before touching app state. The personal Obsidian process, existing
vaults/profiles/labs and global sync settings were not used or changed.

- **PASS — actual pending acquisition:** final built plugin, actual raw Source
  view and actual disk. Both cases had `dirty: true`, `saving: false`,
  `saveAgain: false`, baseline `# Original\n` and a distinct pending buffer at
  acquisition. One pending buffer was Unicode; the other was exactly empty.
  The plugin transferred it, rendered it, produced an inert preview with zero
  mutable content elements, and allowed a later map commit.
- **PASS — revoked producer and selection:** invoking the old view's `save`,
  requesting its bound scheduled save and selecting the new map node did not
  replace the map commit or reopen a same-file Markdown pane. This is host API
  invocation, not physical mouse/keyboard evidence.
- **INCONCLUSIVE harness attempts:** an earlier pending buffer autosaved while
  the map opened; another driver assumed nonexistent `requestSave.cancel`;
  another omitted a required selection argument. None counts as a pass.
- **PASS — F01 through the built plugin:** actual header acquisition, synthetic
  DOM input and actual disk, with only the participating per-view queue held.
  The first autosave was pending before final A→B→A input; revision 2 was
  acknowledged as revision 2 and the final bytes matched the original A.
  This is controlled queue latency, not a physical-input or slow-filesystem test.
- **PASS — structural actions and uncontested Undo:** actual controller methods
  reordered heading/list siblings, reparented headings and lists, moved multiple
  list nodes, preserved description/fenced literal bytes and undid real changes.
  The returned actual Markdown is retained in `live-flows.json`.
- **SAFE REFUSAL — conflicting Undo and draft:** an outside marker was retained
  and the exact frozen Undo record survived refusal. In a separate reacquired
  session, a second outside marker prevented label commit; the raw Unicode and
  multiline draft remained unacknowledged. Release opened a different writable
  Source view with the actual disk buffer. View/plugin reload retained the same
  recovery records, and the real recovery modal exposed the exact raw text.
  These refusals are not counted as successful edits or successful Undo.
- **PASS — map-only after handover:** after acquisition from one Source pane,
  closing the inert preview left zero Markdown or inert panes. A subsequent
  Unicode label finalized to the expected actual disk bytes. A further visible
  run verified normal autosave while the input retained DOM focus, then final
  acknowledgement. Acquisition with no loaded Source pane had first been
  refused without changing the fixture.
- **Harness failures, not passes:** the first flow driver used a nonexistent
  editor property after installing a test-only queue hold. Its setup error left
  that hold unresolved, so a later close waited on it. A restart preflight
  correctly refused unacknowledged text. Exact recovery, retained DOM text and
  Source buffers were copied before the owned lab was restarted. This was not
  a reproduced production deadlock or plugin-provided restart recovery.
  Later attempts lacked usable map width: a truthy `iterateAllLeaves` callback
  had stopped fixture cleanup early. The passing run used a visibly laid-out
  two-pane fixture and guaranteed release of its test-only hold. The aborted
  input/focus/geometry runs are not functionality evidence.
- **NOT RUN:** physical drag/drop, trusted physical typing, real OS IME sessions,
  mobile, full disposal-history races, multi-instance/sync races, other host
  versions and broad performance or long-duration stress testing. Synthetic composition events are not an IME
  qualification. No process-restart draft recovery is claimed.

## 6. Repository checks and evidence

The latest source validation passed **354 tests in 28 files**, typecheck and
production build, ESLint, Stylelint and the full Prettier check. This is evidence
for the checked working tree, not a certificate for other Obsidian builds.

```bash
npm test -- --run
npm run build
npm run lint
npm run format:check
git diff --check
```

The first integrity regressions and transition-review failures are separate
from harness/setup errors. The local [evidence index](evidence/editing-integrity/README.md)
records those distinctions, command results, actual-host output, screenshots
and bundle hashes. As-run host drivers are retained for review, not offered as
turnkey automation against an existing vault. The expected refusal errors
can reappear before a later CDP identity line because enabling Runtime replays
console history; they are distinct from that evaluation's result and exit code.
Scratch logs are not the only retained evidence. Before final lab shutdown,
exact recovery and current buffers were copied into `snapshot-final.json`.
The owned process stopped with SIGTERM; the personal process remained running.
These agent-created fixture copies do not add persistent recovery to the plugin.

The approved bundle installation is limited to the synthetic vault. No commit,
remote write, release or personal-vault deployment is authorized by this report.
Use a backed-up synthetic copy for further qualification before considering
real notes.
