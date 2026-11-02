# Local editing-integrity evidence

## 1. Reading guide

This is local, synthetic-fixture evidence for the experimental branch, not a
production qualification. See [the contract](../../INTEGRITY.md).

- `validation.json` records the baseline, branch, command outcomes, source and
  installed-bundle hashes. `SHA256SUMS` checks this evidence package.
- `all-tests.log`, `build-patch.log`, `lint.log` and `format.log` are the final
  repository checks: 354 tests in 28 files, typecheck/build, ESLint, Stylelint
  and Prettier.
- `red-*.log` retain genuine pre-fix assertions. `authority-final.tap` is a
  deliberately red extracted-host diagnostic, not a failed regular test run.
- `live-*.json` contain actual-host results and returned actual Markdown.
  Host drivers use actual disk, production methods and synthetic DOM events.
  They are not physical-input or real-IME evidence.

## 2. Regression evidence

- `red-integrity.log`: F01 final intent/A→B→A and F02 interleaved Undo failures.
- `red-structural.log`: literal heading/fence and structural preservation cases.
- `red-disposal.log`: detached-DOM capture lost the last exact raw draft.
- `red-connected-reset.log`: an unobserved connected DOM reset became an empty
  label, with and without earlier input. Both assertions failed before the fix.
- `red-transition.log`: five source/owner/transition-context assertions failed
  before idle-leaf and transition-acknowledgement guards.
- `authority-final.tap`: three controls pass and three public-save/unload drain
  assertions fail, exit 1. This rejects that candidate only. It executes
  extracted installed methods in a VM with mock storage, not Electron.

## 3. Actual-host evidence

- `live-gate-verified.json`: final bundle transfers genuinely pending Unicode
  and empty buffers. It verifies revocation, plain inert preview, later map
  commit, old save/requestSave calls and selection without reopening Markdown.
  Each case adds 2.5 seconds of observation; that delay is not the authority gate.
- `live-flows.json`: actual header acquisition and final A→B→A acknowledgement
  while a per-view queue is deliberately held, plus successful heading/list
  reorder, reparenting, multi-node movement, literal preservation and Undo.
- `live-negative.json`: conflicting Undo retains its frozen record and marker;
  a separate conflicting label retains its raw draft. Fresh writable Source,
  view/plugin reload recovery and the actual recovery modal are checked.
  These are safe refusals, not successful editing/Undo functionality.
- `live-map-only-after-handover.json`: the inert preview is closed only after
  successful handover, then a Unicode label commits with zero source panes.
  `live-map-only-visible.json` additionally verifies normal autosave while
  retaining actual DOM focus, then final acknowledgement.
- `live-map-only.log`: the earlier driver attempted acquisition without a
  loaded Source pane and exited 1 on the documented refusal. The subsequent
  handover driver first verified that this had left the file unchanged. It is
  not counted as a successful acquisition or an ordinary-suite failure.
- `map-flow.png`, `map-only.png` and `recovery-modal.png`: renderer snapshots of
  the actual owned synthetic host. Source/JSON checks establish exact text;
  screenshots do not establish physical typing, dragging or OS IME behavior.

## 4. Invalid harness runs and teardown

The original flow setup used a nonexistent editor property after holding a
per-view queue. Its resolver was lost and the next close waited on that test
hold. `live-flows-setup.log`, `live-flows-timeout.log` and `pre-restart.log`
retain the failures. The restart preflight correctly refused pending input.
`snapshot-before-restart.json` preserves exact recovery, retained DOM text and
Markdown buffers before the owned process was replaced. This agent-created
copy is not plugin-provided restart recovery. `snapshot-final.json` similarly
preserves the final app-memory drafts before owned-host shutdown; `lab-stop.json`
records SIGTERM of that exact profile/PID and the still-running personal PID.

Later focus/geometry attempts used an unusably narrow map. A truthy
`iterateAllLeaves` callback stopped cleanup early. The passing driver uses a
void callback, a visibly laid-out fixture and an externally recoverable queue
resolver released in `finally`. Aborted runs are not passes. Runtime enable can
replay the expected negative-test console errors before a later identity line;
use that evaluation's result and exit code, not console history alone.

An initial attempt to close the recovery modal did not establish that it had
closed and aborted before editing. The passing visible autosave run closed it
with a CDP Escape, checked removal and verified editor focus before/after input.
The final `map-only.png` shows that unobstructed state.

## 5. Reproduction and limits

From the repository root:

```bash
npm ci
npm test -- --run
npm run build
npm run lint
npm run format:check
```

The extracted-host diagnostic is documented in `docs/INTEGRITY.md` and requires
the exact installed Obsidian archive hash. Vendor source is not redistributed.

`drivers/` retains the as-run host scripts and identity-checking CDP helper for
inspection. These are not a turnkey launcher: the helper expects the approved
fresh synthetic HOME/profile/vault metadata. Do not point it at an existing
vault, replay a timed-out mutation or reuse fixture names. A new live run needs
its own explicitly approved isolated host and fresh fixture names.

Physical drag/drop, trusted typing, real OS IME, mobile, other host versions,
full disposal-history races, multi-instance/sync races and long-duration stress
remain unqualified. Recovery is app-lifetime memory, not a persistent journal.
No commit, push, release or personal-vault installation was performed.
