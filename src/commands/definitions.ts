import { SlashCommandBuilder } from 'discord.js';

export const HELP_TEXT = [
  '**Musina commands**',
  '`/play <input>` — play a URL, playlist, UwUFUFU selections, or the best YouTube search match',
  '`/search <query>` — choose from the top five YouTube search results',
  '`/pause` — pause playback',
  '`/resume` — resume playback',
  '`/skip` — skip the current track',
  '`/stop` — stop playback and leave voice',
  '`/queue` — show the current and upcoming tracks',
  '`/nowplaying` — show the current track',
  '`/shuffle` — shuffle upcoming tracks',
  '`/help` — show this guide',
  '',
  'You can also use a leading bot mention, such as `@Musina play <input>` or `@Musina search <query>`.',
  'Join my active voice channel to use pause, resume, skip, stop, or shuffle.',
].join('\n');

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a media URL, playlist, selections page, or YouTube search')
    .addStringOption((option) =>
      option
        .setName('input')
        .setDescription('Media URL, playlist, selections URL, or YouTube search terms')
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search YouTube and choose a result')
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('YouTube search terms')
        .setRequired(true),
    ),
  new SlashCommandBuilder().setName('pause').setDescription('Pause playback'),
  new SlashCommandBuilder().setName('resume').setDescription('Resume playback'),
  new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and leave voice'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the playback queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming tracks'),
  new SlashCommandBuilder().setName('help').setDescription('Show Musina commands'),
].map((command) => command.toJSON());
