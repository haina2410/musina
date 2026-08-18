import { SlashCommandBuilder } from 'discord.js';

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play or queue a YouTube or SoundCloud link')
    .addStringOption((option) =>
      option.setName('url').setDescription('YouTube or SoundCloud URL').setRequired(true),
    ),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and leave voice'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the playback queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
].map((command) => command.toJSON());
