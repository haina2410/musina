import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchCandidate, Track } from '../src/playback/types.js';

const voice = vi.hoisted(() => ({
  createAudioResource: vi.fn((stream: Readable) => stream),
  entersState: vi.fn().mockResolvedValue(undefined),
  joinVoiceChannel: vi.fn(() => ({
    destroy: vi.fn(),
    on: vi.fn(),
    subscribe: vi.fn(),
  })),
  player: {
    on: vi.fn(),
    play: vi.fn(),
    stop: vi.fn(),
  },
}));

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
  const search = vi.fn<(query: string, limit: number) => Promise<SearchCandidate[]>>();
  const resolver = {
    createAudio: vi.fn((value: Track) => ({
      cleanup: vi.fn(),
      stream: Readable.from([]),
      track: value,
    })),
    inspect,
    search,
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const guild = { id: 'guild-1', voiceAdapterCreator: {} };
  const voiceChannel = { guild, id: 'voice-1' };
  const member = {
    guild,
    id: 'user-1',
    voice: { channel: voiceChannel, channelId: 'voice-1' },
  };
  const textChannel = { send: vi.fn() };
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
  return {
    inspect,
    manager,
    member: member as never,
    search,
    textChannel: textChannel as never,
    voiceStatus,
  };
}

describe('PlaybackManager search', () => {
  beforeEach(() => vi.clearAllMocks());

  it('validates playback before searching and queues the inspected best match', async () => {
    const { inspect, manager, member, search, textChannel } = fixture();
    search.mockResolvedValue([{
      durationSeconds: 180,
      title: 'Candidate',
      url: 'https://youtu.be/abcdefghijk',
    }]);
    inspect.mockResolvedValue(track('https://youtu.be/abcdefghijk', 'Candidate'));

    await expect(manager.enqueueQuery(member, textChannel, 'candidate song'))
      .resolves.toBe('Now playing **Candidate**.');
    expect(search).toHaveBeenCalledWith('candidate song', 1);
    expect(inspect).toHaveBeenCalledWith('https://youtu.be/abcdefghijk', 'user-1');
  });

  it('does not search when the requester is outside a voice channel', async () => {
    const { manager, member, search, textChannel } = fixture();
    const outsider = { ...member, voice: { channel: null, channelId: null } };

    await expect(manager.enqueueQuery(outsider, textChannel, 'candidate song'))
      .rejects.toThrow('Join a voice channel first.');
    expect(search).not.toHaveBeenCalled();
  });

  it('discovers five results without requiring voice membership', async () => {
    const { manager, search } = fixture();
    const candidates = [{
      durationSeconds: 180,
      title: 'Candidate',
      url: 'https://youtu.be/abcdefghijk',
    }];
    search.mockResolvedValue(candidates);

    await expect(manager.search('candidate song')).resolves.toBe(candidates);
    expect(search).toHaveBeenCalledWith('candidate song', 5);
  });
});

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
