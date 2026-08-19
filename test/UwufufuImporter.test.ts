import { describe, expect, it, vi } from 'vitest';
import { UwufufuImporter, isUwufufuGameUrl } from '../src/importers/UwufufuImporter.js';

const gameUrl =
  'https://www.uwufufu.com/worldcup/vpop-vit-nam-c-in-tn-trng-yeetuzmymeatuz';
const selectionsPage1 =
  'https://api.uwufufu.com/v1/selections?page=1&perPage=2&worldcupId=168808';
const selectionsPage2 =
  'https://api.uwufufu.com/v1/selections?page=2&perPage=2&worldcupId=168808';
const gameHtml = '<body><script>self.__next_f.push([1,"6:{\\"worldcup\\":{\\"id\\":168808,\\"title\\":\\"Songs\\"}}"])</script></body>';

function selection(id: number, videoId: string, ranking: number) {
  return {
    id,
    name: `Song ${ranking}`,
    isVideo: true,
    videoSource: 'youtube',
    videoUrl: `https://www.youtube.com/embed/${videoId}`,
    resourceUrl: `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    startTime: 0,
    endTime: 0,
    wins: 1,
    losses: 0,
    finalWins: 1,
    finalLosses: 0,
    winLossRatio: 1,
    gameId: 168808,
    ranking,
  };
}

describe('isUwufufuGameUrl', () => {
  it.each([
    gameUrl,
    `${gameUrl}/`,
    `${gameUrl}?utm_source=discord#round`,
  ])('accepts public game URL %s', (input) => {
    expect(isUwufufuGameUrl(input)).toBe(true);
  });

  it.each([
    'http://www.uwufufu.com/worldcup/songs',
    'https://uwufufu.com/worldcup/songs',
    'https://www.uwufufu.com.evil.example/worldcup/songs',
    'https://user:pass@www.uwufufu.com/worldcup/songs',
    'https://www.uwufufu.com:444/worldcup/songs',
    'https://www.uwufufu.com/worldcup/',
    'https://www.uwufufu.com/worldcup/songs/round',
    'https://api.uwufufu.com/v1/selections?page=1&worldcupId=168808',
    'not a url',
  ])('rejects unsupported input %s', (input) => {
    expect(isUwufufuGameUrl(input)).toBe(false);
  });
});

describe('UwufufuImporter', () => {
  it('fetches every page and shuffles all playable entries before returning them', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        perPage: 2,
        page: 1,
        total: 4,
        data: [
          selection(12751118, 'FN7ALfpGxiI', 1),
          { videoUrl: 'https://example.com/embed/not-youtube' },
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        perPage: 2,
        page: 2,
        total: 4,
        data: [
          selection(12751085, '30KI5SuECuc', 2),
          selection(12751086, 'abcdefghijk', 3),
        ],
      }), { status: 200 }));
    const importer = new UwufufuImporter(fetcher, () => 0, 2);

    await expect(importer.load(gameUrl)).resolves.toEqual({
      skipped: 1,
      urls: [
        'https://www.youtube.com/watch?v=30KI5SuECuc',
        'https://www.youtube.com/watch?v=abcdefghijk',
        'https://www.youtube.com/watch?v=FN7ALfpGxiI',
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]?.[0]).toBe(gameUrl);
    expect(fetcher.mock.calls[1]?.[0]).toBe(selectionsPage1);
    expect(fetcher.mock.calls[2]?.[0]).toBe(selectionsPage2);
    for (const call of fetcher.mock.calls) {
      expect(call[1]).toEqual(expect.objectContaining({
        redirect: 'error',
        signal: expect.any(AbortSignal),
      }));
    }
    const signals = fetcher.mock.calls.map((call) => call[1]?.signal);
    expect(new Set(signals)).toHaveLength(3);
  });

  it('rejects a direct API URL without fetching it', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(new UwufufuImporter(fetcher).load(
      'https://api.uwufufu.com/v1/selections?page=1&worldcupId=168808',
    )).rejects.toThrow('not a supported UwUFUFU game URL');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a failed public game page response', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503 }));

    await expect(new UwufufuImporter(fetcher).load(gameUrl))
      .rejects.toThrow('UwUFUFU page returned HTTP 503');
  });

  it.each([
    ['missing', '<html><body><script>self.__next_f.push([1,"no game"])</script></body></html>'],
    ['unsafe', '<script>\\"worldcup\\":{\\"id\\":9007199254740992}</script>'],
  ])('rejects a %s game ID in the public page', async (_name, html) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(html, { status: 200 }));

    await expect(new UwufufuImporter(fetcher).load(gameUrl))
      .rejects.toThrow('UwUFUFU page did not contain a valid game ID');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects a failed API response from a required page', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        page: 1,
        perPage: 2,
        total: 3,
        data: [
          selection(12751118, 'FN7ALfpGxiI', 1),
          selection(12751085, '30KI5SuECuc', 2),
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('', { status: 503 }));

    await expect(new UwufufuImporter(fetcher, () => 0, 2).load(gameUrl))
      .rejects.toThrow('UwUFUFU API returned HTTP 503');
  });

  it('rejects invalid API JSON', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response('{', { status: 200 }));

    await expect(new UwufufuImporter(fetcher).load(gameUrl))
      .rejects.toThrow('UwUFUFU API returned invalid JSON');
  });

  it.each([
    ['a missing data array', { total: 1, items: [] }],
    ['a missing total', { data: [selection(12751118, 'FN7ALfpGxiI', 1)] }],
    ['a negative total', { total: -1, data: [] }],
    ['a fractional total', { total: 1.5, data: [] }],
  ])('rejects an API response with %s', async (_name, payload) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(new UwufufuImporter(fetcher).load(gameUrl))
      .rejects.toThrow('UwUFUFU API returned an invalid selections response');
  });

  it('rejects pagination that ends before the advertised total', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        page: 1,
        perPage: 2,
        total: 3,
        data: [
          selection(12751118, 'FN7ALfpGxiI', 1),
          selection(12751085, '30KI5SuECuc', 2),
        ],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        page: 2,
        perPage: 2,
        total: 3,
        data: [],
      }), { status: 200 }));

    await expect(new UwufufuImporter(fetcher, () => 0, 2).load(gameUrl))
      .rejects.toThrow('UwUFUFU API returned incomplete selections');
  });

  it('rejects a game without playable YouTube entries', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(gameHtml, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        page: 1,
        perPage: 1000,
        total: 1,
        data: [{ videoUrl: 'https://example.com/not-playable' }],
      }), { status: 200 }));

    await expect(new UwufufuImporter(fetcher).load(gameUrl))
      .rejects.toThrow('UwUFUFU returned no playable YouTube entries');
  });
});
