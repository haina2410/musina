const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'music.youtube.com', 'youtu.be']);
const SOUNDCLOUD_HOSTS = new Set(['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com']);

export type SupportedSource = 'youtube' | 'soundcloud';

export function validateMediaUrl(input: string): { source: SupportedSource; url: string } {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Please provide a valid URL.');
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Only standard HTTPS links are supported.');
  }
  if (YOUTUBE_HOSTS.has(hostname)) {
    if (url.searchParams.has('list')) throw new Error('Playlists are not supported yet.');
    return { source: 'youtube', url: url.toString() };
  }
  if (SOUNDCLOUD_HOSTS.has(hostname)) return { source: 'soundcloud', url: url.toString() };
  throw new Error('Only YouTube and SoundCloud links are supported.');
}

export function findSupportedUrl(content: string): string | null {
  for (const token of content.split(/\s+/)) {
    try {
      return validateMediaUrl(token).url;
    } catch {
      // Non-URL words and unsupported links are expected while scanning a message.
    }
  }
  return null;
}
