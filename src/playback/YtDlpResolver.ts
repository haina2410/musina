import { spawn } from 'node:child_process';
import type { Logger } from 'pino';
import type { ResolvedAudio, SearchCandidate, Track } from './types.js';
import { validateMediaUrl } from './urlPolicy.js';

interface Metadata {
  duration?: number | null;
  original_url?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
}

interface SearchMetadata {
  entries?: unknown;
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
      '--js-runtimes', 'node',
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

  async search(queryInput: string, limit: number): Promise<SearchCandidate[]> {
    const query = queryInput.trim();
    if (!query || query.length > 200) {
      throw new Error('Search terms must be 1 to 200 characters.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 5) {
      throw new Error('Search result limit must be between 1 and 5.');
    }
    const result = await this.runJson<SearchMetadata>([
      '--js-runtimes', 'node',
      '--dump-single-json', '--flat-playlist', '--no-warnings', '--socket-timeout', '15',
      `ytsearch${limit}:${query}`,
    ]);
    const entries = Array.isArray(result.entries) ? result.entries : [];
    const candidates = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const metadata = entry as Metadata;
      const rawUrl = metadata.webpage_url || metadata.url;
      if (typeof rawUrl !== 'string') return [];
      try {
        const media = validateMediaUrl(rawUrl);
        if (media.source !== 'youtube' || media.url.length > 100) return [];
        const duration = typeof metadata.duration === 'number'
          && Number.isFinite(metadata.duration)
          && metadata.duration >= 0
          ? metadata.duration
          : null;
        return [{
          durationSeconds: duration,
          title: metadata.title?.trim() || 'Untitled track',
          url: media.url,
        }];
      } catch {
        return [];
      }
    }).slice(0, limit);
    if (candidates.length === 0) throw new Error('No YouTube results found.');
    return candidates;
  }

  createAudio(track: Track): ResolvedAudio {
    const child = spawn(this.binary, [
      '--js-runtimes', 'node',
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

  private runJson<T = Metadata>(args: string[]): Promise<T> {
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
        try { resolve(JSON.parse(stdout) as T); }
        catch { reject(new Error('The media provider returned an invalid response.')); }
      });
    });
  }
}
