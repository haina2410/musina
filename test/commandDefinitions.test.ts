import { describe, expect, it } from 'vitest';
import { HELP_TEXT, commandDefinitions } from '../src/commands/definitions.js';

describe('commandDefinitions', () => {
  it('registers search and names the broad play option input', () => {
    expect(commandDefinitions.map((command) => command.name)).toEqual([
      'play',
      'search',
      'pause',
      'resume',
      'skip',
      'skip-to',
      'stop',
      'queue',
      'nowplaying',
      'shuffle',
      'help',
    ]);
    const play = commandDefinitions.find((command) => command.name === 'play')!;
    expect(play.description).toContain('UwUFUFU game');
    expect(play.options?.[0]).toMatchObject({ name: 'input', required: true });
    expect(play.options?.[0]?.description).toContain('UwUFUFU game');
  });

  it('describes query playback and interactive search in shared help', () => {
    expect(HELP_TEXT).toContain('/play <input>');
    expect(HELP_TEXT).toContain('UwUFUFU game');
    expect(HELP_TEXT).toContain('/search <query>');
  });

  it('defines skip-to with a required positive integer position', () => {
    const command = commandDefinitions.find((value) => value.name === 'skip-to');

    expect(command?.options).toEqual([expect.objectContaining({
      name: 'position',
      required: true,
      type: 4,
      min_value: 1,
    })]);
    expect(HELP_TEXT).toContain('`/skip-to <position>`');
  });
});
