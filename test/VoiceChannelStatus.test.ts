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
