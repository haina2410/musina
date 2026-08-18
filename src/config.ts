import 'dotenv/config';

export interface Config {
  clientId: string;
  guildId?: string;
  idleDisconnectMs: number;
  logLevel: string;
  maxQueueSize: number;
  maxTrackSeconds: number;
  token: string;
  ytDlpPath: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function loadConfig(): Config {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  return {
    clientId: required('DISCORD_CLIENT_ID'),
    ...(guildId ? { guildId } : {}),
    idleDisconnectMs: positiveInteger('IDLE_DISCONNECT_MS', 300_000),
    logLevel: process.env.LOG_LEVEL?.trim() || 'info',
    maxQueueSize: positiveInteger('MAX_QUEUE_SIZE', 50),
    maxTrackSeconds: positiveInteger('MAX_TRACK_SECONDS', 14_400),
    token: required('DISCORD_TOKEN'),
    ytDlpPath: process.env.YTDLP_PATH?.trim() || 'yt-dlp',
  };
}
