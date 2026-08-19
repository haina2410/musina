type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

interface SelectionPayload {
  data?: unknown;
  total?: unknown;
}

export interface ImportedSelectionPage {
  skipped: number;
  urls: string[];
}

export function isUwufufuGameUrl(input: string): boolean {
  try {
    const url = new URL(input);
    return url.protocol === 'https:'
      && url.hostname === 'www.uwufufu.com'
      && /^\/worldcup\/[^/]+\/?$/.test(url.pathname)
      && !url.username
      && !url.password
      && !url.port;
  } catch {
    return false;
  }
}

function gameIdFromHtml(html: string): number | null {
  const match = /\\"worldcup\\"\s*:\s*\{\s*\\"id\\"\s*:\s*(\d+)/.exec(html);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
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

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
}

export class UwufufuImporter {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly random: () => number = Math.random,
    private readonly pageSize = 1000,
  ) {}

  async load(input: string): Promise<ImportedSelectionPage> {
    if (!isUwufufuGameUrl(input)) {
      throw new Error('That is not a supported UwUFUFU game URL.');
    }

    const pageResponse = await this.fetcher(input, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!pageResponse.ok) {
      throw new Error(`UwUFUFU page returned HTTP ${pageResponse.status}.`);
    }
    const gameId = gameIdFromHtml(await pageResponse.text());
    if (gameId === null) {
      throw new Error('UwUFUFU page did not contain a valid game ID.');
    }

    const firstPage = await this.fetchSelectionsPage(gameId, 1);
    const total = firstPage.total;
    const entries = [...firstPage.data];
    const pageCount = Math.ceil(total / this.pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      const payload = await this.fetchSelectionsPage(gameId, page);
      entries.push(...payload.data);
    }
    if (entries.length < total) {
      throw new Error('UwUFUFU API returned incomplete selections.');
    }

    const urls = entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || !('videoUrl' in entry)) return [];
      const url = youtubeWatchUrl(entry.videoUrl);
      return url ? [url] : [];
    });
    if (urls.length === 0) throw new Error('UwUFUFU returned no playable YouTube entries.');
    shuffle(urls, this.random);
    return { skipped: entries.length - urls.length, urls };
  }

  private async fetchSelectionsPage(gameId: number, page: number): Promise<{
    data: unknown[];
    total: number;
  }> {
    const selectionsUrl = new URL('https://api.uwufufu.com/v1/selections');
    selectionsUrl.searchParams.set('page', String(page));
    selectionsUrl.searchParams.set('perPage', String(this.pageSize));
    selectionsUrl.searchParams.set('worldcupId', String(gameId));
    const response = await this.fetcher(selectionsUrl.toString(), {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`UwUFUFU API returned HTTP ${response.status}.`);

    let payload: SelectionPayload;
    try {
      payload = await response.json() as SelectionPayload;
    } catch {
      throw new Error('UwUFUFU API returned invalid JSON.');
    }
    if (
      !payload
      || typeof payload !== 'object'
      || !Array.isArray(payload.data)
      || typeof payload.total !== 'number'
      || !Number.isSafeInteger(payload.total)
      || payload.total < 0
    ) {
      throw new Error('UwUFUFU API returned an invalid selections response.');
    }
    return { data: payload.data, total: payload.total };
  }
}
