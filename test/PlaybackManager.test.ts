import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '../src/playback/types.js';

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
  const resolver = {
    createAudio: vi.fn((value: Track) => ({
      cleanup: vi.fn(),
      stream: Readable.from([]),
      track: value,
    })),
    inspect,
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
  const manager = new PlaybackManager(
    resolver as never,
    300_000,
    maxQueueSize,
    logger as never,
  );
  return {
    inspect,
    manager,
    member: member as never,
    textChannel: textChannel as never,
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

  it('fails without creating a session when every candidate fails inspection', async () => {
    const { inspect, manager, member, textChannel } = fixture();
    inspect.mockRejectedValue(new Error('unavailable'));

    await expect(manager.enqueueMany(member, textChannel, ['bad', 'worse']))
      .rejects.toThrow('No tracks from that list could be queued');
    expect(manager.queue('guild-1')).toBe('Nothing is playing.');
    expect(voice.joinVoiceChannel).not.toHaveBeenCalled();
  });
});
