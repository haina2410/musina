# Queue Pagination and Skip-To Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add requester-only live queue pagination buttons and a new `/skip-to <position>` command while preserving `/skip`.

**Architecture:** `PlaybackManager` owns live queue-page calculation and atomic skip-to mutation. A focused Discord command module owns stateless queue button IDs and rows, while `createBot` coordinates slash commands, mention commands, and button interactions without storing paginator sessions.

**Tech Stack:** Node.js 22+, TypeScript 6, discord.js 14, Vitest 4, ESLint 10

## Global Constraints

- Show 10 upcoming tracks per queue page with absolute one-based positions.
- Queue buttons are usable only by the user who requested that queue message.
- Every button click renders current queue state and clamps a vanished page to the latest valid page.
- Keep `/skip` unchanged; `/skip-to 3` drops the current track and upcoming positions 1–2, then advances to the former position 3.
- Do not add in-memory paginator state, snapshots, direct page-number controls, or dependencies.

## File Structure

- `src/playback/PlaybackManager.ts`: calculate structured live pages and perform validated skip-to mutation.
- `src/commands/queueButtons.ts`: build and parse stateless requester-bound Previous/Next buttons.
- `src/bot/createBot.ts`: route queue slash/mention commands, queue button interactions, and skip-to arguments.
- `src/commands/definitions.ts`: register `/skip-to` and update help copy.
- `test/PlaybackManager.test.ts`: verify page boundaries, clamping, and skip-to state transitions.
- `test/queueButtons.test.ts`: verify custom IDs, ownership metadata, and boundary button states.
- `test/createBot.test.ts`: verify Discord routing, authorization, live updates, and argument forwarding.
- `test/commandDefinitions.test.ts`: verify the new integer option and help text.
- `README.md`: document pagination ownership/live behavior and skip-to semantics.

---

### Task 1: Playback queue pages and skip-to

**Files:**
- Modify: `src/playback/PlaybackManager.ts:35-225`
- Test: `test/PlaybackManager.test.ts`

**Interfaces:**
- Consumes: existing `Session.queue`, `requireSameChannel(member)`, `safeTitle(title)`, and idle-driven `advance` behavior.
- Produces: `export interface QueuePage { content: string; page: number; totalPages: number }`, `PlaybackManager.queuePage(guildId: string, requestedPage?: number): QueuePage`, and `PlaybackManager.skipTo(member: GuildMember, position: number): string`.

- [ ] **Step 1: Write failing queue-page tests**

Add a helper that enqueues numbered tracks, then exercise page boundaries and live clamping:

```ts
async function enqueueNumberedTracks(
  count: number,
  fixtureValue: ReturnType<typeof fixture>,
): Promise<void> {
  for (let position = 1; position <= count; position += 1) {
    fixtureValue.inspect.mockResolvedValueOnce(track(`url-${position}`, `Track ${position}`));
    await fixtureValue.manager.enqueue(fixtureValue.member, fixtureValue.textChannel, `url-${position}`);
  }
}

describe('PlaybackManager.queuePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders ten upcoming tracks with absolute positions on each page', async () => {
    const value = fixture();
    await enqueueNumberedTracks(23, value);

    expect(value.manager.queuePage('guild-1', 1)).toEqual({
      content: [
        'Now: **Track 1**',
        '11. Track 12',
        '12. Track 13',
        '13. Track 14',
        '14. Track 15',
        '15. Track 16',
        '16. Track 17',
        '17. Track 18',
        '18. Track 19',
        '19. Track 20',
        '20. Track 21',
      ].join('\n'),
      page: 1,
      totalPages: 3,
    });
  });

  it('clamps a requested page to the current final page', async () => {
    const value = fixture();
    await enqueueNumberedTracks(13, value);

    expect(value.manager.queuePage('guild-1', 99)).toMatchObject({
      page: 1,
      totalPages: 2,
    });
  });

  it('returns an empty result without navigation metadata', () => {
    expect(fixture().manager.queuePage('guild-1', 2)).toEqual({
      content: 'Nothing is playing.',
      page: 0,
      totalPages: 0,
    });
  });
});
```

