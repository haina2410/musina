# UwUFUFU Queue Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/play <url>` recognize an UwUFUFU selections API URL and add the usable YouTube tracks from that response page to the guild queue in response order.

**Architecture:** Add a provider-specific importer that owns strict UwUFUFU URL validation, HTTP fetching, payload validation, and YouTube embed conversion. Add an ordered bulk operation to `PlaybackManager`, then route `/play` through the importer only when the input is the supported API URL; ordinary YouTube and SoundCloud behavior remains unchanged.

**Tech Stack:** Node.js 22 platform `fetch`, TypeScript 6, discord.js 14, Vitest 4, ESLint 10.

## Global Constraints

- Fetch only standard HTTPS URLs whose exact host is `api.uwufufu.com` and exact path is `/v1/selections`.
- Import only the `data` array returned by the supplied page; never request additional pages.
- Disable redirects and abort the provider request after 10 seconds.
- Preserve response order while skipping invalid, unsupported, or unresolvable entries.
- Apply `MAX_QUEUE_SIZE` to upcoming tracks; the current track remains a separate slot.
- Keep `/play` backward-compatible with existing YouTube and SoundCloud URLs.
- Add no runtime dependency.

---

### Task 1: UwUFUFU selections importer

**Files:**
- Create: `src/importers/UwufufuImporter.ts`
- Create: `test/UwufufuImporter.test.ts`

**Interfaces:**
- Consumes: platform `fetch(input, init)` and `URL`.
- Produces: `isUwufufuSelectionsUrl(input: string): boolean` and `UwufufuImporter.load(input: string): Promise<{ skipped: number; urls: string[] }>`.

- [ ] **Step 1: Write failing URL-policy tests**

Create `test/UwufufuImporter.test.ts` with cases proving that only the exact HTTPS endpoint is classified as an import URL:

```ts
import { describe, expect, it, vi } from 'vitest';
import { UwufufuImporter, isUwufufuSelectionsUrl } from '../src/importers/UwufufuImporter.js';

describe('isUwufufuSelectionsUrl', () => {
  it('accepts the selections API endpoint with pagination parameters', () => {
    expect(isUwufufuSelectionsUrl(
      'https://api.uwufufu.com/v1/selections?page=1&perPage=10&worldcupId=168808',
    )).toBe(true);
  });

  it.each([
    'http://api.uwufufu.com/v1/selections?page=1',
    'https://api.uwufufu.com.evil.example/v1/selections?page=1',
    'https://user:pass@api.uwufufu.com/v1/selections?page=1',
    'https://api.uwufufu.com:444/v1/selections?page=1',
    'https://api.uwufufu.com/v1/worldcups/168808',
    'not a url',
  ])('rejects unsupported input %s', (input) => {
    expect(isUwufufuSelectionsUrl(input)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the URL-policy tests and verify RED**

Run: `npm test -- test/UwufufuImporter.test.ts`

Expected: FAIL because `src/importers/UwufufuImporter.ts` does not exist.

- [ ] **Step 3: Add the minimal URL classifier**

Create `src/importers/UwufufuImporter.ts` with the exact-origin checks:

```ts
export function isUwufufuSelectionsUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:'
      && url.hostname === 'api.uwufufu.com'
      && url.pathname === '/v1/selections'
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the URL-policy tests and verify GREEN**

Run: `npm test -- test/UwufufuImporter.test.ts`

Expected: all `isUwufufuSelectionsUrl` cases PASS.

- [ ] **Step 5: Add failing response parsing and provider-error tests**

Append tests that inject a fetch function and assert real returned URLs:

