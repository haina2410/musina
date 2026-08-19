import { SlashCommandBuilder } from 'discord.js';

export const HELP_TEXT = [
  '**Musina commands**',
  '`/play <url>` — play or queue YouTube, YouTube playlists, SoundCloud, or UwUFUFU selections',
  '`/skip` — skip the current track',
  '`/stop` — stop playback and leave voice',
  '`/queue` — show the current and upcoming tracks',
  '`/nowplaying` — show the current track',
  '`/shuffle` — shuffle upcoming tracks',
  '`/help` — show this guide',
  '',
  'You can also use a leading bot mention, such as `@Musina help` or `@Musina play <url>`.',
  'Join my active voice channel to use skip, stop, or shuffle.',
].join('\n');

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play media, a YouTube playlist, or UwUFUFU selections')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('YouTube, YouTube playlist, SoundCloud, or UwUFUFU URL')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and leave voice'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the playback queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming tracks'),
  new SlashCommandBuilder().setName('help').setDescription('Show Musina commands'),
].map((command) => command.toJSON());
