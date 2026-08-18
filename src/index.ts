import { createBot } from './bot/createBot.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { PlaybackManager } from './playback/PlaybackManager.js';
import { YtDlpResolver } from './playback/YtDlpResolver.js';

const config = loadConfig();
const logger = createLogger(config.logLevel);
const resolver = new YtDlpResolver(config.ytDlpPath, config.maxTrackSeconds, logger);
const playback = new PlaybackManager(
  resolver,
  config.idleDisconnectMs,
  config.maxQueueSize,
  logger,
);
const client = createBot(playback, logger);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  playback.shutdown();
  client.destroy();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

await client.login(config.token);
