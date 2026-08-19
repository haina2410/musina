import { describe, expect, it, vi } from 'vitest';
import {
  createImportProgressReporter,
  uwufufuImportStart,
} from '../src/bot/importProgress.js';

describe('UwUFUFU import progress', () => {
  it('describes the number of songs before track inspection starts', () => {
    expect(uwufufuImportStart(256)).toBe('Found 256 UwUFUFU songs. Checking tracks…');
  });

  it('throttles intermediate edits but always publishes terminal progress', async () => {
    const edit = vi.fn<(content: string) => Promise<void>>().mockResolvedValue(undefined);
    const logger = { warn: vi.fn() };
    const timestamps = [0, 1_000, 2_000, 2_100];
    const now = vi.fn(() => timestamps.shift()!);
    const report = createImportProgressReporter(edit, logger as never, now);

    await report({ added: 4, processed: 5, skipped: 1, total: 256 });
    await report({ added: 24, processed: 25, skipped: 1, total: 256 });
    await report({ added: 50, processed: 256, skipped: 206, total: 256 });

    expect(edit.mock.calls.map(([content]) => content)).toEqual([
      'UwUFUFU import: checked 25/256 • queued 24 • skipped 1',
      'UwUFUFU import: checked 256/256 • queued 50 • skipped 206',
    ]);
  });

  it('logs a failed progress edit without rejecting the import callback', async () => {
    const error = new Error('Discord rate limit');
    const edit = vi.fn<(content: string) => Promise<void>>().mockRejectedValue(error);
    const logger = { warn: vi.fn() };
    const report = createImportProgressReporter(edit, logger as never, () => 2_000);

    await expect(report({ added: 1, processed: 2, skipped: 1, total: 2 }))
      .resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      { error },
      'UwUFUFU import progress update failed',
    );
  });
});
