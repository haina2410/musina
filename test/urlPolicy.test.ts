import { describe, expect, it } from 'vitest';
import { findSupportedUrl, validateMediaUrl } from '../src/playback/urlPolicy.js';

describe('validateMediaUrl', () => {
  it.each([
    ['https://youtu.be/abc', 'youtube'],
    ['https://www.youtube.com/watch?v=abc', 'youtube'],
    ['https://www.youtube.com/watch?v=abc&list=RDabc&start_radio=1', 'youtube'],
    ['https://www.youtube.com/playlist?list=PL123', 'youtube'],
    ['https://soundcloud.com/artist/song', 'soundcloud'],
    ['https://on.soundcloud.com/abc', 'soundcloud'],
  ] as const)('accepts %s', (url, source) => {
    expect(validateMediaUrl(url).source).toBe(source);
  });

  it.each([
    'http://youtube.com/watch?v=abc',
    'https://youtube.com.evil.example/watch?v=abc',
    'https://user:pass@youtube.com/watch?v=abc',
    'https://youtube.com:444/watch?v=abc',
    'not a url',
  ])('rejects unsafe or invalid input %s', (url) => {
    expect(() => validateMediaUrl(url)).toThrow();
  });

});

describe('findSupportedUrl', () => {
  it('finds a supported URL in a mention message', () => {
    expect(findSupportedUrl('<@123> play https://youtu.be/abc')).toBe('https://youtu.be/abc');
  });

  it('finds a standalone YouTube playlist URL in a mention message', () => {
    const url = 'https://www.youtube.com/playlist?list=PL123';

    expect(findSupportedUrl(`<@123> ${url}`)).toBe(url);
  });

  it('ignores unsupported links', () => {
    expect(findSupportedUrl('<@123> https://example.com/song')).toBeNull();
  });
});