```ts
describe('UwufufuImporter', () => {
  it('returns valid YouTube embed entries in response order', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      page: 1,
      perPage: 4,
      total: 256,
      data: [
        { videoUrl: 'https://www.youtube.com/embed/FN7ALfpGxiI' },
        { videoUrl: 'https://example.com/embed/not-youtube' },
        { name: 'missing video' },
        { videoUrl: 'https://www.youtube.com/embed/30KI5SuECuc' },
      ],
    }), { status: 200 }));
    const importer = new UwufufuImporter(fetcher);

    await expect(importer.load(
      'https://api.uwufufu.com/v1/selections?page=1&perPage=4&worldcupId=168808',
    )).resolves.toEqual({
      skipped: 2,
      urls: [
        'https://www.youtube.com/watch?v=FN7ALfpGxiI',
        'https://www.youtube.com/watch?v=30KI5SuECuc',
      ],
    });
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects a non-success response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
    await expect(new UwufufuImporter(fetcher).load(
      'https://api.uwufufu.com/v1/selections?page=1',
    )).rejects.toThrow('UwUFUFU returned HTTP 503');
  });

  it.each([
    ['an unsupported URL', 'https://example.com/v1/selections'],
    ['an object without data', 'https://api.uwufufu.com/v1/selections?page=1'],
  ])('rejects %s', async (name, input) => {
    void name;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    await expect(new UwufufuImporter(fetcher).load(input)).rejects.toThrow();
  });

  it('rejects a page without usable YouTube entries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ videoUrl: 'https://example.com/not-playable' }],
    }), { status: 200 }));
    await expect(new UwufufuImporter(fetcher).load(
      'https://api.uwufufu.com/v1/selections?page=1',
    )).rejects.toThrow('no playable YouTube entries');
  });
});
```

- [ ] **Step 6: Run the importer tests and verify RED**

Run: `npm test -- test/UwufufuImporter.test.ts`

Expected: FAIL because `UwufufuImporter` and `load` are not implemented.

- [ ] **Step 7: Implement minimal fetching and parsing**

Complete `src/importers/UwufufuImporter.ts` with:

```ts
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

interface SelectionPayload {
  data?: unknown;
}

interface ImportedSelectionPage {
  skipped: number;
  urls: string[];
}

function youtubeWatchUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const match = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || !match?.[1]) return null;
    return `https://www.youtube.com/watch?v=${match[1]}`;
  } catch {
    return null;
  }
}

export class UwufufuImporter {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async load(input: string): Promise<ImportedSelectionPage> {
    if (!isUwufufuSelectionsUrl(input)) throw new Error('That is not a supported UwUFUFU selections URL.');
    const response = await this.fetcher(input, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`UwUFUFU returned HTTP ${response.status}.`);
    let payload: SelectionPayload;
    try {
      payload = await response.json() as SelectionPayload;
    } catch {
      throw new Error('UwUFUFU returned invalid JSON.');
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      throw new Error('UwUFUFU returned an invalid selections response.');
    }
    const urls = payload.data.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('videoUrl' in entry)) return [];
      const url = youtubeWatchUrl(entry.videoUrl);
      return url ? [url] : [];
    });
    if (urls.length === 0) throw new Error('UwUFUFU returned no playable YouTube entries.');
    return { skipped: payload.data.length - urls.length, urls };
  }
}
```

- [ ] **Step 8: Run importer tests and verify GREEN**

Run: `npm test -- test/UwufufuImporter.test.ts`

Expected: all importer tests PASS.

- [ ] **Step 9: Commit the importer**

```bash
git add src/importers/UwufufuImporter.ts test/UwufufuImporter.test.ts
git commit -m "feat: parse UwUFUFU selection pages"
```

---

### Task 2: Ordered bulk enqueue

**Files:**
- Modify: `src/playback/PlaybackManager.ts`
- Create: `test/PlaybackManager.test.ts`

**Interfaces:**
- Consumes: ordered media URLs from `UwufufuImporter.load` and existing `YtDlpResolver.inspect`.
- Produces: `PlaybackManager.enqueueMany(member: GuildMember, textChannel: SendableChannels, urls: readonly string[], initialSkipped?: number): Promise<string>`.

- [ ] **Step 1: Write failing bulk enqueue tests**

Create `test/PlaybackManager.test.ts`. Mock the Discord voice adapter boundary, but exercise the real manager, queue state, and resolver ordering:

```ts
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const player = { on: vi.fn(), play: vi.fn(), stop: vi.fn() };
vi.mock('@discordjs/voice', () => ({
  AudioPlayerStatus: { Idle: 'idle' },
  NoSubscriberBehavior: { Pause: 'pause' },
  VoiceConnectionStatus: { Connecting: 'connecting', Disconnected: 'disconnected' },
  createAudioPlayer: () => player,
  createAudioResource: vi.fn((stream) => stream),
  entersState: vi.fn().mockResolvedValue(undefined),
  joinVoiceChannel: vi.fn(() => ({ destroy: vi.fn(), on: vi.fn(), subscribe: vi.fn() })),
}));

