import {
  Client,
  Events,
  GatewayIntentBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type SendableChannels,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { Logger } from 'pino';
import { HELP_TEXT } from '../commands/definitions.js';
import { parseMentionCommand } from '../commands/mention.js';
import { buildQueueButtons, parseQueueButtonId } from '../commands/queueButtons.js';
import { buildSearchMenu, parseSearchMenuId } from '../commands/searchMenu.js';
import type { ImportProgressCallback, PlaybackManager } from '../playback/PlaybackManager.js';
import { PlayInput, type ResolvedPlayInput } from '../playback/PlayInput.js';
import { findSupportedUrl } from '../playback/urlPolicy.js';
import { createImportProgressReporter, uwufufuImportStart } from './importProgress.js';

export function createDiscordClient(): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [] },
  });
}

export function createBot(
  playback: PlaybackManager,
  logger: Logger,
  client = createDiscordClient(),
  playInput = new PlayInput(),
): Client {
  client.on(Events.ClientReady, (readyClient) => logger.info({ user: readyClient.user.tag }, 'bot ready'));
  client.on('interactionCreate', (interaction) => {
    if (interaction.isChatInputCommand()) {
      void handleCommand(interaction, playback, playInput, logger);
    } else if (interaction.isStringSelectMenu()) {
      void handleSearchSelection(interaction, playback, logger);
    } else if (interaction.isButton()) {
      void handleQueueButton(interaction, playback, logger);
    }
  });
  client.on('messageCreate', (message) => void handleMessage(message, playback, playInput, logger));
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    playback.handleVoiceStateUpdate(oldState, newState);
  });
  return client;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  playback: PlaybackManager,
  playInput: PlayInput,
  logger: Logger,
): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.channel?.isSendable()) {
    await interaction.reply({ content: 'This command only works in a server text channel.', ephemeral: true });
    return;
  }
  try {
    if (interaction.commandName === 'play') {
      await interaction.deferReply();
      const input = await playInput.resolve(interaction.options.getString('input', true));
      let onProgress: ImportProgressCallback | undefined;
      if (input.kind === 'batch' && input.source === 'uwufufu') {
        await interaction.editReply(uwufufuImportStart(input.urls.length + input.skipped));
        onProgress = createImportProgressReporter(
          (content) => interaction.editReply(content),
          logger,
        );
      }
      const result = await runPlayInput(
        input,
        playback,
        interaction.member,
        interaction.channel,
        onProgress,
      );
      await interaction.editReply(result);
      return;
    }
    if (interaction.commandName === 'search') {
      await interaction.deferReply();
      const query = interaction.options.getString('query', true);
      await interaction.editReply(await searchReply(playback, query, interaction.user.id));
      return;
    }
    if (interaction.commandName === 'help') {
      await interaction.reply({ content: HELP_TEXT, ephemeral: true });
      return;
    }
    if (interaction.commandName === 'queue') {
      await interaction.reply(queueReply(playback, interaction.guildId, interaction.user.id));
      return;
    }
    if (interaction.commandName === 'skip-to') {
      const position = interaction.options.getInteger('position', true);
      const result = playback.skipTo(interaction.member as GuildMember, position);
      await interaction.reply({ content: result });
      return;
    }
    const member = interaction.member as GuildMember;
    const result = runPlaybackCommand(interaction.commandName, playback, member, interaction.guildId);
    await interaction.reply({ content: result });
  } catch (error) {
    logger.warn({ error, command: interaction.commandName }, 'command failed');
    const content = error instanceof Error ? error.message : 'Something went wrong.';
    if (interaction.deferred || interaction.replied) await interaction.editReply(content);
    else await interaction.reply({ content, ephemeral: true });
  }
}

