import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../src/playback/types.js';

const voice = vi.hoisted(() => ({
  createAudioResource: vi.fn((stream: Readable) => stream),
  connection: {
    destroy: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
  },
  entersState: vi.fn().mockResolvedValue(undefined),
  joinVoiceChannel: vi.fn(),
  player: {
    on: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
    unpause: vi.fn(),
  },
}));

voice.joinVoiceChannel.mockImplementation(() => voice.connection);

vi.mock('@discordjs/voice', () => ({
  AudioPlayerStatus: { Idle: 'idle' },
  NoSubscriberBehavior: { Pause: 'pause' },
  VoiceConnectionStatus: { Connecting: 'connecting', Disconnected: 'disconnected' },
  createAudioPlayer: () => voice.player,
  createAudioResource: voice.createAudioResource,
  entersState: voice.entersState,
  joinVoiceChannel: voice.joinVoiceChannel,
}));

import { PlaybackManager } from '../src/playback/PlaybackManager.js';

function track(url: string, title: string): Track {
  return {
    canonicalUrl: url,
    durationSeconds: 180,
    requestedBy: 'user-1',
    source: 'youtube',
    title,
  };
}

function fixture(maxQueueSize = 50) {
  const inspect = vi.fn<(url: string, requestedBy: string) => Promise<Track>>();
  const resolver = {
    createAudio: vi.fn((value: Track) => ({
      cleanup: vi.fn(),
      stream: Readable.from([]),
      track: value,
    })),
    inspect,
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const guild = {
    channels: { cache: new Map() },
    id: 'guild-1',
    voiceAdapterCreator: {},
  };
  const members = new Map<string, { user: { bot: boolean } }>();
  const voiceChannel = {
    guild,
    id: 'voice-1',
    isVoiceBased: () => true,
    members,
  };
  Object.assign(members, {
    some: (predicate: (value: { user: { bot: boolean } }) => boolean) =>
      [...members.values()].some(predicate),
  });
  const member = {
    guild,
    id: 'user-1',
    user: { bot: false },
    voice: { channel: voiceChannel, channelId: 'voice-1' },
  };
  guild.channels.cache.set('voice-1', voiceChannel);
  voiceChannel.members.set('user-1', member);
  const textChannel = { send: vi.fn() };
  const voiceStatus = {
    clear: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    setPaused: vi.fn().mockResolvedValue(undefined),
  };
  const manager = new PlaybackManager(
    resolver as never,
    300_000,
    maxQueueSize,
    logger as never,
    voiceStatus as never,
  );
  return {
    guild,
    inspect,
    manager,
    member: member as never,
    textChannel: textChannel as never,
    voiceChannel,
    voiceStatus,
  };
}

describe('PlaybackManager.enqueueMany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves order while skipping tracks that fail inspection', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(track('https://youtu.be/three', 'Three'));

    await expect(manager.enqueueMany(member, textChannel, ['one', 'bad', 'three']))
      .resolves.toBe('Imported 2 tracks (1 skipped). Now playing **One**.');
    expect(inspect.mock.calls.map(([url]) => url)).toEqual(['one', 'bad', 'three']);
    expect(manager.queue('guild-1')).toBe('Now: **One**\n1. Three');
  });

  it('counts overflow as skipped without inspecting it', async () => {
    const { inspect, manager, member, textChannel } = fixture(1);
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'));

    await expect(manager.enqueueMany(member, textChannel, ['one', 'two', 'three']))
      .resolves.toBe('Imported 2 tracks (1 skipped). Now playing **One**.');
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(manager.queue('guild-1')).toBe('Now: **One**\n1. Two');
  });

  it('includes entries rejected by the list importer in the skipped count', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));

    await expect(manager.enqueueMany(member, textChannel, ['one'], 2))
      .resolves.toBe('Imported 1 track (2 skipped). Now playing **One**.');
  });

  it('fails without creating a session when every candidate fails inspection', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect.mockRejectedValue(new Error('unavailable'));

    await expect(manager.enqueueMany(member, textChannel, ['bad', 'worse']))
      .rejects.toThrow('No tracks from that list could be queued');
    expect(manager.queue('guild-1')).toBe('Nothing is playing.');
    expect(voice.joinVoiceChannel).not.toHaveBeenCalled();
  });
});

