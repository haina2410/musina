# YouTube Search Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YouTube text search so `/play <input>` queues the best match and `/search <query>` presents five requester-only selectable results, with equivalent mention commands.

**Architecture:** Extend `PlayInput` with explicit query classification, add bounded `yt-dlp` search to the existing resolver, and keep all voice/queue mutation inside `PlaybackManager`. A focused Discord menu module owns stateless component IDs and rendering; the bot handler coordinates slash commands, mention commands, and selection interactions.

**Tech Stack:** Node.js 22+, TypeScript 6, discord.js 14, yt-dlp, Vitest, ESLint

**Spec:** `docs/superpowers/specs/2026-08-19-search-feature-design.md`

## Global Constraints

- Text search uses YouTube only; SoundCloud remains URL-only.
- `/play` returns the best result; `/search` returns at most five results.
- Search queries are trimmed, non-empty, and at most 200 characters.
- Supported URLs, YouTube playlist imports, and UwUFUFU imports retain their current behavior.
- A URI-scheme-prefixed unsupported value is an error, not a search query.
- Search menus are public, requester-only, stateless, and expire after exactly five minutes.
- Dropdown labels, descriptions, and values must fit Discord's 100-character limits.
- No new runtime dependency or operator credential is introduced.

## File Structure

- Modify `src/playback/PlayInput.ts`: classify batch imports, media URLs, and text queries.
- Modify `src/playback/types.ts`: define the provider-neutral `SearchCandidate` value.
- Modify `src/playback/YtDlpResolver.ts`: run and normalize bounded YouTube searches.
- Modify `src/playback/PlaybackManager.ts`: expose discovery and best-match enqueue operations.
- Create `src/commands/searchMenu.ts`: render dropdowns and parse requester/expiry metadata.
- Modify `src/commands/definitions.ts`: register `/search` and broaden `/play` wording.
- Modify `src/bot/createBot.ts`: dispatch query playback, search discovery, and selection interactions.
- Modify `README.md`: document URL-or-text playback and interactive search.
- Modify or create matching files under `test/` for every changed unit.

---

### Task 1: Classify free-text play input without regressing imports

**Files:**
- Modify: `src/playback/PlayInput.ts`
- Test: `test/PlayInput.test.ts`

**Interfaces:**
- Produces: exported `ResolvedPlayInput` union with `{ kind: 'query'; query: string }`.
- Consumes: existing `isUwufufuSelectionsUrl`, `isYoutubePlaylistUrl`, and `validateMediaUrl`.

- [ ] **Step 1: Write failing classification tests**

Add tests that preserve both importers, normalize ordinary media URLs, classify text, and reject URL-shaped invalid input:

```ts
it('classifies trimmed free text as a YouTube query', async () => {
  const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });
  await expect(input.resolve('  never gonna give you up  ')).resolves.toEqual({
    kind: 'query',
    query: 'never gonna give you up',
  });
});

it.each(['', '   '])('rejects blank input %j', async (value) => {
  const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });
  await expect(input.resolve(value)).rejects.toThrow('Provide a URL or search terms.');
});

it.each(['https://example.com/song', 'ftp://youtube.com/song', 'spotify:track:123'])
  ('does not reinterpret URI-shaped input %s as search text', async (value) => {
    const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });
    await expect(input.resolve(value)).rejects.toThrow();
  });
```

Update the existing single-track assertion to expect the normalized URL returned by `validateMediaUrl`, while keeping the playlist and UwUFUFU batch tests unchanged.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- test/PlayInput.test.ts`

Expected: FAIL because free text still returns `kind: 'single'` and blank/unsupported values are not rejected during classification.

- [ ] **Step 3: Implement the result union and ordered classifier**

Export the union and use a URI-scheme test only after both import checks:

```ts
import { isYoutubePlaylistUrl, validateMediaUrl } from './urlPolicy.js';

const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;

export type ResolvedPlayInput =
  | { kind: 'batch'; skipped: number; urls: string[] }
  | { kind: 'query'; query: string }
  | { kind: 'single'; url: string };

