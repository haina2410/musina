import { describe, expect, it } from 'vitest';
import { parseMentionCommand } from '../src/commands/mention.js';

describe('parseMentionCommand', () => {
  it.each(['<@123>', '<@!123>'])('parses Discord mention form %s', (mention) => {
    expect(parseMentionCommand(`${mention} shuffle`, '123')).toEqual({
      argument: '',
      name: 'shuffle',
    });
  });

  it('normalizes the command name and preserves its argument', () => {
    expect(parseMentionCommand('<@123> PLAY https://youtu.be/AbCdEfGhI12', '123')).toEqual({
      argument: 'https://youtu.be/AbCdEfGhI12',
      name: 'play',
    });
  });

  it('does not parse a mention that is not the command prefix', () => {
    expect(parseMentionCommand('please <@123> shuffle', '123')).toBeNull();
  });

  it('does not parse a mention for another bot', () => {
    expect(parseMentionCommand('<@456> help', '123')).toBeNull();
  });
});