describe('PlaybackManager.shuffle', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('randomizes upcoming tracks without changing the current track', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'))
      .mockResolvedValueOnce(track('https://youtu.be/three', 'Three'))
      .mockResolvedValueOnce(track('https://youtu.be/four', 'Four'));
    await manager.enqueue(member, textChannel, 'one');
    await manager.enqueue(member, textChannel, 'two');
    await manager.enqueue(member, textChannel, 'three');
    await manager.enqueue(member, textChannel, 'four');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);

    expect(manager.shuffle(member)).toBe('Shuffled 3 tracks.');

    expect(manager.queue('guild-1')).toBe('Now: **One**\n1. Three\n2. Four\n3. Two');
    expect(random).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1])('rejects a queue with %i upcoming tracks', async (upcoming) => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');
    if (upcoming === 1) {
      inspect.mockResolvedValueOnce(track('https://youtu.be/two', 'Two'));
      await manager.enqueue(member, textChannel, 'two');
    }

    expect(() => manager.shuffle(member)).toThrow('Queue at least two tracks before shuffling.');
  });

  it('rejects callers outside the active voice channel', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'))
      .mockResolvedValueOnce(track('https://youtu.be/three', 'Three'));
    await manager.enqueue(member, textChannel, 'one');
    await manager.enqueue(member, textChannel, 'two');
    await manager.enqueue(member, textChannel, 'three');
    const outsider = { ...member, voice: { channel: null, channelId: 'voice-2' } };

    expect(() => manager.shuffle(outsider)).toThrow('Join my voice channel to control playback.');
  });
});

describe('PlaybackManager voice channel status', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

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
  });

  it('pauses and resumes playback through the manual controls', async () => {
    const { inspect, manager, member, textChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');

    expect(manager.pause(member)).toBe('Paused.');
    expect(() => manager.pause(member)).toThrow('Playback is already paused.');
    expect(manager.resume(member)).toBe('Resumed.');
    expect(() => manager.resume(member)).toThrow('Playback is not paused.');

    expect(voice.player.pause).toHaveBeenCalledOnce();
    expect(voice.player.unpause).toHaveBeenCalledOnce();
    expect(voiceStatus.setPaused).toHaveBeenCalledWith('voice-1', false);
    expect(voiceStatus.set).toHaveBeenLastCalledWith('voice-1', 'One');
  });

  it('allows the next track to be paused after skipping a manually paused track', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect
      .mockResolvedValueOnce(track('https://youtu.be/one', 'One'))
      .mockResolvedValueOnce(track('https://youtu.be/two', 'Two'));
    await manager.enqueue(member, textChannel, 'one');
    await manager.enqueue(member, textChannel, 'two');
    const idle = voice.player.on.mock.calls.find(([event]) => event === 'idle')?.[1];

    manager.pause(member);
    manager.skip(member);
    idle();

    expect(manager.pause(member)).toBe('Paused.');
    expect(voice.player.pause).toHaveBeenCalledTimes(2);
  });

  it('keeps a manual pause when a listener returns', async () => {
    vi.useFakeTimers();
    const { guild, inspect, manager, member, textChannel, voiceChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');
    manager.pause(member);

    voiceChannel.members.clear();
    manager.handleVoiceStateUpdate(
      { channelId: 'voice-1', guild } as never,
      { channelId: null, guild } as never,
    );
    voiceChannel.members.set('user-1', member);
    manager.handleVoiceStateUpdate(
      { channelId: null, guild } as never,
      { channelId: 'voice-1', guild } as never,
    );

    expect(voice.player.pause).toHaveBeenCalledOnce();
    expect(voice.player.unpause).not.toHaveBeenCalled();
    expect(voiceStatus.setPaused).toHaveBeenLastCalledWith('voice-1', false);
  });

  it('does not reset the empty-channel timeout for repeated empty updates', async () => {
    vi.useFakeTimers();
    const { guild, inspect, manager, member, textChannel, voiceChannel, voiceStatus } = fixture();
    inspect.mockResolvedValueOnce(track('https://youtu.be/one', 'One'));
    await manager.enqueue(member, textChannel, 'one');
    voiceChannel.members.clear();

    manager.handleVoiceStateUpdate(
      { channelId: 'voice-1', guild } as never,
      { channelId: null, guild } as never,
    );
    await vi.advanceTimersByTimeAsync(150_000);
    manager.handleVoiceStateUpdate(
      { channelId: 'voice-1', guild } as never,
      { channelId: null, guild } as never,
    );
    await vi.advanceTimersByTimeAsync(150_000);

    expect(voice.player.pause).toHaveBeenCalledOnce();
    expect(voiceStatus.setPaused).toHaveBeenCalledOnce();
    expect(voice.connection.destroy).toHaveBeenCalledOnce();
  });
});
