# UwUFUFU Public Game Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/play` accept public UwUFUFU song-game links, fetch and shuffle every playable selection, and remove direct selections API URL support.

**Architecture:** `UwufufuImporter` validates and fetches the public game page, extracts its hidden ID, paginates the internally derived selections endpoint, converts all playable YouTube embeds, and Fisher-Yates shuffles the complete result. `PlayInput` remains the routing boundary, and `PlaybackManager.enqueueMany` keeps enforcing the configured queue capacity after randomization.

**Tech Stack:** Node.js 22 platform `fetch`, TypeScript 6, discord.js 14, Vitest 4, ESLint 10.

## Global Constraints

- Accept only standard HTTPS URLs on exact host `www.uwufufu.com` and route `/worldcup/<slug>`.
- Reject caller-supplied `api.uwufufu.com` selections URLs.
- Extract only a positive safe integer anchored to the escaped `worldcup` object's `id` field.
- Fetch every API page required by the response `total`, using a tested page size of 1000.
- Fail the whole import if any required page is unavailable, invalid, or incomplete.
- Shuffle all playable URLs before `PlaybackManager` applies queue capacity.
- Disable redirects and apply a fresh ten-second timeout to every provider request.
- Add no runtime dependency.

---

### Task 1: Public game discovery, complete pagination, and shuffle

**Files:**
- Modify: `test/UwufufuImporter.test.ts`
- Modify: `src/importers/UwufufuImporter.ts`

**Interfaces:**
- Produces: `isUwufufuGameUrl(input: string): boolean`.
- Produces: `new UwufufuImporter(fetcher?: Fetcher, random?: () => number, pageSize?: number)`.
- Produces: `UwufufuImporter.load(publicGameUrl): Promise<{ skipped: number; urls: string[] }>`.

- [ ] **Step 1: Write and run failing public URL tests**

Use the supplied public URL as the accepted fixture. Reject wrong protocols, host lookalikes, credentials, custom ports, missing or nested slugs, and direct API URLs. Run `npm test -- test/UwufufuImporter.test.ts` and confirm failure because the public classifier does not exist.

- [ ] **Step 2: Implement and pass strict public URL classification**

Implement `isUwufufuGameUrl` with exact origin checks and `/^\/worldcup\/[^/]+\/?$/`, then rerun the importer test.

- [ ] **Step 3: Write a failing aggregation-and-shuffle test**

Return sequential fixtures for the HTML page, selections page 1 with `total: 4`, and selections page 2. Construct the importer with `random: () => 0` and `pageSize: 2`. Assert requests for:

```text
https://api.uwufufu.com/v1/selections?page=1&perPage=2&worldcupId=168808
https://api.uwufufu.com/v1/selections?page=2&perPage=2&worldcupId=168808
```

Use three playable entries and one unsupported entry. The hand-derived Fisher-Yates result for random value zero is `[second, third, first]`, with `skipped: 1`. Assert every request uses `redirect: 'error'` and a distinct abort signal.

- [ ] **Step 4: Implement ID extraction, complete pagination, conversion, and shuffle**

Match `/\\\"worldcup\\\"\s*:\s*\{\s*\\\"id\\\"\s*:\s*(\d+)/`, validate the numeric ID, fetch page 1, validate integer `total`, fetch pages through `Math.ceil(total / pageSize)`, and reject if fewer than `total` raw entries are collected. Convert all entries with the existing `youtubeWatchUrl`, then Fisher-Yates shuffle the valid URLs using the injected random function.

- [ ] **Step 5: Run the importer success test GREEN**

Run: `npm test -- test/UwufufuImporter.test.ts`

Expected: URL, pagination, shuffle, and direct-API rejection cases PASS.

- [ ] **Step 6: Add provider error regression coverage**