import { PlaybackManager } from '../src/playback/PlaybackManager.js';
import type { Track } from '../src/playback/types.js';

function track(url: string, title: string): Track {
  return { canonicalUrl: url, durationSeconds: 180, requestedBy: 'user-1', source: 'youtube', title };
}

function fixture(maxQueueSize = 50) {
  const resolver = {
    createAudio: vi.fn((value: Track) => ({ cleanup: vi.fn(), stream: Readable.from([]), track: value })),
    inspect: vi.fn(),
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const guild = { id: 'guild-1', voiceAdapterCreator: {} };
  const voiceChannel = { guild, id: 'voice-1' };
  const member = { guild, id: 'user-1', voice: { channel: voiceChannel, channelId: 'voice-1' } };
  const textChannel = { send: vi.fn() };
  const manager = new PlaybackManager(resolver as never, 300_000, maxQueueSize, logger as never);
  return { manager, member: member as never, resolver, textChannel: textChannel as never };
}

describe('PlaybackManager.enqueueMany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves order while skipping tracks that fail inspection', async () => {
    const { manager, member, resolver, textChannel } = fixture();
    resolver.inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(track('https://youtu.be/three', 'Three'));

    await expect(manager.enqueueMany(member, textChannel, ['one', 'bad', 'three']))
      .resolves.toContain('Imported 2 tracks (1 skipped)');
    expect(resolver.inspect.mock.calls.map(([url]) => url)).toEqual(['one', 'bad', 'three']);
    expect(manager.queue('guild-1')).toBe('Now: **One**\n1. Three');
  });

  it('counts overflow as skipped without inspecting it', async () => {
    const { manager, member, resolver, textChannel } = fixture(1);
    resolver.inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'));

    await expect(manager.enqueueMany(member, textChannel, ['one', 'two', 'three']))
      .resolves.toContain('Imported 2 tracks (1 skipped)');
    expect(resolver.inspect).toHaveBeenCalledTimes(2);
    expect(manager.queue('guild-1')).toBe('Now: **One**\n1. Two');
  });

  it('fails when every candidate fails inspection', async () => {
    const { manager, member, resolver, textChannel } = fixture();
    resolver.inspect.mockRejectedValue(new Error('unavailable'));
    await expect(manager.enqueueMany(member, textChannel, ['bad', 'worse']))
      .rejects.toThrow('No tracks from that list could be queued');
  });
});
```

- [ ] **Step 2: Run the manager tests and verify RED**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `enqueueMany` does not exist.

- [ ] **Step 3: Refactor single enqueue into focused private helpers**

In `PlaybackManager`, extract the existing voice/session checks and track insertion without changing `/play` behavior:

```ts
private requirePlaybackChannel(member: GuildMember): VoiceBasedChannel {
  const voiceChannel = member.voice.channel;
  if (!voiceChannel) throw new Error('Join a voice channel first.');
  const existing = this.sessions.get(member.guild.id);
  if (existing && existing.channelId !== voiceChannel.id) {
    throw new Error('Join the voice channel I am already using first.');
  }
  return voiceChannel;
}

