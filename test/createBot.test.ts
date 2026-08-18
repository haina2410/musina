import { Events } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { createBot, createDiscordClient } from '../src/bot/createBot.js';

describe('createBot', () => {
  it('registers the current Discord client-ready event', () => {
    const client = createBot({} as never, { info: vi.fn() } as never);

    expect(client.eventNames()).toContain(Events.ClientReady);
    expect(client.eventNames()).not.toContain('ready');
  });

  it('attaches bot handlers to a provided Discord client', () => {
    const client = createDiscordClient();

    const result = createBot({} as never, { info: vi.fn() } as never, client);

    expect(result).toBe(client);
    expect(result.eventNames()).toContain(Events.ClientReady);
  });
});
