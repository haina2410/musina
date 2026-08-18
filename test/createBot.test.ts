import { Events } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createBot } from '../src/bot/createBot.js';

describe('createBot', () => {
  it('registers the current Discord client-ready event', () => {
    const client = createBot({} as never, { info: vi.fn() } as never);

    expect(client.eventNames()).toContain(Events.ClientReady);
    expect(client.eventNames()).not.toContain('ready');
  });
});