private addTrack(
  member: GuildMember,
  voiceChannel: VoiceBasedChannel,
  textChannel: SendableChannels,
  value: Track,
): string {
  const existing = this.sessions.get(member.guild.id);
  if (existing && existing.queue.length >= this.maxQueueSize) throw new Error('The queue is full.');
  const session = existing ?? this.createSession(voiceChannel, textChannel);
  session.textChannel = textChannel;
  if (!existing) this.sessions.set(member.guild.id, session);
  if (session.current) {
    session.queue.push(value);
    return `Queued **${this.safeTitle(value.title)}** at position ${session.queue.length}.`;
  }
  session.current = value;
  this.play(session);
  return `Now playing **${this.safeTitle(value.title)}**.`;
}
```

Update `enqueue` to call `requirePlaybackChannel`, inspect once, and call `addTrack`. Run the existing and new tests; the new tests must remain RED only because `enqueueMany` is absent.

- [ ] **Step 4: Implement ordered partial bulk enqueue**

Add this public method beside `enqueue`:

```ts
async enqueueMany(
  member: GuildMember,
  textChannel: SendableChannels,
  urls: readonly string[],
  initialSkipped = 0,
): Promise<string> {
  const voiceChannel = this.requirePlaybackChannel(member);
  let added = 0;
  let skipped = initialSkipped;
  let firstResult = '';

  for (const [index, url] of urls.entries()) {
    const session = this.sessions.get(member.guild.id);
    if (session && session.queue.length >= this.maxQueueSize) {
      skipped += urls.length - index;
      break;
    }
    try {
      const value = await this.resolver.inspect(url, member.id);
      const result = this.addTrack(member, voiceChannel, textChannel, value);
      if (!firstResult) firstResult = result;
      added += 1;
    } catch (error) {
      this.logger.warn({ error, guildId: member.guild.id, url }, 'skipping list track');
      skipped += 1;
    }
  }

  if (added === 0) throw new Error('No tracks from that list could be queued.');
  const noun = added === 1 ? 'track' : 'tracks';
  return `Imported ${added} ${noun} (${skipped} skipped). ${firstResult}`;
}
```

Before finalizing, preserve channel-control errors rather than counting them as media skips: `requirePlaybackChannel` is called before the loop, and `addTrack` can only throw the explicit queue-full error under an interleaving request. If that occurs, count the current and remaining candidates as skipped and stop.

- [ ] **Step 5: Run playback tests and verify GREEN**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: all bulk enqueue cases PASS.

- [ ] **Step 6: Run the complete suite**

Run: `npm test`

Expected: all existing URL-policy and new tests PASS without warnings.

- [ ] **Step 7: Commit bulk enqueue**

```bash
git add src/playback/PlaybackManager.ts test/PlaybackManager.test.ts
git commit -m "feat: enqueue ordered track batches"
```

---

### Task 3: `/play` routing and user documentation

**Files:**
- Create: `src/playback/PlayInput.ts`
- Create: `test/PlayInput.test.ts`
- Modify: `src/bot/createBot.ts`
- Modify: `src/commands/definitions.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `UwufufuImporter.load(input)` and `PlaybackManager.enqueueMany(member, channel, urls)` from Tasks 1 and 2.
- Produces: `PlayInput.resolve(input: string): Promise<{ kind: 'batch'; skipped: number; urls: string[] } | { kind: 'single'; url: string }>` used by the Discord command handler.

- [ ] **Step 1: Write failing play-input routing tests**

Create `test/PlayInput.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { PlayInput } from '../src/playback/PlayInput.js';

describe('PlayInput', () => {
  it('leaves an ordinary media URL as one track', async () => {
    const importer = { load: vi.fn() };
    await expect(new PlayInput(importer as never).resolve('https://youtu.be/abc'))
      .resolves.toEqual({ kind: 'single', url: 'https://youtu.be/abc' });
    expect(importer.load).not.toHaveBeenCalled();
  });

  it('loads a supported UwUFUFU selections URL as a batch', async () => {
    const input = 'https://api.uwufufu.com/v1/selections?page=1&perPage=10&worldcupId=168808';
    const importer = { load: vi.fn().mockResolvedValue({ skipped: 0, urls: ['https://youtu.be/one'] }) };
    await expect(new PlayInput(importer as never).resolve(input)).resolves.toEqual({
      kind: 'batch',
      skipped: 0,
      urls: ['https://youtu.be/one'],
    });
    expect(importer.load).toHaveBeenCalledWith(input);
  });
});
```

