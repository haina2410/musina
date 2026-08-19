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

  it('dispatches slash play text to best-match query playback', async () => {
    const client = new EventEmitter();
    const channel = { isSendable: () => true };
    const member = { id: 'member-1' };
    const editReply = vi.fn().mockResolvedValue(undefined);
    const getString = vi.fn().mockReturnValue('never gonna give you up');
    const interaction = {
      channel,
      commandName: 'play',
      deferReply: vi.fn().mockResolvedValue(undefined),
      deferred: true,
      editReply,
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      member,
      options: { getString },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    const playback = {
      enqueue: vi.fn(),
      enqueueQuery: vi.fn().mockResolvedValue('Now playing **Never Gonna Give You Up**.'),
    };
    const playInput = {
      resolve: vi.fn().mockResolvedValue({ kind: 'query', query: 'never gonna give you up' }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never, playInput as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(editReply).toHaveBeenCalledWith(
      'Now playing **Never Gonna Give You Up**.',
    ));
    expect(getString).toHaveBeenCalledWith('input', true);
    expect(playback.enqueueQuery).toHaveBeenCalledWith(
      member,
      channel,
      'never gonna give you up',
    );
    expect(playback.enqueue).not.toHaveBeenCalled();
  });

  it('edits one deferred slash reply through UwUFUFU progress and completion', async () => {
    const client = new EventEmitter();
    const channel = { isSendable: () => true };
    const member = { id: 'member-1' };
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel,
      commandName: 'play',
      deferReply: vi.fn().mockResolvedValue(undefined),
      deferred: true,
      editReply,
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      member,
      options: { getString: vi.fn().mockReturnValue('https://www.uwufufu.com/worldcup/songs') },
      reply: vi.fn().mockResolvedValue(undefined),
    };
    const enqueueMany = vi.fn(async (...args: unknown[]) => {
      const progress = args[4] as (snapshot: {
        added: number;
        processed: number;
        skipped: number;
        total: number;
      }) => Promise<void>;
      await progress({ added: 2, processed: 3, skipped: 1, total: 3 });
      return 'Imported 2 tracks (1 skipped). Now playing **One**.';
    });
    const playback = { enqueueMany };
    const playInput = {
      resolve: vi.fn().mockResolvedValue({
        kind: 'batch',
        skipped: 1,
        source: 'uwufufu',
        urls: ['one', 'two'],
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never, playInput as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(editReply).toHaveBeenLastCalledWith(
      'Imported 2 tracks (1 skipped). Now playing **One**.',
    ));
    expect(editReply.mock.calls.map(([content]) => content)).toEqual([
      'Found 3 UwUFUFU songs. Checking tracks…',
      'UwUFUFU import: checked 3/3 • queued 2 • skipped 1',
      'Imported 2 tracks (1 skipped). Now playing **One**.',
    ]);
    expect(enqueueMany).toHaveBeenCalledWith(member, channel, ['one', 'two'], 1, expect.any(Function));
  });

  it('shows a requester-bound menu for slash search', async () => {
    const client = new EventEmitter();
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel: { isSendable: () => true },
      commandName: 'search',
      deferReply: vi.fn().mockResolvedValue(undefined),
      deferred: true,
      editReply,
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      options: { getString: vi.fn().mockReturnValue('synthwave') },
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: 'user-1' },
    };
    const playback = {
      search: vi.fn().mockResolvedValue([{
        durationSeconds: 180,
        title: 'Synthwave',
        url: 'https://youtu.be/abcdefghijk',
      }]),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(editReply).toHaveBeenCalledWith(expect.objectContaining({
      components: expect.any(Array),
      content: 'Choose a YouTube result:',
    })));
    expect(playback.search).toHaveBeenCalledWith('synthwave');
  });

  it('shows the same search menu for a mention command', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const channel = { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) };
    const message = {
      author: { bot: false, id: 'user-1' },
      channel,
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> search synthwave',
      inGuild: () => true,
      member: { id: 'user-1' },
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = {
      search: vi.fn().mockResolvedValue([{
        durationSeconds: 180,
        title: 'Synthwave',
        url: 'https://youtu.be/abcdefghijk',
      }]),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      allowedMentions: { repliedUser: false },
      components: expect.any(Array),
      content: 'Choose a YouTube result:',
    })));
    expect(playback.search).toHaveBeenCalledWith('synthwave');
  });

  it('replies to slash queue with the live first page and controls', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel: { isSendable: () => true },
      commandName: 'queue',
      guildId: 'guild-1',
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      reply,
      user: { id: 'user-1' },
    };
    const playback = {
      queuePage: vi.fn(() => ({ content: 'Now: **One**\n1. Two', page: 0, totalPages: 2 })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      components: expect.any(Array),
      content: 'Now: **One**\n1. Two',
    })));
    expect(playback.queuePage).toHaveBeenCalledWith('guild-1', 0);
  });

  it('replies to mention queue with the live first page and requester-bound controls', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false, id: '1001' },
      channel: { isSendable: () => true },
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> queue',
      guildId: 'guild-1',
      inGuild: () => true,
      member: { id: 'member-1' },
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = {
      queuePage: vi.fn(() => ({ content: 'Now: **One**\n1. Two', page: 0, totalPages: 2 })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith(expect.objectContaining({
      allowedMentions: { repliedUser: false },
      components: expect.any(Array),
      content: 'Now: **One**\n1. Two',
    })));
    expect(playback.queuePage).toHaveBeenCalledWith('guild-1', 0);
    const [queueReply] = reply.mock.calls[0]!;
    expect(queueReply.components[0].toJSON().components[0].custom_id).toContain(message.author.id);
  });

  it('rejects an empty mention search before provider work', async () => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false, id: '1001' },
      channel: { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) },
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> search',
      inGuild: () => true,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = { search: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Provide search terms.',
    }));
    expect(playback.search).not.toHaveBeenCalled();
  });

  it('queues an authorized selected result and removes the menu', async () => {
    const client = new EventEmitter();
    const selectedUrl = 'https://youtu.be/abcdefghijk';
    const channel = { isSendable: () => true };
    const member = { id: '1001' };
    const interaction = {
      channel,
      customId: `musina-search:v1:1001:${Date.now().toString(36)}`,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      inCachedGuild: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      member,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
      values: [selectedUrl],
    };
    const playback = {
      enqueue: vi.fn().mockResolvedValue('Queued **Selected** at position 1.'),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledWith({
      components: [],
      content: 'Queued **Selected** at position 1.',
    }));
    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(playback.enqueue).toHaveBeenCalledWith(member, channel, selectedUrl);
  });

  it('rejects another user without invoking playback', async () => {
    const client = new EventEmitter();
    const interaction = {
      customId: `musina-search:v1:1001:${Date.now().toString(36)}`,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1002' },
    };
    const playback = { enqueue: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalledWith({
      content: 'Only the user who started this search can choose a result.',
      ephemeral: true,
    }));
    expect(playback.enqueue).not.toHaveBeenCalled();
  });

  it('rejects a menu at the five-minute expiry boundary', async () => {
    const client = new EventEmitter();
    const createdAt = Date.now() - 300_000;
    const interaction = {
      customId: `musina-search:v1:1001:${createdAt.toString(36)}`,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
    };
    const playback = { enqueue: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalledWith({
      content: 'This search has expired. Run `/search` again.',
      ephemeral: true,
    }));
    expect(playback.enqueue).not.toHaveBeenCalled();
  });

  it('rejects selection outside a cached server text channel', async () => {
    const client = new EventEmitter();
    const interaction = {
      channel: null,
      customId: `musina-search:v1:1001:${Date.now().toString(36)}`,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      inCachedGuild: () => false,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      member: { id: '1001' },
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
      values: ['https://youtu.be/abcdefghijk'],
    };
    const playback = { enqueue: vi.fn().mockResolvedValue('Now playing **Selected**.') };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(interaction.reply).toHaveBeenCalledWith({
      content: 'This menu only works in a server text channel.',
      ephemeral: true,
    }));
    expect(interaction.deferUpdate).not.toHaveBeenCalled();
    expect(playback.enqueue).not.toHaveBeenCalled();
  });

  it('keeps the menu retryable when selected playback fails', async () => {
    const client = new EventEmitter();
    const interaction = {
      channel: { isSendable: () => true },
      customId: `musina-search:v1:1001:${Date.now().toString(36)}`,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
      editReply: vi.fn().mockResolvedValue(undefined),
      followUp: vi.fn().mockResolvedValue(undefined),
      inCachedGuild: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => true,
      member: { id: '1001' },
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
      values: ['https://youtu.be/abcdefghijk'],
    };
    const playback = {
      enqueue: vi.fn().mockRejectedValue(new Error('Join a voice channel first.')),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(interaction.followUp).toHaveBeenCalledWith({
      content: 'Join a voice channel first.',
      ephemeral: true,
    }));
    expect(interaction.editReply).not.toHaveBeenCalled();
  });

  it('rejects queue navigation from a user other than the requester', async () => {
    const client = new EventEmitter();
    const unauthorized = {
      customId: 'musina-queue:v1:1001:4',
      isButton: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1002' },
    };
    const playback = { queuePage: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', unauthorized);

    await vi.waitFor(() => expect(unauthorized.reply).toHaveBeenCalledWith({
      content: 'Only the user who requested this queue can change pages.',
      ephemeral: true,
    }));
    expect(playback.queuePage).not.toHaveBeenCalled();
  });

  it('updates queue navigation from a fresh clamped page result', async () => {
    const client = new EventEmitter();
    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      channel: { isSendable: () => true },
      customId: 'musina-queue:v1:1001:4',
      deferUpdate,
      editReply,
      guildId: 'guild-1',
      inCachedGuild: () => true,
      isButton: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
    };
    const playback = {
      queuePage: vi.fn(() => ({ content: 'Now: **Live**', page: 0, totalPages: 1 })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(editReply).toHaveBeenCalledWith({
      components: [],
      content: 'Now: **Live**',
    }));
    expect(deferUpdate).toHaveBeenCalled();
    expect(playback.queuePage).toHaveBeenCalledWith('guild-1', 4);
  });

  it('contains an unacknowledged queue-button update failure when its reply also fails', async () => {
    const client = new EventEmitter();
    const updateError = new Error('Discord is unavailable.');
    const replyError = new Error('Reply is unavailable.');
    const reply = vi.fn().mockRejectedValue(replyError);
    const interaction = {
      channel: { isSendable: () => true },
      customId: 'musina-queue:v1:1001:4',
      deferUpdate: vi.fn().mockRejectedValue(updateError),
      deferred: false,
      guildId: 'guild-1',
      inCachedGuild: () => true,
      isButton: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      replied: false,
      reply,
      user: { id: '1001' },
    };
    const playback = { queuePage: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      content: 'Something went wrong.',
      ephemeral: true,
    }));
    await vi.waitFor(() => expect(logger.warn).toHaveBeenCalledWith(
      { command: 'queue-button-response', error: replyError },
      'failed to report queue button failure',
    ));
    expect(playback.queuePage).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { command: 'queue-button', error: updateError },
      'queue button update failed',
    );
  });

  it('reports an acknowledged queue-button edit failure with an ephemeral follow-up', async () => {
    const client = new EventEmitter();
    const editError = new Error('Original reply is unavailable.');
    const followUp = vi.fn().mockResolvedValue(undefined);
    let acknowledged = false;
    const interaction = {
      channel: { isSendable: () => true },
      customId: 'musina-queue:v1:1001:4',
      deferUpdate: vi.fn(async () => { acknowledged = true; }),
      get deferred() { return acknowledged; },
      editReply: vi.fn().mockRejectedValue(editError),
      followUp,
      guildId: 'guild-1',
      inCachedGuild: () => true,
      isButton: () => true,
      isChatInputCommand: () => false,
      isStringSelectMenu: () => false,
      replied: false,
      reply: vi.fn().mockResolvedValue(undefined),
      user: { id: '1001' },
    };
    const playback = {
      queuePage: vi.fn(() => ({ content: 'Now: **Live**', page: 0, totalPages: 1 })),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(followUp).toHaveBeenCalledWith({
      content: 'Something went wrong.',
      ephemeral: true,
    }));
    expect(logger.warn).toHaveBeenCalledWith(
      { command: 'queue-button', error: editError },
      'queue button update failed',
    );
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

  it('dispatches the skip-to slash command with its required position', async () => {
    const client = new EventEmitter();
    const member = { id: 'member-1' };
    const reply = vi.fn().mockResolvedValue(undefined);
    const getInteger = vi.fn().mockReturnValue(3);
    const interaction = {
      channel: { isSendable: () => true },
      commandName: 'skip-to',
      inCachedGuild: () => true,
      isChatInputCommand: () => true,
      member,
      options: { getInteger },
      reply,
    };
    const playback = { skipTo: vi.fn(() => 'Skipping to **Four**.') };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('interactionCreate', interaction);

    await vi.waitFor(() => expect(playback.skipTo).toHaveBeenCalledWith(member, 3));
    expect(getInteger).toHaveBeenCalledWith('position', true);
    expect(reply).toHaveBeenCalledWith({ content: 'Skipping to **Four**.' });
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

  it('dispatches a mention-prefixed skip-to command with its position', async () => {
    const client = new EventEmitter();
    const member = { id: 'member-1' };
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false },
      channel: { isSendable: () => true },
      client: { user: { id: 'bot-1' } },
      content: '<@bot-1> skip-to 3',
      guildId: 'guild-1',
      inGuild: () => true,
      member,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = { skipTo: vi.fn(() => 'Skipping to **Four**.') };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(playback.skipTo).toHaveBeenCalledWith(member, 3));
    expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Skipping to **Four**.',
    });
  });

  it.each([
    '<@bot-1> skip-to',
    '<@bot-1> skip-to 3.5',
    '<@bot-1> skip-to -3',
    '<@bot-1> skip-to 3tracks',
    '<@bot-1> skip-to 9007199254740992',
  ])('rejects malformed mention skip-to position %s', async (content) => {
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const message = {
      author: { bot: false },
      channel: { isSendable: () => true },
      client: { user: { id: 'bot-1' } },
      content,
      guildId: 'guild-1',
      inGuild: () => true,
      member: { id: 'member-1' },
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = { skipTo: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Provide a positive whole-number queue position.',
    }));
    expect(playback.skipTo).not.toHaveBeenCalled();
  });

  it.each([
    ['pause', 'Paused.'],
    ['resume', 'Resumed.'],
    ['skip', 'Skipped.'],
    ['stop', 'Stopped playback and left voice.'],
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
      pause: vi.fn(() => 'Paused.'),
      queue: vi.fn(() => 'Now: **One**'),
      resume: vi.fn(() => 'Resumed.'),
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
    if (command === 'pause') expect(playback.pause).toHaveBeenCalledWith(message.member);
    if (command === 'resume') expect(playback.resume).toHaveBeenCalledWith(message.member);
  });

  it('forwards voice state updates to playback', () => {
    const client = new EventEmitter();
    const playback = { handleVoiceStateUpdate: vi.fn() };
    const oldState = { channelId: 'voice-1' };
    const newState = { channelId: null };
    createBot(playback as never, { info: vi.fn() } as never, client as never);

    client.emit('voiceStateUpdate', oldState, newState);

    expect(playback.handleVoiceStateUpdate).toHaveBeenCalledWith(oldState, newState);
  });

  it('supports public UwUFUFU game playback through a mention-prefixed play command', async () => {
    const gameUrl = 'https://www.uwufufu.com/worldcup/song-game';
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(
        '<script>\\"worldcup\\":{\\"id\\":168808}</script>',
        { status: 200 },
      ))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        page: 1,
        perPage: 1000,
        total: 1,
        data: [{ videoUrl: 'https://www.youtube.com/embed/FN7ALfpGxiI' }],
      }), { status: 200 })));
    const client = new EventEmitter();
    const edit = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue({ edit });
    const channel = { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) };
    const member = { id: 'member-1' };
    const message = {
      author: { bot: false },
      channel,
      client: { user: { id: 'bot-1' } },
      content: `<@bot-1> play ${gameUrl}`,
      guildId: 'guild-1',
      inGuild: () => true,
      member,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const enqueueMany = vi.fn(async (...args: unknown[]) => {
      const progress = args[4] as (snapshot: {
        added: number;
        processed: number;
        skipped: number;
        total: number;
      }) => Promise<void>;
      await progress({ added: 1, processed: 1, skipped: 0, total: 1 });
      return 'Imported 1 track (0 skipped). Now playing **One**.';
    });
    const playback = { enqueueMany };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(edit).toHaveBeenLastCalledWith(
      'Imported 1 track (0 skipped). Now playing **One**.',
    ));
    expect(reply).toHaveBeenCalledOnce();
    expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Found 1 UwUFUFU songs. Checking tracks…',
    });
    expect(edit.mock.calls.map(([content]) => content)).toEqual([
      'UwUFUFU import: checked 1/1 • queued 1 • skipped 0',
      'Imported 1 track (0 skipped). Now playing **One**.',
    ]);
    expect(enqueueMany).toHaveBeenCalledWith(
      member,
      channel,
      ['https://www.youtube.com/watch?v=FN7ALfpGxiI'],
      0,
      expect.any(Function),
    );
  });

  it('supports YouTube playlist playback through a mention-prefixed play command', async () => {
    const playlistUrl = 'https://www.youtube.com/watch?v=oMGPJ4uE_W8&list=RDoMGPJ4uE_W8&start_radio=1';
    const client = new EventEmitter();
    const reply = vi.fn().mockResolvedValue(undefined);
    const channel = { isSendable: () => true, sendTyping: vi.fn().mockResolvedValue(undefined) };
    const member = { id: 'member-1' };
    const message = {
      author: { bot: false },
      channel,
      client: { user: { id: 'bot-1' } },
      content: `<@bot-1> play ${playlistUrl}`,
      guildId: 'guild-1',
      inGuild: () => true,
      member,
      mentions: { users: { has: (id: string) => id === 'bot-1' } },
      reply,
    };
    const playback = {
      enqueueMany: vi.fn().mockResolvedValue('Imported 2 tracks (0 skipped). Now playing **One**.'),
    };
    const playInput = {
      resolve: vi.fn().mockResolvedValue({
        kind: 'batch',
        skipped: 0,
        source: 'youtube-playlist',
        urls: [
          'https://www.youtube.com/watch?v=oMGPJ4uE_W8',
          'https://www.youtube.com/watch?v=abcdefghijk',
        ],
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    createBot(playback as never, logger as never, client as never, playInput as never);

    client.emit('messageCreate', message);

    await vi.waitFor(() => expect(reply).toHaveBeenCalledWith({
      allowedMentions: { repliedUser: false },
      content: 'Imported 2 tracks (0 skipped). Now playing **One**.',
    }));
    expect(playback.enqueueMany).toHaveBeenCalledWith(
      member,
      channel,
      [
        'https://www.youtube.com/watch?v=oMGPJ4uE_W8',
        'https://www.youtube.com/watch?v=abcdefghijk',
      ],
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
