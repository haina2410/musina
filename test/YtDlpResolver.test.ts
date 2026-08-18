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
