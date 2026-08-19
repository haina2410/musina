import {
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
} from 'discord.js';
import type { Logger } from 'pino';
import { HELP_TEXT } from '../commands/definitions.js';
import { parseMentionCommand } from '../commands/mention.js';
import type { PlaybackManager } from '../playback/PlaybackManager.js';
import { PlayInput } from '../playback/PlayInput.js';
import { findSupportedUrl } from '../playback/urlPolicy.js';

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
    if (interaction.isChatInputCommand()) void handleCommand(interaction, playback, playInput, logger);
  });
  client.on('messageCreate', (message) => void handleMessage(message, playback, playInput, logger));
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
      const input = await playInput.resolve(interaction.options.getString('url', true));
      const result = input.kind === 'batch'
        ? await playback.enqueueMany(interaction.member, interaction.channel, input.urls, input.skipped)
        : await playback.enqueue(interaction.member, interaction.channel, input.url);
      await interaction.editReply(result);
      return;
    }
    if (interaction.commandName === 'help') {
      await interaction.reply({ content: HELP_TEXT, ephemeral: true });
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
  if (command && ['skip', 'stop', 'queue', 'nowplaying', 'shuffle'].includes(command.name)) {
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
      ? 'Provide one YouTube, YouTube playlist, SoundCloud, or UwUFUFU selections HTTPS link.'
      : 'Unknown command. Mention me with `help` to see available commands.';
    await message.reply({ content, allowedMentions: { repliedUser: false } });
    return;
  }
  try {
    await message.channel.sendTyping();
    const resolved = await playInput.resolve(input);
    const result = resolved.kind === 'batch'
      ? await playback.enqueueMany(message.member!, message.channel, resolved.urls, resolved.skipped)
      : await playback.enqueue(message.member!, message.channel, resolved.url);
    await message.reply({ content: result, allowedMentions: { repliedUser: false } });
  } catch (error) {
    logger.warn({ error }, 'message play request failed');
    await message.reply({
      content: error instanceof Error ? error.message : 'Something went wrong.',
      allowedMentions: { repliedUser: false },
    });
  }
}

function runPlaybackCommand(
  commandName: string,
  playback: PlaybackManager,
  member: GuildMember,
  guildId: string,
): string {
  switch (commandName) {
    case 'skip': return playback.skip(member);
    case 'stop': return playback.stop(member);
    case 'queue': return playback.queue(guildId);
    case 'nowplaying': return playback.nowPlaying(guildId);
    case 'shuffle': return playback.shuffle(member);
    default: throw new Error('Unsupported command.');
  }
}
