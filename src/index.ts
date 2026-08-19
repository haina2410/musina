import { createBot, createDiscordClient } from './bot/createBot.js';
import { loadConfig } from './config.js';
import { UwufufuImporter } from './importers/UwufufuImporter.js';
import { YoutubePlaylistImporter } from './importers/YoutubePlaylistImporter.js';
import { createLogger } from './logger.js';
import { PlaybackManager } from './playback/PlaybackManager.js';
import { PlayInput } from './playback/PlayInput.js';
import { VoiceChannelStatus } from './playback/VoiceChannelStatus.js';
import { YtDlpResolver } from './playback/YtDlpResolver.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const resolver = new YtDlpResolver(config.ytDlpPath, config.maxTrackSeconds, logger);
const client = createDiscordClient();
const voiceStatus = new VoiceChannelStatus(client.rest, logger);
const playInput = new PlayInput(
  new UwufufuImporter(),
  new YoutubePlaylistImporter(config.ytDlpPath, config.maxQueueSize + 1),
);
const playback = new PlaybackManager(
  resolver,
  config.idleDisconnectMs,
  config.maxQueueSize,
  logger,
  voiceStatus,
);
createBot(playback, logger, client, playInput);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  playback.shutdown();
  client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.token);