- [ ] **Step 2: Run play-input tests and verify RED**

Run: `npm test -- test/PlayInput.test.ts`

Expected: FAIL because `PlayInput` does not exist.

- [ ] **Step 3: Implement play-input routing**

Create `src/playback/PlayInput.ts`:

```ts
import { UwufufuImporter, isUwufufuSelectionsUrl } from '../importers/UwufufuImporter.js';

type ResolvedPlayInput =
  | { kind: 'batch'; skipped: number; urls: string[] }
  | { kind: 'single'; url: string };

export class PlayInput {
  constructor(private readonly uwufufu: UwufufuImporter = new UwufufuImporter()) {}

  async resolve(input: string): Promise<ResolvedPlayInput> {
    if (isUwufufuSelectionsUrl(input)) {
      return { kind: 'batch', ...await this.uwufufu.load(input) };
    }
    return { kind: 'single', url: input };
  }
}
```

- [ ] **Step 4: Run play-input tests and verify GREEN**

Run: `npm test -- test/PlayInput.test.ts`

Expected: both routing cases PASS.

- [ ] **Step 5: Route `/play` through `PlayInput`**

In `createBot`, instantiate one `PlayInput` alongside the Discord client. In the `/play` branch, resolve the option once and select the matching playback method:

```ts
const playInput = new PlayInput();

// Inside the /play branch:
const input = await playInput.resolve(interaction.options.getString('url', true));
const result = input.kind === 'batch'
  ? await playback.enqueueMany(interaction.member, interaction.channel, input.urls, input.skipped)
  : await playback.enqueue(interaction.member, interaction.channel, input.url);
```

Do not change mention-message behavior: mentions continue to scan only for single YouTube or SoundCloud links.

- [ ] **Step 6: Update command copy and README**

Change the `/play` description and option description to mention a YouTube or SoundCloud link or an UwUFUFU selections API URL. In `README.md`, document that `/play` imports only the page represented by the supplied URL, preserves its order, skips unusable entries, and respects queue capacity. Include the sample URL from the design.

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0 with no test failures, lint errors, type errors, or build errors.

- [ ] **Step 8: Smoke-test the live sample parser**

Run a one-off `tsx` expression that constructs `UwufufuImporter`, loads the supplied sample URL, and prints only the count and first URL. Expected output is a count of `10` and a first URL of `https://www.youtube.com/watch?v=FN7ALfpGxiI`; do not start the Discord bot or media playback.

- [ ] **Step 9: Commit command integration and docs**

```bash
git add src/playback/PlayInput.ts test/PlayInput.test.ts src/bot/createBot.ts src/commands/definitions.ts README.md
git commit -m "feat: import UwUFUFU lists with play command"
```

---

### Task 4: Final review and push

**Files:**
- Review: all files changed since `ed7f4ef`.

**Interfaces:**
- Consumes: the completed Tasks 1–3 and their commits.
- Produces: a verified remote branch containing the design, plan, implementation, tests, and documentation.

- [ ] **Step 1: Review scope and history**

Run:

```bash
git status --short
git log --oneline --decorate ed7f4ef^..HEAD
git diff --check ed7f4ef^..HEAD
git diff --stat ed7f4ef^..HEAD
```

Expected: only the design, plan, importer, playback, bot, tests, and README changes are present; whitespace validation passes.

- [ ] **Step 2: Re-run the complete verification suite**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: every command exits 0.

- [ ] **Step 3: Push the current branch**

Resolve the branch and upstream with `git branch --show-current` and `git status -sb`. If an upstream is configured, run `git push`; otherwise run `git push -u origin <current-branch>`. Confirm the pushed commit with `git status -sb`.
