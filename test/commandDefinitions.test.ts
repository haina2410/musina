import { describe, expect, it } from 'vitest';
import { HELP_TEXT, commandDefinitions } from '../src/commands/definitions.js';

describe('commandDefinitions', () => {
  it('registers search and names the broad play option input', () => {
    expect(commandDefinitions.map((command) => command.name)).toEqual([
      'play',
      'search',
      'skip',
      'stop',
      'queue',
      'nowplaying',
      'shuffle',
      'help',
    ]);
    const play = commandDefinitions.find((command) => command.name === 'play')!;
    expect(play.options?.[0]).toMatchObject({ name: 'input', required: true });
  });

  it('describes query playback and interactive search in shared help', () => {
    expect(HELP_TEXT).toContain('/play <input>');
    expect(HELP_TEXT).toContain('/search <query>');
  });
});
