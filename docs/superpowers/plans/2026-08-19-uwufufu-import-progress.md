# UwUFUFU Import Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Edit one Discord bot reply with live, throttled progress while UwUFUFU tracks are inspected and queued.

**Architecture:** Tag resolved batches by provider, add provider-neutral progress snapshots to `PlaybackManager.enqueueMany`, and keep Discord formatting/edit throttling in a focused bot helper. Slash commands edit their deferred reply; mention commands create one progress reply and edit it through completion.

**Tech Stack:** Node.js 22, TypeScript 6, discord.js 14, Vitest 4, ESLint 10.

## Global Constraints

- Update one message in place; do not send separate progress messages.
- Show complete-game totals, queued count, and skipped count.
- Publish intermediate edits at most once every two seconds and always allow terminal progress.
- Progress-edit failures must not cancel playback.
- Enable progress only for UwUFUFU batches.
- Preserve final success and error messages.
- Add no runtime dependency.

---

### Task 1: Playback import progress snapshots

**Files:**
- Modify: `src/playback/PlaybackManager.ts`
- Modify: `test/PlaybackManager.test.ts`

**Interfaces:**
- Produces: `ImportProgress = { processed: number; total: number; added: number; skipped: number }`.
- Produces: `ImportProgressCallback = (progress: ImportProgress) => void | Promise<void>`.
- Extends: `enqueueMany(member, channel, urls, initialSkipped?, onProgress?)`.

- [ ] **Step 1: Write the failing snapshot test**

Add a test using three URLs and `initialSkipped = 1`. Make inspection succeed, fail, then succeed. Capture callback values and assert:

```ts
[
  { processed: 2, total: 4, added: 1, skipped: 1 },
  { processed: 3, total: 4, added: 1, skipped: 2 },
  { processed: 4, total: 4, added: 2, skipped: 2 },
]
```

Add an overflow case proving the terminal snapshot accounts for every uninspected URL as skipped.

- [ ] **Step 2: Run the playback test RED**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `enqueueMany` does not publish progress.

- [ ] **Step 3: Implement progress reporting**

Export the two interfaces, calculate `total = initialSkipped + urls.length`, and publish a snapshot after each success/failure and after overflow accounting. Await asynchronous callbacks; the Discord reporter introduced in Task 2 owns edit-failure recovery.

- [ ] **Step 4: Run the playback test GREEN**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: all playback tests PASS.

---

### Task 2: Provider tagging and throttled message text

**Files:**
- Modify: `src/playback/PlayInput.ts`
- Modify: `test/PlayInput.test.ts`
- Create: `src/bot/importProgress.ts`
- Create: `test/importProgress.test.ts`

**Interfaces:**
- Adds to batch input: `source: 'uwufufu' | 'youtube-playlist'`.
- Produces: `uwufufuImportStart(total: number): string`.
- Produces: `createImportProgressReporter(edit, logger, now?, minIntervalMs?): ImportProgressCallback`.

- [ ] **Step 1: Write failing source-tag tests**

Update `PlayInput` expectations so a public game resolves with `source: 'uwufufu'` and a YouTube playlist resolves with `source: 'youtube-playlist'`.

- [ ] **Step 2: Run the input test RED, add source tags, then run GREEN**

Run `npm test -- test/PlayInput.test.ts` before and after the minimal `PlayInput` change.

- [ ] **Step 3: Write failing progress-text tests**

Assert start text is `Found 256 UwUFUFU songs. Checking tracks…`. With a fake clock, prove a progress snapshot before two seconds is suppressed, one at two seconds edits to `UwUFUFU import: checked 25/256 • queued 24 • skipped 1`, terminal progress bypasses the throttle, and an edit rejection is logged without rejecting the reporter.

- [ ] **Step 4: Run helper tests RED, implement helper, then run GREEN**

Run `npm test -- test/importProgress.test.ts` before and after creating `src/bot/importProgress.ts`.

---

### Task 3: Edit slash and mention replies in place

**Files:**
- Modify: `src/bot/createBot.ts`
- Modify: `test/createBot.test.ts`
- Modify: `README.md`

**Interfaces:**
- Extends internal `runPlayInput(..., onProgress?)` and passes progress only to UwUFUFU `enqueueMany` calls.
- Uses the same final-result string returned by `PlaybackManager`.

- [ ] **Step 1: Write failing slash progress test**

Resolve an UwUFUFU batch and make the fake `enqueueMany` invoke its callback. Assert the deferred reply is first edited with start text, then progress text, then the existing final result. Assert a YouTube playlist batch receives no progress callback.

- [ ] **Step 2: Write failing mention progress test**

Make `message.reply` return a fake bot message with `edit`. Assert UwUFUFU import creates one reply containing start text and edits that reply for progress and final output; `message.reply` remains called once.

- [ ] **Step 3: Run bot tests RED**

Run: `npm test -- test/createBot.test.ts`

Expected: FAIL because the bot does not yet provide a progress callback or edit a mention reply.

- [ ] **Step 4: Implement slash and mention message editing**

For UwUFUFU batches, calculate `total = urls.length + skipped`, publish the start text, create a throttled reporter, pass it to `runPlayInput`, and replace the same message with the final result. Keep all non-UwUFUFU paths unchanged. Document the edited progress message in the README.

- [ ] **Step 5: Run bot tests GREEN**

Run: `npm test -- test/createBot.test.ts`

Expected: all bot tests PASS.

---

### Task 4: Verification, commit, and push

**Files:**
- Add: `docs/superpowers/plans/2026-08-19-uwufufu-import-progress.md`

- [ ] **Step 1: Run complete verification**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Every command must exit 0.

- [ ] **Step 2: Commit and push**

```bash
git add README.md src/bot/createBot.ts src/bot/importProgress.ts src/playback/PlaybackManager.ts src/playback/PlayInput.ts test/PlaybackManager.test.ts test/PlayInput.test.ts test/createBot.test.ts test/importProgress.test.ts docs/superpowers/plans/2026-08-19-uwufufu-import-progress.md
git commit -m "feat: show UwUFUFU import progress"
git push origin main
```