async resolve(input: string): Promise<ResolvedPlayInput> {
  const value = input.trim();
  if (!value) throw new Error('Provide a URL or search terms.');
  if (isUwufufuSelectionsUrl(value)) {
    return { kind: 'batch', ...await this.uwufufu.load(value) };
  }
  if (isYoutubePlaylistUrl(value)) {
    return { kind: 'batch', ...await this.youtubePlaylist.load(value) };
  }
  if (!URI_SCHEME.test(value)) return { kind: 'query', query: value };
  return { kind: 'single', url: validateMediaUrl(value).url };
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- test/PlayInput.test.ts`

Expected: PASS, including both playlist importer paths.

- [ ] **Step 5: Commit the classifier**

```bash
git add src/playback/PlayInput.ts test/PlayInput.test.ts
git commit -m "feat: classify play search queries"
```

---

### Task 2: Add bounded YouTube discovery to the yt-dlp resolver

**Files:**
- Modify: `src/playback/types.ts`
- Modify: `src/playback/YtDlpResolver.ts`
- Test: `test/YtDlpResolver.test.ts`

**Interfaces:**
- Produces: `SearchCandidate { durationSeconds: number | null; title: string; url: string }`.
- Produces: `YtDlpResolver.search(query: string, limit: number): Promise<SearchCandidate[]>`.
- Consumes: existing process timeout, output bound, logger, and `validateMediaUrl` policy.

- [ ] **Step 1: Write failing search process and normalization tests**

Use the existing fake child process and emit one playlist-shaped JSON document:

```ts
it('returns normalized flat YouTube search entries', async () => {
  const child = fakeChild();
  childProcess.spawn.mockReturnValue(child);
  queueMicrotask(() => {
    child.stdout.end(JSON.stringify({ entries: [
      { duration: 185, title: ' First ', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
      { duration: null, title: 'Second', webpage_url: 'https://youtu.be/lmnopqrst' },
      { title: 'Not media', url: 'https://example.com/nope' },
    ] }));
    child.emit('close', 0);
  });
  const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

  await expect(resolver.search('  synthwave mix  ', 5)).resolves.toEqual([
    { durationSeconds: 185, title: 'First', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
    { durationSeconds: null, title: 'Second', url: 'https://youtu.be/lmnopqrst' },
  ]);
  expect(childProcess.spawn).toHaveBeenCalledWith('yt-dlp', [
    '--js-runtimes', 'node', '--dump-single-json', '--flat-playlist', '--no-warnings',
    '--socket-timeout', '15', 'ytsearch5:synthwave mix',
  ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
});

it.each(['', ' '.repeat(3), 'x'.repeat(201)])('rejects invalid search query length', async (query) => {
  const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);
  await expect(resolver.search(query, 5)).rejects.toThrow('Search terms must be 1 to 200 characters.');
  expect(childProcess.spawn).not.toHaveBeenCalled();
});

it('rejects an empty usable result set', async () => {
  const child = fakeChild();
  childProcess.spawn.mockReturnValue(child);
  queueMicrotask(() => {
    child.stdout.end(JSON.stringify({ entries: [] }));
    child.emit('close', 0);
  });
  const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);
  await expect(resolver.search('missing song', 5)).rejects.toThrow('No YouTube results found.');
});
```

Add these exact boundary tests as well:

```ts
it.each([0, 6, 1.5])('rejects invalid result limit %s', async (limit) => {
  const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);
  await expect(resolver.search('song', limit)).rejects
    .toThrow('Search result limit must be between 1 and 5.');
  expect(childProcess.spawn).not.toHaveBeenCalled();
});

it('discards a result URL that cannot fit a Discord option value', async () => {
  const child = fakeChild();
  childProcess.spawn.mockReturnValue(child);
  queueMicrotask(() => {
    child.stdout.end(JSON.stringify({ entries: [
      { title: 'Too long', url: `https://youtube.com/watch?v=${'x'.repeat(100)}` },
    ] }));
    child.emit('close', 0);
  });
  const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);
  await expect(resolver.search('song', 5)).rejects.toThrow('No YouTube results found.');
});
```

- [ ] **Step 2: Run the resolver tests and verify failure**

Run: `npm test -- test/YtDlpResolver.test.ts`

Expected: FAIL because `SearchCandidate` and `search()` do not exist.

- [ ] **Step 3: Add the search value type**

Add to `src/playback/types.ts`:

```ts
export interface SearchCandidate {
  durationSeconds: number | null;
  title: string;
  url: string;
}
```

- [ ] **Step 4: Implement flat search and safe normalization**

Broaden internal metadata and make `runJson` generic:

```ts
interface Metadata {
  duration?: number | null;
  original_url?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
}

interface SearchMetadata { entries?: unknown; }

async search(queryInput: string, limit: number): Promise<SearchCandidate[]> {
  const query = queryInput.trim();
  if (!query || query.length > 200) {
    throw new Error('Search terms must be 1 to 200 characters.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
    throw new Error('Search result limit must be between 1 and 5.');
  }
  const result = await this.runJson<SearchMetadata>([
    '--js-runtimes', 'node', '--dump-single-json', '--flat-playlist', '--no-warnings',
    '--socket-timeout', '15', `ytsearch${limit}:${query}`,
  ]);
  const entries = Array.isArray(result.entries) ? result.entries : [];
  const candidates = entries.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const metadata = entry as Metadata;
    const rawUrl = metadata.webpage_url || metadata.url;
    if (typeof rawUrl !== 'string') return [];
    try {
      const media = validateMediaUrl(rawUrl);
      if (media.source !== 'youtube' || media.url.length > 100) return [];
      return [{
        durationSeconds: typeof metadata.duration === 'number'
          && Number.isFinite(metadata.duration) && metadata.duration >= 0
          ? metadata.duration : null,
        title: metadata.title?.trim() || 'Untitled track',
        url: media.url,
      }];
    } catch {
      return [];
    }
  }).slice(0, limit);
  if (candidates.length === 0) throw new Error('No YouTube results found.');
  return candidates;
}

