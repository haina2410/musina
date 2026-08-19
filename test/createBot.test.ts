import { EventEmitter } from 'node:events';
import { Events } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBot, createDiscordClient } from '../src/bot/createBot.js';

afterEach(() => vi.unstubAllGlobals());

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

  it('replies to the help slash command with an ephemeral command guide', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel: { isSendable: () => true },
      commandName: 'help',
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      reply,
    };
    const playback = { nowPlaying: vi.fn(() => 'wrong command') };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      content: expect.stringContaining('/shuffle'),
      ephemeral: true,
    }));
  });

  it('dispatches the shuffle slash command to playback', async () => {
    const client = new EventEmitter();
    const member = { id: 'member-1' };
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel: { isSendable: () => true },
      commandName: 'shuffle',
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      member,
      reply,
    };
    const playback = {
      nowPlaying: vi.fn(() => 'wrong command'),
      shuffle: vi.fn(() => 'Shuffled 3 tracks.'),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({ content: 'Shuffled 3 tracks.' }));
    expect(playback.shuffle).toHaveBeenCalledWith(member);
  });

  it('replies to a mention-prefixed help command with the command guide', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false },
      channel: { isSendable: () => true },
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> help',
      inGuild: () => true,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot({} as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: expect.stringContaining('/shuffle'),
    }));
  });

  it.each([
    ['skip', 'Skipped.'],
    ['stop', 'Stopped playback and left voice.'],
    ['queue', 'Now: **One**'],
    ['nowplaying', 'Now playing **One**.'],
    ['shuffle', 'Shuffled 3 tracks.'],
  ])('dispatches a mention-prefixed %s command to playback', async (command, result) => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false },
      channel: { isSendable: () => true },
      client: { user: { id: 'bot-1' } },
      content: `<@bot-1> ${command}`,
      guildId: 'guild-1',
      inGuild: () => true,
      member: { id: 'member-1' },
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = {
      nowPlaying: vi.fn(() => 'Now playing **One**.'),
      queue: vi.fn(() => 'Now: **One**'),
      shuffle: vi.fn(() => 'Shuffled 3 tracks.'),
      skip: vi.fn(() => 'Skipped.'),
      stop: vi.fn(() => 'Stopped playback and left voice.'),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: result,
    }));
  });

  it('supports UwUFUFU batch playback through a mention-prefixed play command', async () => {
    const selectionsUrl = 'https://api.uwufufu.com/v1/selections?page=1&perPage=1';
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{ videoUrl: 'https://www.youtube.com/embed/FN7ALfpGxiI' }],
    }), { status: 200 })));
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const channel = { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) };
    const member = { id: 'member-1' };
    const message = {
      author: { bot: false },
      channel,
      client: { user: { id: 'bot-1' } },
      content: `<@bot-1> play ${selectionsUrl}`,
      guildId: 'guild-1',
      inGuild: () => true,
      member,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = {
      enqueueMany: vi.fn().mockResolvedValue('Imported 1 track (0 skipped). Now playing **One**.'),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Imported 1 track (0 skipped). Now playing **One**.',
    }));
    expect(playback.enqueueMany).toHaveBeenCalledWith(
      member,
      channel,
      ['https://www.youtube.com/watch?v=FN7ALfpGxiI'],
      0,
    );
  });

  it('preserves mention-with-link playback shorthand', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const channel = { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) };
    const member = { id: 'member-1' };
    const message = {
      author: { bot: false },
      channel,
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> https://youtu.be/FN7ALfpGxiI',
      guildId: 'guild-1',
      inGuild: () => true,
      member,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = { enqueue: vi.fn().mockResolvedValue('Now playing **One**.') };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Now playing **One**.',
    }));
    expect(playback.enqueue).toHaveBeenCalledWith(
      member,
      channel,
      'https://youtu.be/FN7ALfpGxiI',
    );
  });
});
