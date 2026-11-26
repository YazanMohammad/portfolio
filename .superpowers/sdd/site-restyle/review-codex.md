# Cross-family review (Codex): 73e9d41..6c59b73

**Verdict: Fix first. Critical: 0. Important: 3. Minor: 4.**

Reviewed the requested diff excluding pnpm-lock.yaml, the final implementations and relevant callers/tests, and all six supplied Claude reviews. Findings below are additional missed cases, not a restatement of their existing open lists. HEAD verified as `6c59b73faa86e2b30444a3969f1493b367b71d59`.

## Critical

None found.

## Important

### I1 — Admin title cleanup overwrites the incoming public page's title
- **Where:** `src/components/admin/useAdminTitle.ts:23-29`; public declarative title consumer: `src/pages/site/Home.tsx:20` (Project uses the same React title mechanism).
- **Failure:** The cleanup unconditionally assigns the title captured before the admin mounted. React can already have committed the incoming public page's hoisted `<title>` before passive effect cleanup runs, so leaving admin overwrites the new page title with an unrelated previous one. This is separate from the earlier finding about missing admin titles: the new restoration code introduces this transition regression.
- **Executed reproduction:** A JSDOM/React 19.1 root using the actual `useAdminTitle` hook started with `Home`, mounted an admin component, then replaced it with a public component rendering `<title>Specific project</title>`. Output: `admin title: Projects · Admin`, then `public title after transition: Home`. The head contained `<title>Home</title><title>Projects · Admin</title>` afterward.
- **Concrete fix:** Use declarative React `<title>` ownership for admin pages/login too, rather than unconditionally restoring document.title in a passive cleanup. Add a transition test that mounts public A → admin → public B and asserts public B's title after effects settle; the isolated set/restore test does not exercise competing React ownership.

### I2 — The JSON cap still reads and allocates the entire unknown-length body
- **Where:** `server/http.ts:52-56`.
- **Failure:** The Content-Length precheck helps only when an over-cap length is supplied. Without it (or with an understated value), `req.text()` drains the entire stream before the size check. The subsequent TextEncoder also allocates a complete encoded copy. Thus the advertised cap rejects the payload eventually but does not bound resource consumption while reading; a slow/oversized stream is not stopped at the cap. This resource-enforcement gap was not covered by the previous cap/error-message findings.
- **Executed reproduction:** Called the actual `readJson` with a 1,024-byte cap and a Request backed by eight 32,768-byte chunks, without Content-Length. It returned `too_large`/413 only after **262,144 bytes** had been read, with the stream's cancel callback **never called**.
- **Concrete fix:** Read `req.body` with a reader, accumulate raw Uint8Array byte lengths, cancel and throw 413 as soon as the limit is exceeded, and decode only the bounded accepted chunks. Keep the declared-length fast path. Test unknown-length and understated-length streams with pull/cancel spies, asserting that the reader stops early, not merely that the final status is 413.

### I3 — Default unread-message flow invalidates the saved focus-return element
- **Where:** `src/components/admin/messages/MessageView.tsx:21,73`; `src/pages/admin/messages.tsx:13,45-48`.
- **Failure:** On mobile, opening an unread message stores its list button in `opener`. Automatic marking-read removes that button from the default Unread folder. Closing the sheet then finds a disconnected opener and provides no fallback; there is no SheetTrigger either. Focus falls to BODY. The newly added return code therefore misses the normal default-folder path, although the earlier review accepted message-sheet focus return as addressed. Deleting a message or archiving it out of the selected folder has the same invalidation risk.
- **Executed reproduction:** Mounted the real `Messages` page with the real query/mutation hooks and mobile matchMedia, using in-memory fetch responses that remove a message from the unread response after PATCH. Opened the row and closed its sheet. Output: `opener connected after auto-read: false`, `focus after close: BODY`.
- **Concrete fix:** Always prevent default close autofocus and resolve a live target: the saved row if connected, otherwise a persistent focusable Inbox heading or list container. Supply that fallback from Messages (for example PageHeader titleId/titleRef). Test open-unread → auto-read/refetch removes row → close, as well as delete/archive and a deep-linked sheet with no row opener.