private runJson<T = Metadata>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(this.binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The media provider took too long to respond.'));
    }, 30_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 5_000_000) child.kill('SIGKILL');
    });
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr.trim() || 'Unable to read that media.'));
      try { resolve(JSON.parse(stdout) as T); }
      catch { reject(new Error('The media provider returned an invalid response.')); }
    });
  });
}
```

- [ ] **Step 5: Run resolver tests**

Run: `npm test -- test/YtDlpResolver.test.ts`

Expected: PASS for both existing inspect/stream behavior and new discovery behavior.

- [ ] **Step 6: Commit resolver search**

```bash
git add src/playback/types.ts src/playback/YtDlpResolver.ts test/YtDlpResolver.test.ts
git commit -m "feat: search YouTube with yt-dlp"
```

---

### Task 3: Keep search and query enqueue behind PlaybackManager

**Files:**
- Modify: `src/playback/PlaybackManager.ts`
- Test: `test/PlaybackManager.test.ts`

**Interfaces:**
- Consumes: `YtDlpResolver.search(query, limit)` and existing `inspect(url, requestedBy)`.
- Produces: `search(query: string): Promise<SearchCandidate[]>` returning five candidates.
- Produces: `enqueueQuery(member, textChannel, query): Promise<string>` returning existing playback copy.

- [ ] **Step 1: Extend the fixture and write failing manager tests**

Add a `search` mock to the resolver fixture and cover validation order and the happy path:

```ts
it('validates playback before searching and queues the inspected best match', async () => {
  const { inspect, manager, member, search, textChannel } = fixture();
  search.mockResolvedValue([{ durationSeconds: 180, title: 'Candidate', url: 'https://youtu.be/abcdefghijk' }]);
  inspect.mockResolvedValue(track('https://youtu.be/abcdefghijk', 'Candidate'));

  await expect(manager.enqueueQuery(member, textChannel, 'candidate song'))
    .resolves.toBe('Now playing **Candidate**.');
  expect(search).toHaveBeenCalledWith('candidate song', 1);
  expect(inspect).toHaveBeenCalledWith('https://youtu.be/abcdefghijk', 'user-1');
});

it('does not search when the requester is outside the active voice channel', async () => {
  const { manager, member, search, textChannel } = fixture();
  member.voice.channel = null;
  await expect(manager.enqueueQuery(member, textChannel, 'candidate song'))
    .rejects.toThrow('Join a voice channel first.');
  expect(search).not.toHaveBeenCalled();
});

it('discovers five results without requiring voice membership', async () => {
  const { manager, search } = fixture();
  const candidates = [{ durationSeconds: 180, title: 'Candidate', url: 'https://youtu.be/abcdefghijk' }];
  search.mockResolvedValue(candidates);
  await expect(manager.search('candidate song')).resolves.toBe(candidates);
  expect(search).toHaveBeenCalledWith('candidate song', 5);
});
```

- [ ] **Step 2: Run the focused manager tests and verify failure**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `search()` and `enqueueQuery()` do not exist.

- [ ] **Step 3: Implement the two manager methods**

```ts
async search(query: string): Promise<SearchCandidate[]> {
  return this.resolver.search(query, 5);
}

