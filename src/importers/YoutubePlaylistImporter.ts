import { spawn } from 'node:child_process';
import { isYoutubePlaylistUrl } from '../playback/urlPolicy.js';

interface PlaylistMetadata {
  entries?: unknown;
}

export class YoutubePlaylistImporter {
  constructor(
    private readonly binary = 'yt-dlp',
    private readonly maxEntries = 51,
  ) {}

  async load(input: string): Promise<{ skipped: number; urls: string[] }> {
    if (!isYoutubePlaylistUrl(input)) {
      throw new Error('That is not a supported YouTube playlist URL.');
    }
    const metadata = await this.runJson([
      '--js-runtimes', 'node',
      '--dump-single-json', '--flat-playlist', '--yes-playlist', '--ignore-errors',
      '--no-warnings', '--socket-timeout', '15', '--playlist-end', String(this.maxEntries), input,
    ]);
    if (!Array.isArray(metadata.entries)) {
      throw new Error('YouTube returned an invalid playlist response.');
    }
    const urls = metadata.entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('id' in entry)) return [];
      const id = entry.id;
      return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id)
        ? [`https://www.youtube.com/watch?v=${id}`]
        : [];
    });
    if (urls.length === 0) throw new Error('YouTube returned no playable video entries.');
    return { skipped: metadata.entries.length - urls.length, urls };
  }

  private runJson(args: string[]): Promise<PlaylistMetadata> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('The media provider took too long to respond.'));
      }, 30_000);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(stderr.trim() || 'Unable to read that playlist.'));
        try { resolve(JSON.parse(stdout) as PlaylistMetadata); }
        catch { reject(new Error('The media provider returned an invalid response.')); }
      });
    });
  }
}
