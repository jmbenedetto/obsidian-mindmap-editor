# Project log

## 1. 2026-11-01, editing-integrity first gate

- Verified `prom2.local`, account `jmb`, resolved checkout
  `/Users/jmb/code/obsidian-mindmap-editor`, fork origin, clean tracked files and
  exact baseline `fb43537552c6712023191e8514f5f334f82e200a`.
- Created ordinary local branch `feat/editing-integrity` from `master`. Preserved
  pre-existing untracked `.agents/tmp/` and `.pi/` contents. No worktree or commit.
- Read applicable instructions, documented npm toolchain, map/editor selection
  and persistence paths, the pinned public Obsidian API declarations and the
  installed application's code archive. No vault or Obsidian profile was read.
- Created scratch authority probes and an owned T3 integrated terminal under the
  current session's temporary directory. The initial three candidate barrier
  assertions failed against source-extracted Obsidian 1.14.5 methods with delayed
  storage mocks. No Obsidian process was launched.
- Created `test/probes/authority-handover.mjs` as a durable, version/hash-pinned
  reproduction, including uncontested controls. It extracts installed methods
  at execution time and does not redistribute the application's source code.
- Added `test/probes` to ESLint's hand-run harness exclusions, like `test/e2e`.
  The probe uses Node's test runner and is not part of the regular Vitest suite.
- Created `docs/INTEGRITY.md` with the required behavior contract, rejected
  authority candidate, evidence boundaries, unresolved implementation gate and
  requested synthetic-only host authorization.
- Plugin source, MIT notices and existing fixtures were not changed. No plugin
  installation, vault changes, sync changes, agents, remote writes or releases.
- Final durable probe result: three uncontested controls PASS, three candidate
  handover assertions FAIL, exit 1. Probe and ESLint configuration syntax checks,
  `git diff --check` and source/license/dependency unchanged checks PASS.
- Initial implementation was BLOCKED at handover. The user subsequently approved
  a fresh synthetic-only vault/profile in the session directory. The new process
  uses explicit user-data-dir and mock Keychain options; the existing Obsidian
  process and its vaults were left untouched. The first lab launch hung in
  Keychain code and was terminated by its exact owned PID before replacement.
- Installed locked development dependencies with `npm ci`; no audit fixes or
  dependency manifest changes. Production builds write only the checkout root.
- Created `test/integrity.test.ts` against the actual inline, Undo and move
  methods. Before the patch, five assertions failed for final labels,
  A-to-B-to-A, interleaved Undo and literal fenced headings; uncontested Undo
  passed. An initial DOM-stub error was corrected before recording that result.
- Added scoped source revocation and an inert text preview in
  `src/obsidian/markdown/exclusive-edit.ts`, with version/state gates and
  app-lifetime recovery records. Added its focused authority tests.
- Changed map writes to a serialized exact-baseline process path, revision-aware
  inline acknowledgement, joined finalization, atomic Undo and selection/editor
  gates. Added shared source-context parsing and structural move validation.
- Added task-scratch exclusions to ESLint/Prettier, a recovery textarea class in
  `styles.css`, and minimal ItemView/API exports in the unit-test host stub.
  Updated the old write-ops test to assert refusal for invalid heading-onto-list
  moves rather than treating them as supported hierarchy.
- First focused post-patch run: 16 tests PASS, build/typecheck PASS. Initial full
  validation exposed missing test host exports, an invalid move expectation,
  and in-scope lint/style issues; these are being addressed before final checks.
  `docs/INTEGRITY.md` still records the initial blocked gate and will be updated
  with final scope, evidence and remaining limitations.
- Added `test/structural-integrity.test.ts` and `test/persistence-queue.test.ts`.
  New byte comparisons exposed eight final-newline failures before the EOF
  sentinel correction. A separate overflow case initially targeted its own
  descendant; that fixture was corrected rather than counted as an overflow bug.
- Added failing regressions for input remaining live during handover, source
  composition, late buffer changes, stale errors, reentrant finish, detached-DOM
  draft capture, indented-code/list ambiguity and inline list comments. Added
  synchronous input inertness, interruption recovery, per-request status and
  stronger map/file/session/render-generation checks.
- Full intermediate validation: 321 tests PASS; typecheck/build, ESLint,
  Stylelint and full Prettier check PASS. Later review refinements require a new
  complete check; this count does not certify the final working tree.
- Installed a hashed test bundle only into the fresh synthetic lab and enabled
  community plugins only in that isolated profile. The first enable attempt
  merely persisted its enabled ID because the lab was in Restricted mode; the
  confirmed retry loaded the plugin. No personal installation was changed.
- Live gate setup attempts were INCONCLUSIVE: the first buffer autosaved while
  the map opened; another harness incorrectly assumed `requestSave.cancel` was
  exposed. Host inspection confirmed a private debouncer behind requestSave.
  Neither attempt is counted as a successful handover or an authority blocker.
