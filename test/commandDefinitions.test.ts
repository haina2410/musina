import { describe, expect, it } from 'vitest';
import { commandDefinitions } from '../src/commands/definitions.js';

describe('commandDefinitions', () => {
  it('registers shuffle and help with the playback commands', () => {
    expect(commandDefinitions.map((command) => command.name)).toEqual([
      'play',
      'pause',
      'resume',
      'skip',
      'stop',
      'queue',
      'nowplaying',
      'shuffle',
      'help',
    ]);
  });
});
