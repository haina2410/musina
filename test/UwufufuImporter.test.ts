import { describe, expect, it, vi } from 'vitest';
import { UwufufuImporter, isUwufufuSelectionsUrl } from '../src/importers/UwufufuImporter.js';

const selectionsUrl =
  'https://api.uwufufu.com/v1/selections?page=1&perPage=10&worldcupId=168808';

describe('isUwufufuSelectionsUrl', () => {
  it('accepts the selections API endpoint with pagination parameters', () => {
    expect(isUwufufuSelectionsUrl(selectionsUrl)).toBe(true);
  });

  it.each([
    'http://api.uwufufu.com/v1/selections?page=1',
    'https://api.uwufufu.com.evil.example/v1/selections?page=1',
    'https://user:pass@api.uwufufu.com/v1/selections?page=1',
    'https://api.uwufufu.com:444/v1/selections?page=1',
    'https://api.uwufufu.com/v1/worldcups/168808',
    'not a url',
  ])('rejects unsupported input %s', (input) => {
    expect(isUwufufuSelectionsUrl(input)).toBe(false);
  });
});

describe('UwufufuImporter', () => {
  it('returns valid YouTube embed entries in response order', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      perPage: 4,
      page: 1,
      total: 256,
      data: [
        {
          id: 12751118,
          name: 'One',
          isVideo: true,
          videoSource: 'youtube',
          videoUrl: 'https://www.youtube.com/embed/FN7ALfpGxiI',
          resourceUrl: 'https://img.youtube.com/vi/FN7ALfpGxiI/sddefault.jpg',
          startTime: 0,
          endTime: 0,
          wins: 1,
          losses: 0,
          finalWins: 1,
          finalLosses: 0,
          winLossRatio: 1,
          gameId: 168808,
          ranking: 1,
        },
        { videoUrl: 'https://example.com/embed/not-youtube' },
        { name: 'missing video' },
        {
          id: 12751085,
          name: 'Two',
          isVideo: true,
          videoSource: 'youtube',
          videoUrl: 'https://www.youtube.com/embed/30KI5SuECuc',
          resourceUrl: 'https://img.youtube.com/vi/30KI5SuECuc/sddefault.jpg',
          startTime: 0,
          endTime: 0,
          wins: 1,
          losses: 0,
          finalWins: 1,
          finalLosses: 0,
          winLossRatio: 1,
          gameId: 168808,
          ranking: 2,
        },
      ],
    }), { status: 200 }));
    const importer = new UwufufuImporter(fetcher);

    await expect(importer.load(selectionsUrl)).resolves.toEqual({
      skipped: 2,
      urls: [
        'https://www.youtube.com/watch?v=FN7ALfpGxiI',
        'https://www.youtube.com/watch?v=30KI5SuECuc',
      ],
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe(selectionsUrl);
    expect(fetcher.mock.calls[0]?.[1]).toEqual(expect.objectContaining({
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects a non-success response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));

    await expect(new UwufufuImporter(fetcher).load(selectionsUrl))
      .rejects.toThrow('UwUFUFU returned HTTP 503');
  });

  it('rejects an unsupported URL without fetching it', async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(new UwufufuImporter(fetcher).load('https://example.com/v1/selections'))
      .rejects.toThrow('not a supported UwUFUFU selections URL');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects an object without a data array', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );

    await expect(new UwufufuImporter(fetcher).load(selectionsUrl))
      .rejects.toThrow('invalid selections response');
  });

  it('rejects invalid JSON', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{', { status: 200 }),
    );

    await expect(new UwufufuImporter(fetcher).load(selectionsUrl))
      .rejects.toThrow('invalid JSON');
  });

  it('rejects a page without usable YouTube entries', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ videoUrl: 'https://example.com/not-playable' }],
    }), { status: 200 }));

    await expect(new UwufufuImporter(fetcher).load(selectionsUrl))
      .rejects.toThrow('no playable YouTube entries');
  });
});