- Backed up the original blocked report at
  `docs/.backup/INTEGRITY.before-approved-lab.md`. Revised `README.md` to state
  the experimental host/mode restrictions, one-step Undo without Redo, recovery
  limits and body-note editing outside exclusive mode. The add-note action now
  refuses instead of writing a blank line then reopening an unsafe editor.
- Verified the production handover in the actual isolated 1.14.5 host for
  genuinely pending Unicode and empty buffers. Both were dirty, idle-save
  states with the old baseline still present at acquisition. Transfer, inert
  preview, old save/requestSave calls, later map commit and selection passed.
- Host load/transition inspection exposed `WorkspaceLeaf.working` as the
  transition indicator. Five new model assertions failed before idle-pane and
  inert-transition acknowledgement guards. The fix retains original and
  context-changing snapshots separately rather than replacing the former.
- Subsequent complete source validation: 352 tests PASS; build/typecheck,
  ESLint, Stylelint and full Prettier check PASS. Installed that exact hashed
  bundle only in the authorized lab and repeated the pending-buffer gate.
- A live-flow driver used a nonexistent editor property after creating a
  test-only per-view queue hold. The setup abort left its resolver unreachable;
  a later close waited on that artificial hold. It is not a production
  deadlock reproduction or a successful live structural/label test. The first
  restart preflight refused because recovery contained unacknowledged text.
- Read-only inspection also showed a teardown draft becoming empty while its
  retained input text was Branch and disk was unchanged. Two connected-reset
  regressions then failed before the fix. Label intent now comes from captured
  input/composition events, not a fresh teardown DOM read. The exact input and
  recovery snapshots were preserved before controlled lab teardown.
- Rewrote `docs/INTEGRITY.md` with the authority contract, source-context/EOL
  boundaries, evidence layers, rejected candidate and app-lifetime (not
  restart-persistent) recovery scope. Final live flows and evidence collection
  remain separate from the completed intermediate checks.
- Copied exact fixture recovery, retained DOM and Markdown buffers before
  replacing only the owned lab process (47261 → 40659). The personal process
  was not controlled. This agent-created copy is not plugin restart recovery.
- Latest complete source validation: 354 tests in 28 files PASS, with build/
  typecheck, ESLint, Stylelint and full Prettier PASS. The additional connected-
  reset assertions are included in this count.
- Actual-host positive flow passed: actual header acquisition, final A→B→A
  while a test-only per-view queue was pending, heading/list sibling reorder,
  heading/list reparenting, multi-node movement, literal/description bytes and
  uncontested Undo. The first geometry retries were invalid: a truthy leaf
  iteration callback stopped cleanup early. The passing fixture had usable
  layout and an externally recoverable hold released in finally.
- Actual-host negative flow passed its safe-refusal assertions: conflicting
  Undo retained its frozen record and outside marker; a separately reacquired
  label session retained exact raw Unicode/multiline input after another
  outside marker. Release loaded a different writable Source view with the
  actual disk text; view/plugin reload retained recovery and the real modal
  exposed that exact raw draft. These are not counted as successful edits.
- Repeated the pending Unicode/empty-buffer gate on the final built bundle,
  including old save/requestSave calls and supplementary 2.5-second checks.
  The observation delay is not the ownership acknowledgement.
- Verified map-only editing after acknowledged handover and inert-preview
  closure. Acquisition without a Source pane was first refused as documented;
  the next driver checked that refusal had not changed the fixture. Added the
  distinction to README and the integrity contract.
- Added `docs/evidence/editing-integrity/README.md` to distinguish regressions,
  actual-host successes, safe refusals, invalid harness runs and NOT RUN scope.
  Durable logs, as-run drivers, screenshots and hashes are collected there;
  no vendor source or compiled plugin bundle is redistributed.
- Verified normal map-only autosave with the recovery modal actually closed
  and DOM focus retained before/after the autosave. The first modal-close
  attempt aborted before editing; the passing run used a scoped CDP Escape.
  Label input remains synthetic, not a physical typing or OS IME test.
- Copied the final app-memory recovery and buffers into the durable evidence
  directory before shutdown. The final guard verified the exact retained raw
  failed draft and acknowledged active-map data. Stopped only lab PID 40659
  with SIGTERM; personal PID 423 was still running. No task file was deleted.
- Excluded only the archived evidence directory from ESLint: its retained
  renderer snippets are function bodies, not standalone plugin modules. They
  remain exact as-run copies rather than being rewritten to satisfy module lint.
- The user subsequently authorized publishing this version as a PR to
  `jmbenedetto/obsidian-mindmap-editor`, targeting its `master` branch. The
  earlier no-publication statements in archived evidence describe validation
  before this authorization. Publication excludes `.agents/tmp/`, `.pi/`,
  `docs/.backup/` and generated plugin bundles. No release or personal-vault
  deployment is authorized.
- Publication checks passed the build, ESLint, Stylelint, Prettier and all
  354 tests. Staging exposed whitespace in verbatim archived console output
  that was untracked during earlier diff checks. Added `.gitattributes` rules
  only for evidence `.log`/`.tap` files, preserving their exact checksummed
  bytes without disabling whitespace checks for source or test files.
