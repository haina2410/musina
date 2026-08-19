import { UwufufuImporter, isUwufufuGameUrl } from '../importers/UwufufuImporter.js';
import { YoutubePlaylistImporter } from '../importers/YoutubePlaylistImporter.js';
import { isYoutubePlaylistUrl, validateMediaUrl } from './urlPolicy.js';

const URI_SCHEME = /^[a-z][a-z\d+.-]*:/i;

export type ResolvedPlayInput =
  | {
    kind: 'batch';
    skipped: number;
    source: 'uwufufu' | 'youtube-playlist';
    urls: string[];
  }
  | { kind: 'query'; query: string }
  | { kind: 'single'; url: string };

export class PlayInput {
  constructor(
    private readonly uwufufu: UwufufuImporter = new UwufufuImporter(),
    private readonly youtubePlaylist: Pick<YoutubePlaylistImporter, 'load'> = new YoutubePlaylistImporter(),
  ) {}

  async resolve(input: string): Promise<ResolvedPlayInput> {
    const value = input.trim();
    if (!value) throw new Error('Provide a URL or search terms.');
    if (isUwufufuGameUrl(value)) {
      return { kind: 'batch', source: 'uwufufu', ...await this.uwufufu.load(value) };
    }
    if (isYoutubePlaylistUrl(value)) {
      return { kind: 'batch', source: 'youtube-playlist', ...await this.youtubePlaylist.load(value) };
    }
    if (!URI_SCHEME.test(value)) return { kind: 'query', query: value };
    return { kind: 'single', url: validateMediaUrl(value).url };
  }
}
