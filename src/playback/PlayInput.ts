import { UwufufuImporter, isUwufufuSelectionsUrl } from '../importers/UwufufuImporter.js';
import { YoutubePlaylistImporter } from '../importers/YoutubePlaylistImporter.js';
import { isYoutubePlaylistUrl } from './urlPolicy.js';

type ResolvedPlayInput =
  | { kind: 'batch'; skipped: number; urls: string[] }
  | { kind: 'single'; url: string };

export class PlayInput {
  constructor(
    private readonly uwufufu: UwufufuImporter = new UwufufuImporter(),
    private readonly youtubePlaylist: Pick<YoutubePlaylistImporter, 'load'> = new YoutubePlaylistImporter(),
  ) {}

  async resolve(input: string): Promise<ResolvedPlayInput> {
    if (isUwufufuSelectionsUrl(input)) {
      return { kind: 'batch', ...await this.uwufufu.load(input) };
    }
    if (isYoutubePlaylistUrl(input)) {
      return { kind: 'batch', ...await this.youtubePlaylist.load(input) };
    }
    return { kind: 'single', url: input };
  }
}