- [ ] **Step 2: Run the queue-page tests to verify RED**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `queuePage` does not exist.

- [ ] **Step 3: Implement structured queue pages**

Add the exported type near `ImportProgress`, use a fixed internal page size, preserve absolute numbering, and keep the existing string method compatible:

```ts
export interface QueuePage {
  content: string;
  page: number;
  totalPages: number;
}

const QUEUE_PAGE_SIZE = 10;

queuePage(guildId: string, requestedPage = 0): QueuePage {
  const session = this.sessions.get(guildId);
  if (!session?.current) {
    return { content: 'Nothing is playing.', page: 0, totalPages: 0 };
  }
  const totalPages = Math.max(1, Math.ceil(session.queue.length / QUEUE_PAGE_SIZE));
  const page = Math.min(
    Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0),
    totalPages - 1,
  );
  const start = page * QUEUE_PAGE_SIZE;
  const upcoming = session.queue.slice(start, start + QUEUE_PAGE_SIZE).map((value, index) =>
    `${start + index + 1}. ${this.safeTitle(value.title)}`,
  );
  return {
    content: [`Now: **${this.safeTitle(session.current.title)}**`, ...upcoming].join('\n'),
    page,
    totalPages,
  };
}

queue(guildId: string): string {
  return this.queuePage(guildId).content;
}
```

- [ ] **Step 4: Run the queue-page tests to verify GREEN**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: PASS, including existing queue and shuffle assertions.

- [ ] **Step 5: Write failing skip-to tests**

Use the real manager and the captured idle callback so the test proves both queue removal and target promotion:

```ts
describe('PlaybackManager.skipTo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drops preceding tracks and advances to the requested upcoming position', async () => {
    const value = fixture();
    await enqueueNumberedTracks(5, value);
    const idle = voice.player.on.mock.calls.find(([event]) => event === 'idle')?.[1];

    expect(value.manager.skipTo(value.member, 3)).toBe('Skipping to **Track 4**.');
    expect(voice.player.stop).toHaveBeenCalledWith(true);
    idle();

    expect(value.manager.nowPlaying('guild-1')).toBe('Now playing **Track 4**.');
    expect(value.manager.queue('guild-1')).toBe('Now: **Track 4**\n1. Track 5');
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid position %s without stopping', async (position) => {
    const value = fixture();
    await enqueueNumberedTracks(2, value);

    expect(() => value.manager.skipTo(value.member, position))
      .toThrow('Provide a positive whole-number queue position.');
    expect(voice.player.stop).not.toHaveBeenCalled();
  });

  it('rejects an unavailable position without changing the queue', async () => {
    const value = fixture();
    await enqueueNumberedTracks(2, value);

    expect(() => value.manager.skipTo(value.member, 2))
      .toThrow('Queue position 2 does not exist.');
    expect(value.manager.queue('guild-1')).toBe('Now: **Track 1**\n1. Track 2');
    expect(voice.player.stop).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the skip-to tests to verify RED**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `skipTo` does not exist.

- [ ] **Step 7: Implement minimal skip-to mutation**

Add beside `skip`:

```ts
skipTo(member: GuildMember, position: number): string {
  const session = this.requireSameChannel(member);
  if (!Number.isSafeInteger(position) || position < 1) {
    throw new Error('Provide a positive whole-number queue position.');
  }
  const target = session.queue[position - 1];
  if (!target) throw new Error(`Queue position ${position} does not exist.`);
  session.queue.splice(0, position - 1);
  session.player.stop(true);
  return `Skipping to **${this.safeTitle(target.title)}**.`;
}
```

- [ ] **Step 8: Run playback tests and commit**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: PASS.

```bash
git add src/playback/PlaybackManager.ts test/PlaybackManager.test.ts
git commit -m "feat: paginate queues and skip to positions"
```

---

### Task 2: Stateless queue navigation buttons

**Files:**
- Create: `src/commands/queueButtons.ts`
- Create: `test/queueButtons.test.ts`

**Interfaces:**
- Consumes: `discord.js` `ActionRowBuilder`, `ButtonBuilder`, and `ButtonStyle`.
- Produces: `buildQueueButtons(requesterId: string, page: number, totalPages: number): ActionRowBuilder<ButtonBuilder>[]` and `parseQueueButtonId(customId: string): { page: number; requesterId: string } | null`.

- [ ] **Step 1: Write failing button module tests**

```ts
import type { APIButtonComponent } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildQueueButtons, parseQueueButtonId } from '../src/commands/queueButtons.js';

