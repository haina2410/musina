# Pause, Resume, and Empty Voice Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual pause/resume commands and automatically pause, resume, or disconnect playback based on non-bot voice-channel occupancy.

**Architecture:** `PlaybackManager` owns both manual and empty-channel pause state for each guild session. `createBot` forwards Discord voice-state updates to the manager; `VoiceChannelStatus` formats paused statuses while the manager controls timers and playback transitions.

**Tech Stack:** TypeScript 6, discord.js 14, @discordjs/voice 0.19, Vitest 4

## Global Constraints

- `/pause`, `/resume`, `@Musina pause`, and `@Musina resume` require the caller to be in the bot's active voice channel.
- A manual pause is never automatically resumed by a voice join.
- The last non-bot listener leaving sets the voice status exactly to `paused - waiting for someone...`.
- A non-bot listener returning during an automatic pause resumes playback and restores the current track status.
- Continued emptiness destroys the session after `IDLE_DISCONNECT_MS`, whose default is `300000` milliseconds.
- Repeated voice-state events must not duplicate pause/resume calls or disconnect timers.
- Keep new test coverage focused; do not add broad combinatorial suites.

---

### Task 1: Playback pause state and empty-channel lifecycle

**Files:**
- Modify: `src/playback/VoiceChannelStatus.ts`
- Modify: `src/playback/PlaybackManager.ts`
- Test: `test/VoiceChannelStatus.test.ts`
- Test: `test/PlaybackManager.test.ts`

**Interfaces:**
- Consumes: existing `PlaybackManager` session lifecycle, `idleDisconnectMs`, `AudioPlayer.pause()`, `AudioPlayer.unpause()`, and Discord `VoiceState` channel member caches.
- Produces: `PlaybackManager.pause(member): string`, `PlaybackManager.resume(member): string`, and `PlaybackManager.handleVoiceStateUpdate(oldState, newState): void` for Task 2.

- [ ] **Step 1: Write focused failing status and lifecycle tests**

Extend the audio-player fake with `pause` and `unpause`. Add one real formatter test and one fake-timer lifecycle test. The lifecycle fixture must expose a mutable voice channel `members` collection containing a non-bot listener and the created connection's `destroy` spy.

```ts
it('sets paused and waiting statuses without the music prefix', async () => {
  const { put, status } = fixture();

  await status.setPaused('voice-1', false);
  await status.setPaused('voice-1', true);

  expect(put).toHaveBeenNthCalledWith(1, Routes.channelVoiceStatus('voice-1'), {
    body: { status: 'paused' },
  });
  expect(put).toHaveBeenNthCalledWith(2, Routes.channelVoiceStatus('voice-1'), {
    body: { status: 'paused - waiting for someone...' },
  });
});
```

```ts
it('pauses while empty, resumes on return, and disconnects after continued emptiness', async () => {
  vi.useFakeTimers();
  const { guild, inspect, manager, member, textChannel, voiceChannel, voiceStatus } = fixture();
  inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
  await manager.enqueue(member, textChannel, 'one');

  voiceChannel.members.clear();
  manager.handleVoiceStateUpdate(
    { channelId: 'voice-1', guild } as never,
    { channelId: null, guild } as never,
  );
  expect(voice.player.pause).toHaveBeenCalledTimes(1);
  expect(voiceStatus.setPaused).toHaveBeenCalledWith('voice-1', true);

  voiceChannel.members.set('user-1', member);
  manager.handleVoiceStateUpdate(
    { channelId: null, guild } as never,
    { channelId: 'voice-1', guild } as never,
  );
  expect(voice.player.unpause).toHaveBeenCalledTimes(1);
  expect(voiceStatus.set).toHaveBeenLastCalledWith('voice-1', 'One');

  voiceChannel.members.clear();
  manager.handleVoiceStateUpdate(
    { channelId: 'voice-1', guild } as never,
    { channelId: null, guild } as never,
  );
  await vi.advanceTimersByTimeAsync(300_000);
  expect(voice.connection.destroy).toHaveBeenCalledOnce();
  vi.useRealTimers();
});
```

