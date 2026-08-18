# Voice Channel Song Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display `🎵 <song title>` as the active Discord voice channel status and clear it whenever playback is no longer active.

**Architecture:** A focused `VoiceChannelStatus` service owns Discord REST routing, formatting, truncation, and non-fatal error handling. `PlaybackManager` invokes that service at existing track/session lifecycle boundaries, while `index.ts` supplies the authenticated REST manager from the same Discord client used by the bot.

**Tech Stack:** Node.js 22, TypeScript 6, discord.js 14.27, @discordjs/voice 0.19, Vitest 4

## Global Constraints

- Set the status to exactly `🎵 <song title>` for the current track.
- Limit the status to Discord's 500-character maximum.
- Clear the status as soon as the queue becomes empty and during active-session teardown.
- Status update failures must be logged and must never interrupt playback or cleanup.
- Use the installed discord.js client's authenticated REST manager and `Routes.channelVoiceStatus(channelId)`.
- Require only Discord's **Set Voice Channel Status** permission in addition to existing bot permissions.

---

### Task 1: Discord Voice Channel Status Service

**Files:**
- Create: `src/playback/VoiceChannelStatus.ts`
- Create: `test/VoiceChannelStatus.test.ts`

**Interfaces:**
- Consumes: discord.js `REST.put(route, { body })`, `Routes.channelVoiceStatus(channelId)`, and a Pino `Logger`.
- Produces: `VoiceChannelStatus.set(channelId: string, title: string): Promise<void>` and `VoiceChannelStatus.clear(channelId: string): Promise<void>`.

- [ ] **Step 1: Write failing REST behavior tests**

```ts
import { Routes } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { VoiceChannelStatus } from '../src/playback/VoiceChannelStatus.js';

function fixture() {
  const put = vi.fn().mockResolvedValue(undefined);
  const logger = { warn: vi.fn() };
  return {
    logger,
    put,
    status: new VoiceChannelStatus({ put } as never, logger as never),
  };
}

describe('VoiceChannelStatus', () => {
  it('sets a music-prefixed status through the Discord voice-status route', async () => {
    const { put, status } = fixture();

    await status.set('voice-1', 'Example Song');

    expect(put).toHaveBeenCalledWith(Routes.channelVoiceStatus('voice-1'), {
      body: { status: '🎵 Example Song' },
    });
  });

  it('limits the formatted status to 500 Unicode characters', async () => {
    const { put, status } = fixture();

    await status.set('voice-1', 'x'.repeat(600));

    const request = put.mock.calls[0]?.[1] as { body: { status: string } };
    expect([...request.body.status]).toHaveLength(500);
    expect(request.body.status.startsWith('🎵 ')).toBe(true);
  });

  it('clears the voice channel status with null', async () => {
    const { put, status } = fixture();

    await status.clear('voice-1');

    expect(put).toHaveBeenCalledWith(Routes.channelVoiceStatus('voice-1'), {
      body: { status: null },
    });
  });

  it('logs and absorbs Discord REST failures', async () => {
    const { logger, put, status } = fixture();
    const error = new Error('Missing Permissions');
    put.mockRejectedValueOnce(error);

    await expect(status.set('voice-1', 'Example Song')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { channelId: 'voice-1', error, operation: 'set' },
      'voice channel status update failed',
    );
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `npm test -- test/VoiceChannelStatus.test.ts`

Expected: FAIL because `src/playback/VoiceChannelStatus.ts` does not exist.

- [ ] **Step 3: Implement the minimal status service**

```ts
import { Routes, type REST } from 'discord.js';
import type { Logger } from 'pino';

export class VoiceChannelStatus {
  constructor(
    private readonly rest: REST,
    private readonly logger: Logger,
  ) {}

  set(channelId: string, title: string): Promise<void> {
    const status = [...`🎵 ${title}`].slice(0, 500).join('');
    return this.update(channelId, status, 'set');
  }

  clear(channelId: string): Promise<void> {
    return this.update(channelId, null, 'clear');
  }

