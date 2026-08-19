import { SlashCommandBuilder } from 'discord.js';

export const HELP_TEXT = [
  '**Musina commands**',
  '`/play <input>` — play a URL, playlist, UwUFUFU game, or the best YouTube search match',
  '`/search <query>` — choose from the top five YouTube search results',
  '`/pause` — pause playback',
  '`/resume` — resume playback',
  '`/skip` — skip the current track',
  '`/skip-to <position>` — jump to an upcoming queue position',
  '`/stop` — stop playback and leave voice',
  '`/queue` — show the current and upcoming tracks',
  '`/nowplaying` — show the current track',
  '`/shuffle` — shuffle upcoming tracks',
  '`/help` — show this guide',
  '',
  'You can also use a leading bot mention, such as `@Musina play <input>` or `@Musina search <query>`.',
  'Join my active voice channel to use pause, resume, skip, skip-to, stop, or shuffle.',
].join('\n');

export const commandDefinitions = [
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a media URL, playlist, UwUFUFU game, or YouTube search')
    .addStringOption((option) =>
      option
        .setName('input')
        .setDescription('Media URL, playlist, UwUFUFU game, or YouTube search terms')
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
  new SlashCommandBuilder()
    .setName('skip-to')
    .setDescription('Jump to an upcoming queue position')
    .addIntegerOption((option) =>
      option
        .setName('position')
        .setDescription('Upcoming queue position')
        .setRequired(true)
        .setMinValue(1),
    ),
  new SlashCommandBuilder().setName('stop').setDescription('Stop playback and leave voice'),
  new SlashCommandBuilder().setName('queue').setDescription('Show the playback queue'),
  new SlashCommandBuilder().setName('nowplaying').setDescription('Show the current track'),
  new SlashCommandBuilder().setName('shuffle').setDescription('Shuffle the upcoming tracks'),
  new SlashCommandBuilder().setName('help').setDescription('Show Musina commands'),
].map((command) => command.toJSON());