async enqueueQuery(
  member: GuildMember,
  textChannel: SendableChannels,
  query: string,
): Promise<string> {
  const voiceChannel = this.requirePlaybackChannel(member);
  this.requireQueueCapacity(member.guild.id);
  const [candidate] = await this.resolver.search(query, 1);
  if (!candidate) throw new Error('No YouTube results found.');
  const track = await this.resolver.inspect(candidate.url, member.id);
  return this.addTrack(member, voiceChannel, textChannel, track);
}
```

Import `SearchCandidate` as a type beside the existing playback types. The second queue-capacity check remains inside `addTrack`, preserving the current race protection.

- [ ] **Step 4: Run all playback manager tests**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: PASS with existing queue, shuffle, voice status, and import behavior unchanged.

- [ ] **Step 5: Commit the playback boundary**

```bash
git add src/playback/PlaybackManager.ts test/PlaybackManager.test.ts
git commit -m "feat: enqueue YouTube search matches"
```

---

### Task 4: Build stateless requester-bound search menus

**Files:**
- Create: `src/commands/searchMenu.ts`
- Create: `test/searchMenu.test.ts`

**Interfaces:**
- Consumes: readonly `SearchCandidate[]`.
- Produces: `buildSearchMenu(candidates, requesterId, createdAt?)` returning one Discord action row.
- Produces: `parseSearchMenuId(customId, now?)` returning `{ expired, requesterId } | null`.

- [ ] **Step 1: Write failing menu rendering and parsing tests**

```ts
it('renders five bounded options in a requester-bound menu', () => {
  const candidates = Array.from({ length: 5 }, (_, index) => ({
    durationSeconds: index === 0 ? 185 : null,
    title: `${'Title '.repeat(30)}${index}`,
    url: `https://youtu.be/abcdefghij${index}`,
  }));
  const [row] = buildSearchMenu(candidates, '123456789', 1_700_000_000_000);
  const json = row!.toJSON();
  expect(json.components[0]).toMatchObject({
    custom_id: `musina-search:v1:123456789:${(1_700_000_000_000).toString(36)}`,
    options: expect.arrayContaining([
      expect.objectContaining({ description: '3:05', value: candidates[0]!.url }),
    ]),
  });
  expect(json.components[0]!.options).toHaveLength(5);
  expect(json.components[0]!.options.every((option) => option.label.length <= 100)).toBe(true);
});

it('parses ownership and expires at five minutes', () => {
  const createdAt = 1_700_000_000_000;
  const id = `musina-search:v1:123:${createdAt.toString(36)}`;
  expect(parseSearchMenuId(id, createdAt + 299_999)).toEqual({ expired: false, requesterId: '123' });
  expect(parseSearchMenuId(id, createdAt + 300_000)).toEqual({ expired: true, requesterId: '123' });
});

it.each(['other:v1:123:abc', 'musina-search:v1:not-a-user:abc', 'musina-search:v1:123:!'])
  ('ignores malformed custom id %s', (id) => {
    expect(parseSearchMenuId(id)).toBeNull();
  });
```

- [ ] **Step 2: Run the new tests and verify failure**

Run: `npm test -- test/searchMenu.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement menu IDs, duration formatting, and bounded labels**

```ts
import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import type { SearchCandidate } from '../playback/types.js';

const PREFIX = 'musina-search:v1';
export const SEARCH_MENU_TTL_MS = 300_000;

export function buildSearchMenu(
  candidates: readonly SearchCandidate[],
  requesterId: string,
  createdAt = Date.now(),
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${PREFIX}:${requesterId}:${createdAt.toString(36)}`)
    .setPlaceholder('Choose a YouTube result')
    .addOptions(candidates.slice(0, 5).map((candidate) => {
      const option = new StringSelectMenuOptionBuilder()
        .setLabel(candidate.title.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 100) || 'Untitled track')
        .setValue(candidate.url);
      if (candidate.durationSeconds !== null) option.setDescription(formatDuration(candidate.durationSeconds));
      return option;
    }));
  return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
}

