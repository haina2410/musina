import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from '@discordjs/voice';
import type { GuildMember, SendableChannels, VoiceBasedChannel } from 'discord.js';
import type { Logger } from 'pino';
import type { ResolvedAudio, Track } from './types.js';
import type { YtDlpResolver } from './YtDlpResolver.js';

interface Session {
  activeAudio: ResolvedAudio | null;
  channelId: string;
  connection: VoiceConnection;
  current: Track | null;
  idleTimer: NodeJS.Timeout | null;
  player: AudioPlayer;
  queue: Track[];
  textChannel: SendableChannels;
}

export class PlaybackManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly resolver: YtDlpResolver,
    private readonly idleDisconnectMs: number,
    private readonly maxQueueSize: number,
    private readonly logger: Logger,
  ) {}

  async enqueue(member: GuildMember, textChannel: SendableChannels, url: string): Promise<string> {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) throw new Error('Join a voice channel first.');
    const existing = this.sessions.get(member.guild.id);
    if (existing && existing.channelId !== voiceChannel.id) {
      throw new Error('Join the voice channel I am already using first.');
    }
    if (existing && existing.queue.length >= this.maxQueueSize) throw new Error('The queue is full.');

    const track = await this.resolver.inspect(url, member.id);
    const session = existing ?? this.createSession(voiceChannel, textChannel);
    session.textChannel = textChannel;
    if (!existing) this.sessions.set(member.guild.id, session);
    if (session.current) {
      session.queue.push(track);
      return `Queued **${this.safeTitle(track.title)}** at position ${session.queue.length}.`;
    }
    session.current = track;
    this.play(session);
    return `Now playing **${this.safeTitle(track.title)}**.`;
  }

  skip(member: GuildMember): string {
    const session = this.requireSameChannel(member);
    if (!session.current) throw new Error('Nothing is playing.');
    session.player.stop(true);
    return 'Skipped.';
  }

  stop(member: GuildMember): string {
    const session = this.requireSameChannel(member);
    session.queue.length = 0;
    this.destroy(member.guild.id, session);
    return 'Stopped playback and left voice.';
  }

  queue(guildId: string): string {
    const session = this.sessions.get(guildId);
    if (!session?.current) return 'Nothing is playing.';
    const upcoming = session.queue.slice(0, 10).map((track, index) =>
      `${index + 1}. ${this.safeTitle(track.title)}`,
    );
    return [`Now: **${this.safeTitle(session.current.title)}**`, ...upcoming].join('\n');
  }

  nowPlaying(guildId: string): string {
    const track = this.sessions.get(guildId)?.current;
    return track ? `Now playing **${this.safeTitle(track.title)}**.` : 'Nothing is playing.';
  }

  shutdown(): void {
    for (const [guildId, session] of this.sessions) this.destroy(guildId, session);
  }

  private createSession(channel: VoiceBasedChannel, textChannel: SendableChannels): Session {
    const connection = joinVoiceChannel({
      adapterCreator: channel.guild.voiceAdapterCreator,
      channelId: channel.id,
      guildId: channel.guild.id,
      selfDeaf: true,
    });
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    const session: Session = {
      activeAudio: null, channelId: channel.id, connection, current: null,
      idleTimer: null, player, queue: [], textChannel,
    };
    connection.subscribe(player);
    player.on(AudioPlayerStatus.Idle, () => this.advance(channel.guild.id, session));
    player.on('error', (error) => {
      this.logger.error({ error, guildId: channel.guild.id }, 'audio player error');
      void session.textChannel.send({ content: 'Playback failed; trying the next track.', allowedMentions: { parse: [] } });
    });
    connection.on(VoiceConnectionStatus.Disconnected, () => {
      void entersState(connection, VoiceConnectionStatus.Connecting, 5_000).catch(() =>
        this.destroy(channel.guild.id, session),
      );
    });
    return session;
  }

  private play(session: Session): void {
    if (!session.current) return;
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.idleTimer = null;
    session.activeAudio?.cleanup();
    session.activeAudio = this.resolver.createAudio(session.current);
    session.player.play(createAudioResource(session.activeAudio.stream));
  }

  private advance(guildId: string, session: Session): void {
    session.activeAudio?.cleanup();
    session.activeAudio = null;
    session.current = session.queue.shift() ?? null;
    if (session.current) {
      this.play(session);
      void session.textChannel.send({
        content: `Now playing **${this.safeTitle(session.current.title)}**.`,
        allowedMentions: { parse: [] },
      });
      return;
    }
    session.idleTimer = setTimeout(() => this.destroy(guildId, session), this.idleDisconnectMs);
  }

  private destroy(guildId: string, session: Session): void {
    if (this.sessions.get(guildId) !== session) return;
    if (session.idleTimer) clearTimeout(session.idleTimer);
    session.activeAudio?.cleanup();
    session.player.stop();
    session.connection.destroy();
    this.sessions.delete(guildId);
  }

  private requireSameChannel(member: GuildMember): Session {
    const session = this.sessions.get(member.guild.id);
    if (!session) throw new Error('Nothing is playing.');
    if (member.voice.channelId !== session.channelId) {
      throw new Error('Join my voice channel to control playback.');
    }
    return session;
  }

  private safeTitle(title: string): string {
    return title.replaceAll('@', '@\u200b').replaceAll('*', '\\*').slice(0, 180);
  }
}