  private async update(
    channelId: string,
    status: string | null,
    operation: 'clear' | 'set',
  ): Promise<void> {
    try {
      await this.rest.put(Routes.channelVoiceStatus(channelId), { body: { status } });
    } catch (error) {
      this.logger.warn(
        { channelId, error, operation },
        'voice channel status update failed',
      );
    }
  }
}
```

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- test/VoiceChannelStatus.test.ts`

Expected: all four tests PASS.

- [ ] **Step 5: Commit the service**

```bash
git add src/playback/VoiceChannelStatus.ts test/VoiceChannelStatus.test.ts
git commit -m "feat: add voice channel status service"
```

### Task 2: Playback Lifecycle Integration

**Files:**
- Modify: `src/playback/PlaybackManager.ts`
- Modify: `test/PlaybackManager.test.ts`

**Interfaces:**
- Consumes: `VoiceChannelStatus.set(channelId, title)` and `VoiceChannelStatus.clear(channelId)` from Task 1.
- Produces: playback lifecycle calls that set on every `play()` and clear exactly once when an active status ends.

- [ ] **Step 1: Add a status double to the playback fixture**

Add this fixture dependency and pass it immediately after `logger` in the `PlaybackManager` constructor:

```ts
const voiceStatus = {
  clear: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
};

const manager = new PlaybackManager(
  resolver as never,
  300_000,
  maxQueueSize,
  logger as never,
  voiceStatus as never,
);
```

Return `voiceStatus` from `fixture()`.

- [ ] **Step 2: Write failing playback lifecycle tests**

```ts
describe('PlaybackManager voice channel status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sets the current title when a track starts', async () => {
    const { inspect, manager, member, textChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));

    await manager.enqueue(member, textChannel, 'one');

    expect(voiceStatus.set).toHaveBeenCalledWith('voice-1', 'One');
  });

  it('replaces the status on advance and clears it when the queue ends', async () => {
    const { inspect, manager, member, textChannel, voiceStatus } = fixture();
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'));
    await manager.enqueue(member, textChannel, 'one');
    await manager.enqueue(member, textChannel, 'two');
    const idle = voice.player.on.mock.calls.find(([event]) => event === 'idle')?.[1];

    idle();
    expect(voiceStatus.set).toHaveBeenLastCalledWith('voice-1', 'Two');

    idle();
    expect(voiceStatus.clear).toHaveBeenCalledTimes(1);
    expect(voiceStatus.clear).toHaveBeenCalledWith('voice-1');
  });

  it('clears an active status when stopped', async () => {
    const { inspect, manager, member, textChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');

    manager.stop(member);

    expect(voiceStatus.clear).toHaveBeenCalledTimes(1);
    expect(voiceStatus.clear).toHaveBeenCalledWith('voice-1');
  });

  it('clears each active session during shutdown', async () => {
    const { inspect, manager, member, textChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');

    manager.shutdown();

    expect(voiceStatus.clear).toHaveBeenCalledTimes(1);
    expect(voiceStatus.clear).toHaveBeenCalledWith('voice-1');
  });
});
```

- [ ] **Step 3: Run the focused tests and verify the lifecycle assertions fail**

Run: `npm test -- test/PlaybackManager.test.ts`

Expected: FAIL because `PlaybackManager` does not invoke the status dependency.

- [ ] **Step 4: Implement lifecycle tracking**

Import `VoiceChannelStatus`, add `statusActive: boolean` to `Session`, initialize it to
`false`, and add the service after `logger` in the constructor:

```ts
constructor(
  private readonly resolver: YtDlpResolver,
  private readonly idleDisconnectMs: number,
  private readonly maxQueueSize: number,
  private readonly logger: Logger,
  private readonly voiceStatus: VoiceChannelStatus,
) {}
```

At the end of `play(session)`, mark and set the status:

```ts
session.statusActive = true;
void this.voiceStatus.set(session.channelId, session.current.title);
```

When `advance()` finds no next track, clear before starting the idle timer. In
`destroy()`, clear before stopping the player. Use this helper for both paths:

```ts
private clearStatus(session: Session): void {
  if (!session.statusActive) return;
  session.statusActive = false;
  void this.voiceStatus.clear(session.channelId);
}
```