export function parseSearchMenuId(customId: string, now = Date.now()):
  { expired: boolean; requesterId: string } | null {
  const match = /^musina-search:v1:(\d{1,20}):([0-9a-z]+)$/.exec(customId);
  if (!match) return null;
  const createdAt = Number.parseInt(match[2]!, 36);
  if (!Number.isSafeInteger(createdAt)) return null;
  return {
    expired: createdAt > now || now - createdAt >= SEARCH_MENU_TTL_MS,
    requesterId: match[1]!,
  };
}

function formatDuration(secondsInput: number): string {
  const seconds = Math.max(0, Math.floor(secondsInput));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`.slice(0, 100);
}
```

- [ ] **Step 4: Run menu tests**

Run: `npm test -- test/searchMenu.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the menu unit**

```bash
git add src/commands/searchMenu.ts test/searchMenu.test.ts
git commit -m "feat: build requester-bound search menus"
```

---

### Task 5: Register and dispatch slash and mention search flows

**Files:**
- Modify: `src/commands/definitions.ts`
- Modify: `src/bot/createBot.ts`
- Test: `test/commandDefinitions.test.ts`
- Test: `test/createBot.test.ts`

**Interfaces:**
- Consumes: `ResolvedPlayInput`, `PlaybackManager.search`, `PlaybackManager.enqueueQuery`, `buildSearchMenu`, and `parseSearchMenuId`.
- Produces: `/play input:<URL or terms>`, `/search query:<terms>`, `@Musina play <input>`, and `@Musina search <query>`.

- [ ] **Step 1: Write failing definition tests**

```ts
it('registers search and names the broad play option input', () => {
  expect(commandDefinitions.map((command) => command.name)).toEqual([
    'play', 'search', 'skip', 'stop', 'queue', 'nowplaying', 'shuffle', 'help',
  ]);
  const play = commandDefinitions.find((command) => command.name === 'play')!;
  expect(play.options?.[0]).toMatchObject({ name: 'input', required: true });
});
```

Add the shared-copy assertion:

```ts
expect(HELP_TEXT).toContain('/play <input>');
expect(HELP_TEXT).toContain('/search <query>');
```

- [ ] **Step 2: Write failing bot dispatch tests**

Add focused EventEmitter tests for:

```ts
// Slash /play text query
expect(playback.enqueueQuery).toHaveBeenCalledWith(member, channel, 'never gonna give you up');

// Slash and mention search
expect(playback.search).toHaveBeenCalledWith('synthwave');
expect(editReplyOrMessageReply).toHaveBeenCalledWith(expect.objectContaining({
  content: 'Choose a YouTube result:',
  components: expect.any(Array),
}));

// Authorized selection success
expect(interaction.deferUpdate).toHaveBeenCalled();
expect(playback.enqueue).toHaveBeenCalledWith(member, channel, selectedUrl);
expect(interaction.editReply).toHaveBeenCalledWith({
  content: 'Queued **Selected** at position 1.',
  components: [],
});

// Another requester and an expired menu
expect(interaction.reply).toHaveBeenCalledWith({
  content: 'Only the user who started this search can choose a result.',
  ephemeral: true,
});
expect(playback.enqueue).not.toHaveBeenCalled();

// Recoverable playback error after deferUpdate
expect(interaction.followUp).toHaveBeenCalledWith({
  content: 'Join a voice channel first.',
  ephemeral: true,
});
expect(interaction.editReply).not.toHaveBeenCalled();
```

Keep the existing YouTube playlist, UwUFUFU, SoundCloud/YouTube URL, help, shuffle, and mention shorthand tests.

- [ ] **Step 3: Run command tests and verify failure**

Run: `npm test -- test/commandDefinitions.test.ts test/createBot.test.ts`

Expected: FAIL because search is neither registered nor dispatched.

- [ ] **Step 4: Update definitions and help copy**

Change `/play`'s option from `url` to `input`, add `/search`, and update shared help:

```ts
new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play or queue a URL, playlist, selections page, or YouTube search')
  .addStringOption((option) => option
    .setName('input')
    .setDescription('Media URL, playlist, selections URL, or YouTube search terms')
    .setRequired(true)),
new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search YouTube and choose a result')
  .addStringOption((option) => option
    .setName('query')
    .setDescription('YouTube search terms')
    .setRequired(true)),
```

- [ ] **Step 5: Share resolved-play and search-reply helpers**

In `createBot.ts`, import the menu functions and route all three play kinds:

```ts
async function runPlayInput(
  input: ResolvedPlayInput,
  playback: PlaybackManager,
  member: GuildMember,
  channel: SendableChannels,
): Promise<string> {
  if (input.kind === 'batch') {
    return playback.enqueueMany(member, channel, input.urls, input.skipped);
  }
  if (input.kind === 'query') return playback.enqueueQuery(member, channel, input.query);
  return playback.enqueue(member, channel, input.url);
}

async function searchReply(playback: PlaybackManager, query: string, requesterId: string) {
  const candidates = await playback.search(query);
  return { content: 'Choose a YouTube result:', components: buildSearchMenu(candidates, requesterId) };
}
```

The slash handler reads `input` for `/play`, adds a deferred `/search` branch that reads `query`, and uses `interaction.user.id` as requester ID. The mention handler adds an explicit `search` branch, requires a non-empty argument, calls `sendTyping()`, and replies with the same search payload plus `allowedMentions`.

- [ ] **Step 6: Dispatch string-select interactions**

Keep chat-input dispatch first so existing mocks remain valid, then handle select menus:

```ts
client.on('interactionCreate', (interaction) => {
  if (interaction.isChatInputCommand()) {
    void handleCommand(interaction, playback, playInput, logger);
  } else if (interaction.isStringSelectMenu()) {
    void handleSearchSelection(interaction, playback, logger);
  }
});
```

Implement the selection behavior exactly:

```ts
const menu = parseSearchMenuId(interaction.customId);
if (!menu) return;
if (interaction.user.id !== menu.requesterId) {
  await interaction.reply({
    content: 'Only the user who started this search can choose a result.',
    ephemeral: true,
  });
  return;
}
if (menu.expired) {
  await interaction.reply({ content: 'This search has expired. Run `/search` again.', ephemeral: true });
  return;
}
if (!interaction.inCachedGuild() || !interaction.channel?.isSendable()) {
  await interaction.reply({ content: 'This menu only works in a server text channel.', ephemeral: true });
  return;
}
await interaction.deferUpdate();
try {
  const result = await playback.enqueue(interaction.member, interaction.channel, interaction.values[0]!);
  await interaction.editReply({ content: result, components: [] });
} catch (error) {
  logger.warn({ error, command: 'search-selection' }, 'command failed');
  await interaction.followUp({
    content: error instanceof Error ? error.message : 'Something went wrong.',
    ephemeral: true,
  });
}
```

- [ ] **Step 7: Run command tests**

Run: `npm test -- test/commandDefinitions.test.ts test/createBot.test.ts`

Expected: PASS for slash, mention, selection, and all prior command paths.

- [ ] **Step 8: Commit command integration**

```bash
git add src/commands/definitions.ts src/bot/createBot.ts test/commandDefinitions.test.ts test/createBot.test.ts
git commit -m "feat: add interactive YouTube search commands"
```

---

### Task 6: Document and verify the integrated feature

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: final registered command names and behavior.
- Produces: operator-facing usage that matches Discord registration and mention syntax.

- [ ] **Step 1: Update README usage**

State that `/play <input>` accepts YouTube/SoundCloud URLs, YouTube playlist URLs, UwUFUFU selections URLs, or YouTube search terms. Add `/search <query>` and its requester-only five-result dropdown. Document `@Musina play <input>` and `@Musina search <query>` while preserving mention-with-URL shorthand.

- [ ] **Step 2: Run the full quality gate**

Run:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Expected: all commands exit 0 with no test failures, lint errors, or TypeScript diagnostics.

- [ ] **Step 3: Inspect the final diff**

Run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git status --short
```

Expected: no whitespace errors, only search-related files, and a clean worktree after the final commit.

- [ ] **Step 4: Commit documentation**

```bash
git add README.md
git commit -m "docs: document YouTube search commands"
```

- [ ] **Step 5: Re-run the full quality gate after the documentation commit**

Run the same four npm commands. Expected: all exit 0.

- [ ] **Step 6: Merge into main**

From the primary clean worktree, verify `main` has not moved unexpectedly, merge the feature branch with `--ff-only` when possible, and re-run the full quality gate on `main`. Do not push unless separately requested.
