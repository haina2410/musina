import { UwufufuImporter, isUwufufuSelectionsUrl } from '../importers/UwufufuImporter.js';

type ResolvedPlayInput =
  | { kind: 'batch'; skipped: number; urls: string[] }
  | { kind: 'single'; url: string };

export class PlayInput {
  constructor(private readonly uwufufu: UwufufuImporter = new UwufufuImporter()) {}

  async resolve(input: string): Promise<ResolvedPlayInput> {
    if (isUwufufuSelectionsUrl(input)) {
      return { kind: 'batch', ...await this.uwufufu.load(input) };
    }
    return { kind: 'single', url: input };
  }
}