- [ ] **Step 5: Run focused and full playback tests**

Run: `npm test -- test/PlaybackManager.test.ts test/VoiceChannelStatus.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit playback integration**

```bash
git add src/playback/PlaybackManager.ts test/PlaybackManager.test.ts
git commit -m "feat: sync song with voice channel status"
```

### Task 3: Client Wiring and Operator Documentation

**Files:**
- Modify: `src/bot/createBot.ts`
- Modify: `src/index.ts`
- Modify: `test/createBot.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: discord.js `Client.rest` and Task 1's `VoiceChannelStatus` constructor.
- Produces: `createDiscordClient(): Client` and `createBot(playback, logger, client?): Client`, allowing `index.ts` to construct the status service with the bot client's authenticated REST manager before attaching event handlers.

- [ ] **Step 1: Write a failing client-injection test**

```ts
import { createBot, createDiscordClient } from '../src/bot/createBot.js';

it('attaches bot handlers to a provided Discord client', () => {
  const client = createDiscordClient();

  const result = createBot({} as never, { info: vi.fn() } as never, client);

  expect(result).toBe(client);
  expect(result.eventNames()).toContain(Events.ClientReady);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- test/createBot.test.ts`

Expected: FAIL because `createDiscordClient` is not exported and `createBot` does not accept a client.

- [ ] **Step 3: Extract client construction and support injection**

```ts
export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [] },
  });
}

export function createBot(
  playback: PlaybackManager,
  logger: Logger,
  client = createDiscordClient(),
): Client {
  const playInput = new PlayInput();
  client.on(
    Events.ClientReady,
    (readyClient) => logger.info({ user: readyClient.user.tag }, 'bot ready'),
  );
  client.on('interactionCreate', (interaction) => {
    if (interaction.isChatInputCommand()) {
      void handleCommand(interaction, playback, playInput, logger);
    }
  });
  client.on('messageCreate', (message) => void handleMessage(message, playback, logger));
  return client;
}
```

Update `index.ts` in this order:

```ts
const client = createDiscordClient();
const voiceStatus = new VoiceChannelStatus(client.rest, logger);
const playback = new PlaybackManager(
  resolver,
  config.idleDisconnectMs,
  config.maxQueueSize,
  logger,
  voiceStatus,
);
createBot(playback, logger, client);
```

- [ ] **Step 4: Document the required permission**

Change the README invite permission list to include `Set Voice Channel Status`:

```md
3. Invite the bot with the `bot` and `applications.commands` scopes. Grant it
   View Channels, Send Messages, Connect, Speak, and Set Voice Channel Status
   permissions.
```

- [ ] **Step 5: Run the client test and static checks**

Run: `npm test -- test/createBot.test.ts && npm run typecheck && npm run lint`

Expected: client tests PASS, typecheck PASS, and lint PASS with no warnings.

- [ ] **Step 6: Commit wiring and documentation**

```bash
git add src/bot/createBot.ts src/index.ts test/createBot.test.ts README.md
git commit -m "feat: wire voice channel song status"
```

### Task 4: Full Verification and Publication

**Files:**
- Verify: all files listed above

**Interfaces:**
- Consumes: all feature behavior and documentation from Tasks 1-3.
- Produces: a verified commit series pushed to the configured upstream branch.

- [ ] **Step 1: Run the complete automated verification suite**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: every command exits 0 with no test failures, lint errors, type errors,
or build errors.

- [ ] **Step 2: Audit the diff against the approved design**

Run:

```bash
git diff HEAD~3 --check
git diff HEAD~3 -- src test README.md
git status --short
```

Expected: no whitespace errors, every design requirement has corresponding code
or test evidence, and the worktree is clean.

- [ ] **Step 3: Confirm publication target**

Run:

```bash
git branch --show-current
git remote -v
git status --short --branch
```

Expected: a named branch with a configured push remote and only the intentional
commits ahead of upstream.

- [ ] **Step 4: Push the branch**

Run: `git push`

Expected: push succeeds and local branch reports synchronized with upstream.