## Minor

### M1 — The dead-selector CSS guard silently ignores nested rules and selector relationships
- **Where:** `src/components/admin/css.test.ts:28-31`.
- The brace-stripping regex consumes an @media opening brace through the first nested rule's closing brace, erasing that rule's selector. The subsequent check only tests whether each individual class name occurs anywhere as a substring of source, so it cannot catch a dead relationship such as `.admin-live-preview > .site-shell` when both classes still exist separately. Comments and longer class names can also satisfy source.includes.
- **Executed check using the guard's exact algorithm:** `@media(max-width:767px){.never-used-sentinel{display:block;}}` produced `selectors: [], dead: []`; the now-invalid `.admin-live-preview > .site-shell` relationship also produced `dead: []` against current source. The latter is exactly the kind of regression this fix series encountered.
- **Concrete fix:** Parse CSS with a rule-aware parser, including nested at-rules, and compare exact class tokens rather than raw substring presence. Treat that as a class-reference check, not selector liveness; verify important selector/markup relationships through rendered DOM or browser computed-style assertions. Add synthetic negative fixtures proving the guard itself fails for unused nested classes and missing preview relationships.

### M2 — Preview tests do not protect dynamic height updates or observer cleanup
- **Where:** `src/pages/admin/settings.test.tsx:112-127` (the `preview scale comes from the container width and reserves height` test), plus `:130-139` (cqw source guard); production effect: `src/components/admin/SitePreview.tsx:20-28`.
- The test gives every element a fixed mocked offsetHeight, invokes both observer callbacks with the same viewport target, and asserts only scale after notification. The disconnect method is a no-op. Removing height observation or both disconnect calls would leave its assertions passing. The separate cqw test checks literal CSS source, not resolved layout.
- **Concrete fix:** Track each observer's observed element, deliver width and stage-height notifications independently, assert updated reserved height after each, and explicitly unmount and assert both disconnect calls. Keep a browser computed-size check for the cqw/transform interaction. Current production code does disconnect both observers; this finding concerns missing regression protection, not a claimed leak or loop.

### M3 — The maximum-size project acceptance test also accepts server failures
- **Where:** `tests/api/admin-collection.unit.test.ts:159-165`.
- The test named `accepts a maximum-length multibyte project body` asserts only that status is neither 413 nor 400. A 404 or 500 therefore passes; broken persistence can masquerade as accepted valid input.
- **Concrete fix:** Assert the endpoint's exact success status (201 for POST), the successful response body, and that the expected project write received the maximum-size content. Keep the independent over-cap 413 test.

### M4 — Accent-text coverage would pass if hue derivation were replaced with constant white
- **Where:** `src/lib/admin/accent-text.test.ts:6-10`; implementation: `src/lib/admin/accent-text.ts:17-23`.
- All assertions are lower contrast bounds. Replacing adminAccentText with `return "#ffffff"` would satisfy them while removing the feature's tone-preserving derivation. The rail/shape test repeats only the contrast bound for the helper.
- **Concrete fix:** Also assert that already-sufficient accents remain exactly derivePalette(hue).accent, that insufficient accents are lifted, and that representative distinct sufficient hues retain distinct outputs. The current implementation passed all hue contrast checks; no current contrast or public-palette regression was found.

## Verification and limits

- `pnpm test` ran once: **95 files passed, 13 skipped; 1,227 tests passed, 219 skipped; exit 0**. Duration reported: 50.83 seconds. Skipped DB-dependent coverage is not a DB verification claim.
- `pnpm typecheck` ran once: **exit 0**.
- Additional reproductions were in-memory Node/JSDOM probes; no server, DB suite, subagent, or external network/API write was used. Fetch responses in the message reproduction were explicit local fixtures, not live API evidence. The first focus probe needed the missing JSDOM NodeFilter global; the corrected component probe and then the real Messages-page probe both completed successfully.
- Reorder rollback/refetch, guard/shortcut/dialog interaction, hooks/effect cleanup, keys, preview sizing, settings sanitization/merge and accent wiring were examined. Already-reported Ctrl/Cmd+S-in-dialog and other existing findings are intentionally not duplicated. The preview scale reads width and untransformed stage height, and both observers have cleanup; no additional concrete observer feedback loop or conditional hook bug was established.
- No application source was changed. The only created file is this review. Live browser/real API checks remain with the separate agent; their results are not claimed here.

