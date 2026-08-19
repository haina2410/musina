import { describe, expect, it, vi } from 'vitest';
import { UwufufuImporter } from '../src/importers/UwufufuImporter.js';
import { PlayInput } from '../src/playback/PlayInput.js';

describe('PlayInput', () => {
  it('leaves an ordinary media URL as one track without fetching UwUFUFU', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('must not fetch'));
    const youtubePlaylist = { load: vi.fn().mockRejectedValue(new Error('must not load playlist')) };
    const input = new PlayInput(new UwufufuImporter(fetcher), youtubePlaylist);

    await expect(input.resolve('https://youtu.be/abc')).resolves.toEqual({
      kind: 'single',
      url: 'https://youtu.be/abc',
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(youtubePlaylist.load).not.toHaveBeenCalled();
  });

  it('classifies trimmed free text as a YouTube query', async () => {
    const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });

    await expect(input.resolve('  never gonna give you up  ')).resolves.toEqual({
      kind: 'query',
      query: 'never gonna give you up',
    });
  });

  it.each(['', '   '])('rejects blank input %j', async (value) => {
    const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });

    await expect(input.resolve(value)).rejects.toThrow('Provide a URL or search terms.');
  });

  it.each(['https://example.com/song', 'ftp://youtube.com/song', 'spotify:track:123'])(
    'does not reinterpret URI-shaped input %s as search text',
    async (value) => {
      const input = new PlayInput(new UwufufuImporter(), { load: vi.fn() });

      await expect(input.resolve(value)).rejects.toThrow();
    },
  );

  it.each([
    'https://www.youtube.com/watch?v=oMGPJ4uE_W8&list=RDoMGPJ4uE_W8&start_radio=1',
    'https://www.youtube.com/playlist?list=PL123',
  ])('loads %s as an ordered YouTube batch', async (url) => {
    const youtubePlaylist = {
      load: vi.fn().mockResolvedValue({
        skipped: 1,
        urls: [
          'https://www.youtube.com/watch?v=oMGPJ4uE_W8',
          'https://www.youtube.com/watch?v=abcdefghijk',
        ],
      }),
    };
    const input = new PlayInput(new UwufufuImporter(), youtubePlaylist);

    await expect(input.resolve(url)).resolves.toEqual({
      kind: 'batch',
      skipped: 1,
      urls: [
        'https://www.youtube.com/watch?v=oMGPJ4uE_W8',
        'https://www.youtube.com/watch?v=abcdefghijk',
      ],
    });
  });

  it('loads an UwUFUFU selections URL as an ordered batch', async () => {
    const url = 'https://api.uwufufu.com/v1/selections?page=1&perPage=2&worldcupId=168808';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      perPage: 2,
      page: 1,
      total: 2,
      data: [
        { videoUrl: 'https://www.youtube.com/embed/FN7ALfpGxiI' },
        { videoUrl: 'https://www.youtube.com/embed/30KI5SuECuc' },
      ],
    }), { status: 200 }));
    const input = new PlayInput(new UwufufuImporter(fetcher));

    await expect(input.resolve(url)).resolves.toEqual({
      kind: 'batch',
      skipped: 0,
      urls: [
        'https://www.youtube.com/watch?v=FN7ALfpGxiI',
        'https://www.youtube.com/watch?v=30KI5SuECuc',
      ],
    });
  });
});