async function handleMessage(
  message: Message,
  playback: PlaybackManager,
  playInput: PlayInput,
  logger: Logger,
): Promise<void> {
  if (!message.inGuild() || message.author.bot || !message.mentions.users.has(message.client.user.id)) return;
  if (!message.channel.isSendable()) return;
  const command = parseMentionCommand(message.content, message.client.user.id);
  if (command?.name === 'help') {
    await message.reply({ content: HELP_TEXT, allowedMentions: { repliedUser: false } });
    return;
  }
  if (command?.name === 'search') {
    if (!command.argument) {
      await message.reply({
        content: 'Provide search terms.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    try {
      await message.channel.sendTyping();
      await message.reply({
        ...await searchReply(playback, command.argument, message.author.id),
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      logger.warn({ error, command: 'search' }, 'message command failed');
      await message.reply({
        content: error instanceof Error ? error.message : 'Something went wrong.',
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }
  if (command?.name === 'queue') {
    try {
      await message.reply({
        ...queueReply(playback, message.guildId, message.author.id),
        allowedMentions: { repliedUser: false },
      });
    } catch (error) {
      logger.warn({ error, command: 'queue' }, 'message command failed');
      await message.reply({
        content: error instanceof Error ? error.message : 'Something went wrong.',
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }
  if (command?.name === 'skip-to') {
    const position = parseSkipToPosition(command.argument);
    if (position === null) {
      await message.reply({
        content: 'Provide a positive whole-number queue position.',
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    try {
      const result = playback.skipTo(message.member!, position);
      await message.reply({ content: result, allowedMentions: { repliedUser: false } });
    } catch (error) {
      logger.warn({ error, command: 'skip-to' }, 'message command failed');
      await message.reply({
        content: error instanceof Error ? error.message : 'Something went wrong.',
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }
  if (command && ['pause', 'resume', 'skip', 'stop', 'nowplaying', 'shuffle'].includes(command.name)) {
    try {
      const result = runPlaybackCommand(command.name, playback, message.member!, message.guildId);
      await message.reply({ content: result, allowedMentions: { repliedUser: false } });
    } catch (error) {
      logger.warn({ error, command: command.name }, 'message command failed');
      await message.reply({
        content: error instanceof Error ? error.message : 'Something went wrong.',
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }
  const input = command?.name === 'play' ? command.argument : findSupportedUrl(message.content);
  if (!input) {
    const content = command?.name === 'play'
      ? 'Provide a URL or search terms.'
      : 'Unknown command. Mention me with `help` to see available commands.';
    await message.reply({ content, allowedMentions: { repliedUser: false } });
    return;
  }
  let progressMessage: { edit(content: string): Promise<unknown> } | null = null;
  try {
    await message.channel.sendTyping();
    const resolved = await playInput.resolve(input);
    let onProgress: ImportProgressCallback | undefined;
    if (resolved.kind === 'batch' && resolved.source === 'uwufufu') {
      progressMessage = await message.reply({
        content: uwufufuImportStart(resolved.urls.length + resolved.skipped),
        allowedMentions: { repliedUser: false },
      });
      onProgress = createImportProgressReporter(
        (content) => progressMessage!.edit(content),
        logger,
      );
    }
    const result = await runPlayInput(
      resolved,
      playback,
      message.member!,
      message.channel,
      onProgress,
    );
    if (progressMessage) await progressMessage.edit(result);
    else await message.reply({ content: result, allowedMentions: { repliedUser: false } });
  } catch (error) {
    logger.warn({ error }, 'message play request failed');
    const content = error instanceof Error ? error.message : 'Something went wrong.';
    if (progressMessage) await progressMessage.edit(content);
    else {
      await message.reply({
        content,
        allowedMentions: { repliedUser: false },
      });
    }
  }
}

function parseSkipToPosition(argument: string): number | null {
  if (!/^[1-9]\d*$/.test(argument)) return null;
  const position = Number(argument);
  return Number.isSafeInteger(position) ? position : null;
}

async function handleSearchSelection(
  interaction: StringSelectMenuInteraction,
  playback: PlaybackManager,
  logger: Logger,
): Promise<void> {
  const menu = parseSearchMenuId(interaction.customId);
  if (!menu) return;
  if (interaction.user.id !== menu.requesterId) {
    await interaction.reply({
      content: 'Only the user who started this search can choose a result.',
      ephemeral: true,
    });
    return;
  }
  if (menu.expired) {
    await interaction.reply({
      content: 'This search has expired. Run `/search` again.',
      ephemeral: true,
    });
    return;
  }
  if (!interaction.inCachedGuild() || !interaction.channel?.isSendable()) {
    await interaction.reply({
      content: 'This menu only works in a server text channel.',
      ephemeral: true,
    });
    return;
  }
  await interaction.deferUpdate();
  try {
    const result = await playback.enqueue(
      interaction.member,
      interaction.channel,
      interaction.values[0]!,
    );
    await interaction.editReply({ content: result, components: [] });
  } catch (error) {
    logger.warn({ error, command: 'search-selection' }, 'command failed');
    await interaction.followUp({
      content: error instanceof Error ? error.message : 'Something went wrong.',
      ephemeral: true,
    });
  }
}

async function handleQueueButton(
  interaction: ButtonInteraction,
  playback: PlaybackManager,
  logger: Logger,
): Promise<void> {
  const button = parseQueueButtonId(interaction.customId);
  if (!button) return;
  try {
    if (interaction.user.id !== button.requesterId) {
      await interaction.reply({
        content: 'Only the user who requested this queue can change pages.',
        ephemeral: true,
      });
      return;
    }
    if (!interaction.inCachedGuild() || !interaction.channel?.isSendable()) {
      await interaction.reply({
        content: 'This queue only works in a server text channel.',
        ephemeral: true,
      });
      return;
    }
    await interaction.deferUpdate();
    await interaction.editReply(queueReply(playback, interaction.guildId, interaction.user.id, button.page));
  } catch (error) {
    logger.warn({ error, command: 'queue-button' }, 'queue button update failed');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: 'Something went wrong.', ephemeral: true });
      } else {
        await interaction.reply({ content: 'Something went wrong.', ephemeral: true });
      }
    } catch (responseError) {
      logger.warn(
        { error: responseError, command: 'queue-button-response' },
        'failed to report queue button failure',
      );
    }
  }
}

async function runPlayInput(
  input: ResolvedPlayInput,
  playback: PlaybackManager,
  member: GuildMember,
  channel: SendableChannels,
  onProgress?: ImportProgressCallback,
): Promise<string> {
  if (input.kind === 'batch') {
    if (onProgress) {
      return playback.enqueueMany(member, channel, input.urls, input.skipped, onProgress);
    }
    return playback.enqueueMany(member, channel, input.urls, input.skipped);
  }
  if (input.kind === 'query') return playback.enqueueQuery(member, channel, input.query);
  return playback.enqueue(member, channel, input.url);
}

async function searchReply(playback: PlaybackManager, query: string, requesterId: string) {
  const candidates = await playback.search(query);
  return {
    content: 'Choose a YouTube result:',
    components: buildSearchMenu(candidates, requesterId),
  };
}

function queueReply(
  playback: PlaybackManager,
  guildId: string,
  requesterId: string,
  requestedPage = 0,
) {
  const result = playback.queuePage(guildId, requestedPage);
  return {
    content: result.content,
    components: buildQueueButtons(requesterId, result.page, result.totalPages),
  };
}

function runPlaybackCommand(
  commandName: string,
  playback: PlaybackManager,
  member: GuildMember,
  guildId: string,
): string {
  switch (commandName) {
    case 'pause': return playback.pause(member);
    case 'resume': return playback.resume(member);
    case 'skip': return playback.skip(member);
    case 'stop': return playback.stop(member);
    case 'nowplaying': return playback.nowPlaying(guildId);
    case 'shuffle': return playback.shuffle(member);
    default: throw new Error('Unsupported command.');
  }
}