Update the fixture concretely so `guild.channels.cache` contains `voiceChannel`, `voiceChannel.isVoiceBased()` returns `true`, its `members` map initially holds the human `member`, `voice.connection` is the object returned by `joinVoiceChannel`, and the voice-status fake includes `setPaused: vi.fn().mockResolvedValue(undefined)`. Reset fake timers in `afterEach` so a failed assertion cannot leak timer state.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run test/VoiceChannelStatus.test.ts test/PlaybackManager.test.ts
```

Expected: FAIL because `setPaused`, player pause-state handling, and `handleVoiceStateUpdate` do not exist.

- [ ] **Step 3: Implement paused status formatting and session state**

Add the status boundary:

```ts
setPaused(channelId: string, waitingForListener: boolean): Promise<void> {
  return this.update(
    channelId,
    waitingForListener ? 'paused - waiting for someone...' : 'paused',
    'set',
  );
}
```

Add `manualPaused`, `emptyPaused`, and `emptyTimer` to `Session`. Implement command methods using `requireSameChannel`: `/pause` rejects no-current/already-paused playback, pauses once, records `manualPaused`, and sets the manual paused status; `/resume` rejects unpaused playback, cancels any empty timer, clears both pause flags, calls `unpause()`, and restores the current title.

- [ ] **Step 4: Implement idempotent voice occupancy transitions**

Add a public handler using the active channel's current member cache:

```ts
handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): void {
  const session = this.sessions.get(newState.guild.id);
  if (!session || (oldState.channelId !== session.channelId && newState.channelId !== session.channelId)) return;
  const channel = newState.guild.channels.cache.get(session.channelId);
  if (!channel?.isVoiceBased() || !session.current) return;
  const hasListener = channel.members.some((member) => !member.user.bot);
  if (hasListener) this.handleListenerReturn(session);
  else this.handleEmptyChannel(newState.guild.id, session);
}
```

`handleEmptyChannel` sets `emptyPaused`, pauses only when not already manually paused, sets the waiting status, and creates exactly one `idleDisconnectMs` timer. `handleListenerReturn` cancels the timer and clears `emptyPaused`; it unpauses/restores the song only when `manualPaused` is false, otherwise it restores the manual paused status. `destroy` clears both the natural-idle timer and the empty-channel timer.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run test/VoiceChannelStatus.test.ts test/PlaybackManager.test.ts
```

Expected: all focused tests PASS with pristine output.

- [ ] **Step 6: Commit Task 1**

```bash
git add src/playback/VoiceChannelStatus.ts src/playback/PlaybackManager.ts test/VoiceChannelStatus.test.ts test/PlaybackManager.test.ts
git commit -m "feat: add playback pause lifecycle"
```

---

### Task 2: Discord commands, voice event wiring, and documentation

**Files:**
- Modify: `src/commands/definitions.ts`
- Modify: `src/bot/createBot.ts`
- Modify: `test/commandDefinitions.test.ts`
- Modify: `test/createBot.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `PlaybackManager.pause(member): string`, `PlaybackManager.resume(member): string`, and `PlaybackManager.handleVoiceStateUpdate(oldState, newState): void` from Task 1.
- Produces: registered slash commands, mention-command routing, voice-state forwarding, and user-facing help/documentation.

- [ ] **Step 1: Write focused failing command and voice-event tests**

Update the existing command-name expectation to the following literal order:

```ts
expect(commandDefinitions.map((command) => command.name)).toEqual([
  'play',
  'pause',
  'resume',
  'skip',
  'stop',
  'queue',
  'nowplaying',
  'shuffle',
  'help',
]);
```

Extend the existing parameterized mention-dispatch test with `['pause', 'Paused.']` and `['resume', 'Resumed.']`, add `pause` and `resume` spies to its playback fake, and add one bot wiring test:

```ts
it('forwards voice state updates to playback', () => {
  const client = new EventEmitter();
  const playback = { handleVoiceStateUpdate: vi.fn() };
  const oldState = { channelId: 'voice-1' };
  const newState = { channelId: null };
  createBot(playback as never, { info: vi.fn() } as never, client as never);

  client.emit('voiceStateUpdate', oldState, newState);

  expect(playback.handleVoiceStateUpdate).toHaveBeenCalledWith(oldState, newState);
});
```

The dispatch table additions must expect `Paused.` and `Resumed.` and verify the matching manager method receives the member.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run test/commandDefinitions.test.ts test/createBot.test.ts
```

Expected: FAIL because pause/resume are not registered or routed and no voice-state handler is attached.

- [ ] **Step 3: Register and route both commands**

Add slash definitions and help lines for `/pause` and `/resume`. Add both names to the mention command allowlist and command switch:

```ts
case 'pause': return playback.pause(member);
case 'resume': return playback.resume(member);
```

Update the control-permission help sentence to include pause and resume.

- [ ] **Step 4: Forward Discord voice-state events**

Register the event alongside the existing listeners:

```ts
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  playback.handleVoiceStateUpdate(oldState, newState);
});
```

- [ ] **Step 5: Update README commands and behavior**

Add `/pause` and `/resume` to the available command list. Document that manual pause requires explicit resume, while an empty channel pauses automatically, displays `paused - waiting for someone...`, resumes on listener return, and disconnects after the configured five-minute default.

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npx vitest run test/commandDefinitions.test.ts test/createBot.test.ts
npm test
npm run lint
npm run typecheck
```

Expected: all commands exit zero with pristine output.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/commands/definitions.ts src/bot/createBot.ts test/commandDefinitions.test.ts test/createBot.test.ts README.md
git commit -m "feat: add pause and resume commands"
```