Cover public page HTTP failure, missing or unsafe hydration ID, API HTTP failure on any page, invalid JSON, invalid `total` or `data`, incomplete pagination, and no playable YouTube entries. Use distinct `UwUFUFU page ...` and `UwUFUFU API ...` messages.

- [ ] **Step 7: Run error tests RED, implement minimal handling, then run GREEN**

Run `npm test -- test/UwufufuImporter.test.ts` before and after the handling changes, confirming the new assertions first fail for the intended missing behavior and then pass.

- [ ] **Step 8: Commit the importer**

```bash
git add src/importers/UwufufuImporter.ts test/UwufufuImporter.test.ts docs/superpowers/specs/2026-08-19-uwufufu-public-worldcup-links-design.md
git commit -m "feat: import shuffled UwUFUFU games"
```

---

### Task 2: Route `/play` through public game links only

**Files:**
- Modify: `test/PlayInput.test.ts`
- Modify: `test/createBot.test.ts`
- Modify: `src/playback/PlayInput.ts`

**Interfaces:**
- Consumes: `isUwufufuGameUrl` and `UwufufuImporter.load(publicGameUrl)`.
- Preserves: `ResolvedPlayInput` batch behavior and `PlaybackManager.enqueueMany` queue enforcement.

- [ ] **Step 1: Write failing `/play` routing tests**

Change the `PlayInput` UwUFUFU fixture to a public game URL with HTML and complete API responses. Assert the result is the importer's shuffled batch. Add a direct API URL case that is rejected without fetching. Update the mention-prefixed `play` integration fixture to inject a real `PlayInput` with the two provider responses.

- [ ] **Step 2: Run routing tests RED**

Run: `npm test -- test/PlayInput.test.ts test/createBot.test.ts`

Expected: FAIL because `PlayInput` still imports direct API URLs and ignores public game URLs.

- [ ] **Step 3: Switch `PlayInput` to `isUwufufuGameUrl`**

Route only matching public URLs to the importer. Keep query, YouTube playlist, and single YouTube/SoundCloud behavior unchanged. Startup uses `new UwufufuImporter()` because pagination is independent of queue size.

- [ ] **Step 4: Run routing tests GREEN and commit**

Run `npm test -- test/PlayInput.test.ts test/createBot.test.ts`, then:

```bash
git add src/playback/PlayInput.ts test/PlayInput.test.ts test/createBot.test.ts
git commit -m "feat: route UwUFUFU game links through play"
```

---

### Task 3: User-facing copy, verification, and push

**Files:**
- Modify: `README.md`
- Modify: `src/commands/definitions.ts`
- Modify: `test/commandDefinitions.test.ts`
- Add: `docs/superpowers/plans/2026-08-19-uwufufu-public-game-links.md`

**Interfaces:**
- Documents: public UwUFUFU song-game input and all-selection randomization.

- [ ] **Step 1: Write and run a failing command-copy test**

Assert the serialized `/play` definition refers to an UwUFUFU game instead of a selections page. Run `npm test -- test/commandDefinitions.test.ts` and confirm the old copy fails.

- [ ] **Step 2: Update command and README copy**

Replace the API example with the supplied public song-game URL. Explain that all selections are fetched and shuffled before existing queue capacity is applied.

- [ ] **Step 3: Run focused and complete verification**

Run:

```bash
npm test -- test/commandDefinitions.test.ts
npm test
npm run lint
npm run typecheck
npm run build
git diff --check
```

Every command must exit 0.

- [ ] **Step 4: Perform a live provider smoke test**

Fetch the supplied public page, verify the extractor returns `168808`, fetch all API pages with the production page size, and confirm the raw entry count equals API `total` without printing selection content.

- [ ] **Step 5: Commit and push**

```bash
git add README.md src/commands/definitions.ts test/commandDefinitions.test.ts docs/superpowers/plans/2026-08-19-uwufufu-public-game-links.md
git commit -m "docs: explain shuffled UwUFUFU imports"
git push origin main
```