## Fix results

- Fixed I1 with React-owned declarative admin/login titles. The public A → admin → public B regression failed before the change and passes afterward; no passive cleanup can overwrite the incoming public title.
- Fixed I2 with byte-counted reader chunks, immediate reader cancellation at the first over-cap chunk, bounded decoding, and lock cleanup. Unknown-length and understated-length tests failed RED (20 pulls instead of 2), then passed GREEN with exactly two 8-byte pulls at a 10-byte cap and a cancellation call. Split UTF-8 input is covered.
- Fixed I3 with a persistent, focusable Inbox heading fallback. Mobile regressions cover auto-read removing the Unread row, archive, delete, deep link, and a still-connected opener. Four missing-target cases failed RED; all five pass after the fix. Focus resolves the current ref at close rather than a captured removed element.
- M1: CSSOM recursively walks nested rules; TypeScript-scanned application string tokens exclude comments and longer-class false positives. Synthetic negative fixtures protect the guard; rendered preview markup checks actual selector relationships, including a negative fixture for the obsolete direct-child relationship.
- M2: ResizeObserver tests track independent observed targets, change reserved height after width and stage-height notifications independently, and assert both disconnect calls on unmount. The live E2E checks resolved preview font size (cqw), container type, visual transformed width and reserved height.
- M3: maximum multibyte project POST now asserts exactly 201, the complete successful body and the exact maximum-size write.
- M4: accents with sufficient contrast must equal derivePalette(hue).accent; insufficient accents must be lifted without becoming constant white, and sufficient hues must retain distinct outputs.
- Mutation checks all failed as intended: bypassed nested-class guard, obsolete preview selector relationship, removed stage-height observation, removed both observer disconnects, POST returning 500, and constant-white accent derivation. All mutations were reverted; production files outside the fixes are unchanged.
- Landed the supplied E2E patch with accessible tab/switch assertions and a visible label-text click rather than an ID-bound label selector. No clone-only E2E patch remains.
- Gates: `pnpm test`: **95 passed / 13 skipped files; 1,238 passed / 219 skipped tests**. `pnpm typecheck` and `pnpm build`: **exit 0**. `env -u DATABASE_URL pnpm test:db` ran **once**, on the guarded TEST target: **31 files passed; 751 tests passed / 1 skipped**.
- Committed application revision was fetched and checked out in the live clone with its local-only Netlify port config retained. TEST bindings were checked without printing secret values. `env -u DATABASE_URL pnpm dev` + `pnpm e2e` with a private temporary password: **2 passed, 39.0s**, including computed preview checks and read-back of restored settings. No new dependency, push, production branch operation, or clone-only spec modification.
- **Remaining verification limitation:** authenticated slow chunked PUT through Netlify dev returned **413 after 10.71s**, only after all **50 × 32,768-byte chunks** and EOF. The requested end-to-end early-413 criterion therefore **did not pass**. Netlify CLI's installed `dist/lib/functions/server.js:57-61,95-99,134-145` accepts the Express-parsed complete body and creates a buffered invocation event before application code runs. The application reader now cancels early when given a stream (proven by the RED/GREEN tests), but cannot reject bytes before the local platform delivers the Request. No upstream adapter/dependency patch or alternate server is claimed as a passing Netlify check.
- Cleanup: stopped Netlify/Vite process trees using taskkill; TCP probes verified ports **8890 and 5174 free on IPv4 and IPv6**. Deleted the temporary plaintext password and verified absence. Scratch logs: `portfolio-fix-red.log`, `portfolio-fix-green.log`, `portfolio-minor.log`, `portfolio-mutation-0.log` through `portfolio-mutation-5.log`, `portfolio-final-unit.log`, `portfolio-final-db.log`, `portfolio-fix-dev.log`, `portfolio-e2e.log`, `portfolio-early413.json`.

