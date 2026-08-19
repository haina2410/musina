import type { Logger } from 'pino';
import type { ImportProgress, ImportProgressCallback } from '../playback/PlaybackManager.js';

type ProgressEdit = (content: string) => Promise<unknown>;

export function uwufufuImportStart(total: number): string {
  return `Found ${total} UwUFUFU songs. Checking tracks…`;
}

function formatProgress(progress: ImportProgress): string {
  return [
    `UwUFUFU import: checked ${progress.processed}/${progress.total}`,
    `queued ${progress.added}`,
    `skipped ${progress.skipped}`,
  ].join(' • ');
}

export function createImportProgressReporter(
  edit: ProgressEdit,
  logger: Pick<Logger, 'warn'>,
  now: () => number = Date.now,
  minIntervalMs = 2_000,
): ImportProgressCallback {
  let lastEditAt = now();
  return async (progress) => {
    const currentTime = now();
    const complete = progress.processed >= progress.total;
    if (!complete && currentTime - lastEditAt < minIntervalMs) return;
    lastEditAt = currentTime;
    try {
      await edit(formatProgress(progress));
    } catch (error) {
      logger.warn({ error }, 'UwUFUFU import progress update failed');
    }
  };
}
