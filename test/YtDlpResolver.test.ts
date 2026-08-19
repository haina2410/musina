import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const childProcess = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: childProcess.spawn }));

import { YtDlpResolver } from '../src/playback/YtDlpResolver.js';

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
    stderr: PassThrough;
    stdout: PassThrough;
  };
  child.killed = false;
  child.kill = vi.fn();
  child.stderr = new PassThrough();
  child.stdout = new PassThrough();
  return child;
}

describe('YtDlpResolver', () => {
  beforeEach(() => childProcess.spawn.mockReset());

  it('returns normalized flat YouTube search entries', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({
        entries: [
          { duration: 185, title: ' First ', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
          { duration: null, title: 'Second', webpage_url: 'https://youtu.be/lmnopqrst' },
          { title: 'Not media', url: 'https://example.com/nope' },
        ],
      }));
      child.emit('close', 0);
    });
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await expect(resolver.search('  synthwave mix  ', 5)).resolves.toEqual([
      { durationSeconds: 185, title: 'First', url: 'https://www.youtube.com/watch?v=abcdefghijk' },
      { durationSeconds: null, title: 'Second', url: 'https://youtu.be/lmnopqrst' },
    ]);
    expect(childProcess.spawn).toHaveBeenCalledWith('yt-dlp', [
      '--js-runtimes', 'node',
      '--dump-single-json', '--flat-playlist', '--no-warnings', '--socket-timeout', '15',
      'ytsearch5:synthwave mix',
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it.each(['', '   ', 'x'.repeat(201)])('rejects invalid search query length', async (query) => {
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await expect(resolver.search(query, 5)).rejects
      .toThrow('Search terms must be 1 to 200 characters.');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it.each([0, 6, 1.5])('rejects invalid result limit %s', async (limit) => {
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await expect(resolver.search('song', limit)).rejects
      .toThrow('Search result limit must be between 1 and 5.');
    expect(childProcess.spawn).not.toHaveBeenCalled();
  });

  it('rejects an empty usable result set', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ entries: [] }));
      child.emit('close', 0);
    });
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await expect(resolver.search('missing song', 5)).rejects.toThrow('No YouTube results found.');
  });

  it('discards a result URL that cannot fit a Discord option value', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ entries: [
        { title: 'Too long', url: `https://youtube.com/watch?v=${'x'.repeat(100)}` },
      ] }));
      child.emit('close', 0);
    });
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await expect(resolver.search('song', 5)).rejects.toThrow('No YouTube results found.');
  });

  it('enables the Node runtime when inspecting YouTube metadata', async () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({
        duration: 42,
        title: 'Track',
        webpage_url: 'https://www.youtube.com/watch?v=abc',
      }));
      child.emit('close', 0);
    });
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    await resolver.inspect('https://www.youtube.com/watch?v=abc', 'user-1');

    expect(childProcess.spawn).toHaveBeenCalledWith('yt-dlp', [
      '--js-runtimes', 'node',
      '--dump-single-json', '--no-playlist', '--no-warnings', '--socket-timeout', '15',
      'https://www.youtube.com/watch?v=abc',
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  });

  it('enables the Node runtime when streaming audio', () => {
    const child = fakeChild();
    childProcess.spawn.mockReturnValue(child);
    const resolver = new YtDlpResolver('yt-dlp', 300, { warn: vi.fn() } as never);

    resolver.createAudio({
      canonicalUrl: 'https://www.youtube.com/watch?v=abc',
      durationSeconds: 42,
      requestedBy: 'user-1',
      source: 'youtube',
      title: 'Track',
    });

    expect(childProcess.spawn).toHaveBeenCalledWith('yt-dlp', [
      '--js-runtimes', 'node',
      '--no-playlist', '--no-warnings', '--format', 'bestaudio/best', '--output', '-',
      'https://www.youtube.com/watch?v=abc',
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  });
});
