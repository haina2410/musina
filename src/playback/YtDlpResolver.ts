import { spawn } from 'node:child_process';
import type { Logger } from 'pino';
import type { ResolvedAudio, Track } from './types.js';
import { validateMediaUrl } from './urlPolicy.js';

interface Metadata {
  duration?: number | null;
  original_url?: string;
  title?: string;
  webpage_url?: string;
}

export class YtDlpResolver {
  constructor(
    private readonly binary: string,
    private readonly maxTrackSeconds: number,
    private readonly logger: Logger,
  ) {}

  async inspect(urlInput: string, requestedBy: string): Promise<Track> {
    const { source, url } = validateMediaUrl(urlInput);
    const metadata = await this.runJson([
      '--dump-single-json', '--no-playlist', '--no-warnings', '--socket-timeout', '15', url,
    ]);
    const duration = typeof metadata.duration === 'number' ? metadata.duration : null;
    if (duration !== null && duration > this.maxTrackSeconds) {
      throw new Error(`That track exceeds the ${Math.floor(this.maxTrackSeconds / 60)} minute limit.`);
    }
    return {
      canonicalUrl: metadata.webpage_url || metadata.original_url || url,
      durationSeconds: duration,
      requestedBy,
      source,
      title: metadata.title?.trim() || 'Untitled track',
    };
  }

  createAudio(track: Track): ResolvedAudio {
    const child = spawn(this.binary, [
      '--no-playlist', '--no-warnings', '--format', 'bestaudio/best', '--output', '-', track.canonicalUrl,
    ], { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', (error) => child.stdout.destroy(error));
    child.on('exit', (code) => {
      if (code && !child.killed) child.stdout.destroy(new Error('Media stream ended unexpectedly.'));
      if (code && stderr) this.logger.warn({ code, stderr }, 'yt-dlp stream failed');
    });
    return { cleanup: () => child.kill('SIGKILL'), stream: child.stdout, track };
  }

  private runJson(args: string[]): Promise<Metadata> {
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
      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
        if (stdout.length > 5_000_000) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new Error(stderr.trim() || 'Unable to read that media.'));
        try { resolve(JSON.parse(stdout) as Metadata); }
        catch { reject(new Error('The media provider returned an invalid response.')); }
      });
    });
  }
}
