import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));

import { YoutubePlaylistImporter } from '../src/importers/YoutubePlaylistImporter.js';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>;
    stderr: PassThrough;
    stdout: PassThrough;
  };
  child.kill = vi.fn();
  child.stderr = new PassThrough();
  child.stdout = new PassThrough();
  return child;
}

describe('YoutubePlaylistImporter', () => {
  beforeEach(() => childProcess.spawn.mockReset());
  afterEach(() => vi.useRealTimers());

  it('returns flat playlist entries in provider order and counts malformed entries', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({
        entries: [
          { id: 'oMGPJ4uE_W8' },
          null,
          { id: 'abcdefghijk' },
          { id: 'invalid' },
        ],
      }));
      child.emit('close', 0);
    });
    const importer = new YoutubePlaylistImporter('custom-yt-dlp', 51);
    const url = 'https://www.youtube.com/watch?v=oMGPJ4uE_W8&list=RDoMGPJ4uE_W8&start_radio=1';

    await expect(importer.load(url)).resolves.toEqual({
      skipped: 2,
      urls: [
        'https://www.youtube.com/watch?v=oMGPJ4uE_W8',
        'https://www.youtube.com/watch?v=abcdefghijk',
      ],
    });
    expect(childProcess.spawn).toHaveBeenCalledWith('custom-yt-dlp', [
      '--js-runtimes', 'node',
      '--dump-single-json', '--flat-playlist', '--yes-playlist', '--ignore-errors',
      '--no-warnings', '--socket-timeout', '15', '--playlist-end', '51', url,
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it('rejects non-playlist input before starting yt-dlp', async () => {
    const importer = new YoutubePlaylistImporter('custom-yt-dlp', 51);

    await expect(importer.load('https://www.youtube.com/watch?v=oMGPJ4uE_W8'))
      .rejects.toThrow('not a supported YouTube playlist URL');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('rejects a playlist with no playable video entries', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ entries: [null, { id: 'invalid' }] }));
      child.emit('close', 0);
    });
    const importer = new YoutubePlaylistImporter('custom-yt-dlp', 51);

    await expect(importer.load('https://www.youtube.com/playlist?list=PL123'))
      .rejects.toThrow('no playable video entries');
  });

  it('surfaces yt-dlp failures without trying to parse partial output', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stderr.end('playlist unavailable');
      child.stdout.end('{');
      child.emit('close', 1);
    });
    const importer = new YoutubePlaylistImporter('custom-yt-dlp', 51);

    await expect(importer.load('https://www.youtube.com/playlist?list=PL123'))
      .rejects.toThrow('playlist unavailable');
  });

  it('kills playlist extraction after thirty seconds', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    const importer = new YoutubePlaylistImporter('custom-yt-dlp', 51);

    const result = importer.load('https://www.youtube.com/playlist?list=PL123');
    const rejection = expect(result).rejects.toThrow('too long to respond');
    await vi.advanceTimersByTimeAsync(30_000);

    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    await rejection;
  });
});
