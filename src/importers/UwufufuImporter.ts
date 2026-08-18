type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

interface SelectionPayload {
  data?: unknown;
}

export interface ImportedSelectionPage {
  skipped: number;
  urls: string[];
}

export function isUwufufuSelectionsUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:'
      && url.hostname === 'api.uwufufu.com'
      && url.pathname === '/v1/selections'
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}

function youtubeWatchUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const match = /^\/embed\/([A-Za-z0-9_-]{11})$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || !match?.[1]) return null;
    return `https://www.youtube.com/watch?v=${match[1]}`;
  } catch {
    return null;
  }
}

export class UwufufuImporter {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async load(input: string): Promise<ImportedSelectionPage> {
    if (!isUwufufuSelectionsUrl(input)) {
      throw new Error('That is not a supported UwUFUFU selections URL.');
    }
    const response = await this.fetcher(input, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`UwUFUFU returned HTTP ${response.status}.`);

    let payload: SelectionPayload;
    try {
      payload = await response.json() as SelectionPayload;
    } catch {
      throw new Error('UwUFUFU returned invalid JSON.');
    }
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) {
      throw new Error('UwUFUFU returned an invalid selections response.');
    }

    const urls = payload.data.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('videoUrl' in entry)) return [];
      const url = youtubeWatchUrl(entry.videoUrl);
      return url ? [url] : [];
    });
    if (urls.length === 0) throw new Error('UwUFUFU returned no playable YouTube entries.');
    return { skipped: payload.data.length - urls.length, urls };
  }
}