describe('queue buttons', () => {
  it('renders requester-bound previous and next targets', () => {
    const [row] = buildQueueButtons('123456789', 1, 3);
    const [previous, next] = row!.toJSON().components as APIButtonComponent[];

    expect(previous).toMatchObject({ custom_id: 'musina-queue:v1:123456789:0', disabled: false });
    expect(next).toMatchObject({ custom_id: 'musina-queue:v1:123456789:2', disabled: false });
  });

  it('disables boundaries and omits controls for one page', () => {
    const [first] = buildQueueButtons('123', 0, 2)[0]!.toJSON().components as APIButtonComponent[];
    const [, last] = buildQueueButtons('123', 1, 2)[0]!.toJSON().components as APIButtonComponent[];

    expect(first.disabled).toBe(true);
    expect(last.disabled).toBe(true);
    expect(buildQueueButtons('123', 0, 1)).toEqual([]);
    expect(buildQueueButtons('123', 0, 0)).toEqual([]);
  });

  it('parses valid IDs and rejects malformed or unsafe pages', () => {
    expect(parseQueueButtonId('musina-queue:v1:123:4')).toEqual({ requesterId: '123', page: 4 });
    expect(parseQueueButtonId('other:v1:123:4')).toBeNull();
    expect(parseQueueButtonId('musina-queue:v1:user:4')).toBeNull();
    expect(parseQueueButtonId('musina-queue:v1:123:999999999999999999999')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- test/queueButtons.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the focused button module**

Use prefix `musina-queue:v1`, Discord primary-style buttons, labels `Previous` and `Next`, clamped target pages, and a strict Discord snowflake/page parser:

```ts
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const QUEUE_BUTTON_PREFIX = 'musina-queue:v1';

export function buildQueueButtons(requesterId: string, page: number, totalPages: number) {
  if (totalPages <= 1) return [];
  const previousPage = Math.max(0, page - 1);
  const nextPage = Math.min(totalPages - 1, page + 1);
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${QUEUE_BUTTON_PREFIX}:${requesterId}:${previousPage}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`${QUEUE_BUTTON_PREFIX}:${requesterId}:${nextPage}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
  )];
}

export function parseQueueButtonId(customId: string) {
  const match = /^musina-queue:v1:(\d{1,20}):(\d+)$/.exec(customId);
  if (!match) return null;
  const page = Number(match[2]);
  if (!Number.isSafeInteger(page)) return null;
  return { requesterId: match[1]!, page };
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- test/queueButtons.test.ts`

Expected: PASS.

```bash
git add src/commands/queueButtons.ts test/queueButtons.test.ts
git commit -m "feat: add requester-bound queue buttons"
```

---

### Task 3: Route live queue pagination through Discord

**Files:**
- Modify: `src/bot/createBot.ts:1-285`
- Test: `test/createBot.test.ts`

**Interfaces:**
- Consumes: `PlaybackManager.queuePage(guildId, page)`, `buildQueueButtons(requesterId, page, totalPages)`, and `parseQueueButtonId(customId)`.
- Produces: requester-bound initial `/queue` and mention replies plus live `ButtonInteraction` updates.

- [ ] **Step 1: Write failing slash and mention queue reply tests**

Create compact fake interactions/messages following the existing `EventEmitter` pattern. Assert that both command forms call `queuePage(guildId, 0)` and reply with content plus components:

```ts
expect(playback.queuePage).toHaveBeenCalledWith('guild-1', 0);
expect(reply).toHaveBeenCalledWith(expect.objectContaining({
  content: 'Now: **One**\n1. Two',
  components: expect.any(Array),
}));
```

For the mention reply, also assert `allowedMentions: { repliedUser: false }` and that the component ID embeds `message.author.id`.

- [ ] **Step 2: Run queue command tests to verify RED**

Run: `npm test -- test/createBot.test.ts`

Expected: FAIL because queue replies still use `PlaybackManager.queue()` and contain no components.

- [ ] **Step 3: Add a shared queue reply helper and explicit queue routes**

Import the button module and add:

```ts
function queueReply(
  playback: PlaybackManager,
  guildId: string,
  requesterId: string,
  requestedPage = 0,
) {
  const result = playback.queuePage(guildId, requestedPage);
  return {
    content: result.content,
    components: buildQueueButtons(requesterId, result.page, result.totalPages),
  };
}
```

Handle slash `queue` before generic playback commands and mention `queue` before the existing command list. Remove `queue` from `runPlaybackCommand` so interactive replies cannot accidentally regress to a plain string.

- [ ] **Step 4: Run queue command tests to verify GREEN**

Run: `npm test -- test/createBot.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing button ownership and live update tests**

Add button interaction fakes with `isButton: () => true` and other interaction type guards returning false. Prove:

```ts
expect(unauthorized.reply).toHaveBeenCalledWith({
  content: 'Only the user who requested this queue can change pages.',
  ephemeral: true,
});
expect(playback.queuePage).not.toHaveBeenCalled();
```

For an authorized click, return a clamped live result such as `{ content: 'Now: **Live**', page: 0, totalPages: 1 }`; assert `deferUpdate()`, `queuePage('guild-1', 4)`, and:

```ts
expect(editReply).toHaveBeenCalledWith({
  content: 'Now: **Live**',
  components: [],
});
```

This result simultaneously verifies live state, vanished-page clamping consumption, and removal of stale controls.

- [ ] **Step 6: Run button tests to verify RED**

Run: `npm test -- test/createBot.test.ts`

Expected: FAIL because button interactions are ignored.

- [ ] **Step 7: Implement queue button handling**

Extend interaction routing after the existing search-menu branch so current
test doubles and production type guards keep their established order:

```ts
} else if (interaction.isStringSelectMenu()) {
  void handleSearchSelection(interaction, playback, logger);
} else if (interaction.isButton()) {
  void handleQueueButton(interaction, playback);
}
```

`handleQueueButton` must ignore unrelated IDs, reject a mismatched user before reading queue state, validate cached-guild context with an ephemeral response, defer the authorized update, call `queueReply` with the encoded requested page, and edit the original reply. No paginator state or expiry timestamp is added.

- [ ] **Step 8: Run bot tests and commit**

Run: `npm test -- test/createBot.test.ts`

Expected: PASS.

```bash
git add src/bot/createBot.ts test/createBot.test.ts
git commit -m "feat: navigate live queues with buttons"
```

---

### Task 4: Expose skip-to commands and document behavior

**Files:**
- Modify: `src/commands/definitions.ts:3-47`
- Modify: `src/bot/createBot.ts:53-285`
- Modify: `README.md:68-79`
- Test: `test/commandDefinitions.test.ts`
- Test: `test/createBot.test.ts`

**Interfaces:**
- Consumes: `PlaybackManager.skipTo(member, position)` and existing parsed mention arguments.
- Produces: registered `/skip-to` with required integer `position >= 1`, strict `@Musina skip-to <position>` routing, updated help text, and operator documentation.

- [ ] **Step 1: Write failing command-definition tests**

```ts
it('defines skip-to with a required positive integer position', () => {
  const command = commandDefinitions.find((value) => value.name === 'skip-to');

  expect(command?.options).toEqual([expect.objectContaining({
    name: 'position',
    required: true,
    type: 4,
    min_value: 1,
  })]);
  expect(HELP_TEXT).toContain('`/skip-to <position>`');
});
```

- [ ] **Step 2: Run definition tests to verify RED**

Run: `npm test -- test/commandDefinitions.test.ts`

Expected: FAIL because `skip-to` is not registered.

- [ ] **Step 3: Register and describe `/skip-to`**

Add a `SlashCommandBuilder` with `.addIntegerOption(...)`, name `position`, required `true`, and minimum value `1`. Add help copy explaining that it jumps to an upcoming queue position, and include skip-to among commands requiring Musina's active voice channel.

- [ ] **Step 4: Run definition tests to verify GREEN**

Run: `npm test -- test/commandDefinitions.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing slash and mention routing tests**

Slash fake:

```ts
const getInteger = vi.fn().mockReturnValue(3);
// emit slash interaction with commandName: 'skip-to'
await vi.waitFor(() => expect(playback.skipTo).toHaveBeenCalledWith(member, 3));
expect(getInteger).toHaveBeenCalledWith('position', true);
expect(reply).toHaveBeenCalledWith({ content: 'Skipping to **Four**.' });
```

Mention fakes must prove `@Musina skip-to 3` forwards `3`, while missing, decimal, negative, mixed, and unsafe integer forms reply with `Provide a positive whole-number queue position.` without calling `skipTo`.

- [ ] **Step 6: Run routing tests to verify RED**

Run: `npm test -- test/createBot.test.ts`

Expected: FAIL because `skip-to` is not routed.

- [ ] **Step 7: Implement slash and strict mention routing**

In slash handling, read `interaction.options.getInteger('position', true)` and call `playback.skipTo(member, position)`. For mentions, accept only `/^[1-9]\d*$/`, convert with `Number`, require `Number.isSafeInteger`, then call the same manager method. Return the exact manager success or error copy through the existing response paths. Keep `skip` unchanged.

- [ ] **Step 8: Update README**

Add `/skip-to` to the command list. Explain that `/queue` shows 10 upcoming tracks at a time with live Previous/Next buttons usable only by the requester, and that `/skip-to N` jumps to the displayed one-based upcoming position. Add skip-to to the active voice-channel restriction.

- [ ] **Step 9: Run focused tests and commit**

Run: `npm test -- test/commandDefinitions.test.ts test/createBot.test.ts`

Expected: PASS.

```bash
git add src/commands/definitions.ts src/bot/createBot.ts README.md test/commandDefinitions.test.ts test/createBot.test.ts
git commit -m "feat: add skip-to command"
```

---

### Task 5: Full verification and push readiness

**Files:**
- Verify all changed files.

**Interfaces:**
- Consumes: all earlier task outputs.
- Produces: a clean, tested, linted, typechecked, buildable branch ready to push.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all tests PASS with no unhandled errors.

- [ ] **Step 2: Run static validation**

Run: `npm run lint`

Expected: PASS with no warnings or errors.

Run: `npm run typecheck`

Expected: PASS with no TypeScript errors.

Run: `npm run build`

Expected: PASS and emit the normal `dist` output.

- [ ] **Step 3: Review the final diff and repository state**

Run: `git diff HEAD~4 --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: clean after task commits; if a verification-driven fix was required, commit only that scoped fix before pushing.

- [ ] **Step 4: Push the current branch**

Run: `git push origin main`

Expected: the remote accepts the design, plan, and implementation commits.
