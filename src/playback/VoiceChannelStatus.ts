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
