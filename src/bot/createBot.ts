import {
  Client,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
} from 'discord.js';
import type { Logger } from 'pino';
import type { PlaybackManager } from '../playback/PlaybackManager.js';
import { findSupportedUrl } from '../playback/urlPolicy.js';

export function createBot(playback: PlaybackManager, logger: Logger): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [] },
  });

  client.on('ready', (readyClient) => logger.info({ user: readyClient.user.tag }, 'bot ready'));
  client.on('interactionCreate', (interaction) => {
    if (interaction.isChatInputCommand()) void handleCommand(interaction, playback, logger);
  });
  client.on('messageCreate', (message) => void handleMessage(message, playback, logger));
  return client;
}

async function handleCommand(
  interaction: ChatInputCommandInteraction,
  playback: PlaybackManager,
  logger: Logger,
): Promise<void> {
  if (!interaction.inCachedGuild() || !interaction.channel?.isSendable()) {
    await interaction.reply({ content: 'This command only works in a server text channel.', ephemeral: true });
    return;
  }
  try {
    if (interaction.commandName === 'play') {
      await interaction.deferReply();
      const result = await playback.enqueue(
        interaction.member,
        interaction.channel,
        interaction.options.getString('url', true),
      );
      await interaction.editReply(result);
      return;
    }
    const member = interaction.member as GuildMember;
    const result = interaction.commandName === 'skip' ? playback.skip(member)
      : interaction.commandName === 'stop' ? playback.stop(member)
      : interaction.commandName === 'queue' ? playback.queue(interaction.guildId)
      : playback.nowPlaying(interaction.guildId);
    await interaction.reply({ content: result });
  } catch (error) {
    logger.warn({ error, command: interaction.commandName }, 'command failed');
    const content = error instanceof Error ? error.message : 'Something went wrong.';
    if (interaction.deferred || interaction.replied) await interaction.editReply(content);
    else await interaction.reply({ content, ephemeral: true });
  }
}

async function handleMessage(message: Message, playback: PlaybackManager, logger: Logger): Promise<void> {
  if (!message.inGuild() || message.author.bot || !message.mentions.users.has(message.client.user.id)) return;
  if (!message.channel.isSendable()) return;
  const url = findSupportedUrl(message.content);
  if (!url) {
    await message.reply({ content: 'Mention me with one YouTube or SoundCloud HTTPS link.', allowedMentions: { repliedUser: false } });
    return;
  }
  try {
    await message.channel.sendTyping();
    const result = await playback.enqueue(message.member!, message.channel, url);
    await message.reply({ content: result, allowedMentions: { repliedUser: false } });
  } catch (error) {
    logger.warn({ error }, 'message play request failed');
    await message.reply({
      content: error instanceof Error ? error.message : 'Something went wrong.',
      allowedMentions: { repliedUser: false },
    });
  }
}
