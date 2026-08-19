# Musina

Musina is a small Discord voice bot. Use `/play <input>` with YouTube search
terms, a YouTube video or playlist URL, or a SoundCloud URL; it joins your
current voice channel and starts playing the best match. Later requests are
queued per server. Use `/search <query>` to choose from the top five YouTube
results in a requester-only dropdown. Every slash command can also use the bot
as a message prefix, such as `@Musina play <input>` or `@Musina search <query>`.
The existing `@Musina <url>` playback shorthand remains available.

YouTube playlist imports accept both standalone playlist URLs and video URLs
that contain a `list` query parameter. Tracks are considered in the order
returned by YouTube, including Mix/radio links such as:

```text
https://www.youtube.com/watch?v=oMGPJ4uE_W8&list=RDoMGPJ4uE_W8&start_radio=1
```

Playlist metadata is limited to the first `MAX_QUEUE_SIZE + 1` entries, enough
to fill the current-track slot and the upcoming queue when playback is empty.
Unavailable entries are skipped and the existing per-server queue limit still
applies.

`/play` also accepts a public UwUFUFU song-game link. It discovers the game's
internal ID, fetches every selection, and shuffles all usable YouTube videos
before filling the queue. This gives every song a chance to be selected even
when the game is larger than the configured queue capacity. Invalid or
unavailable entries are skipped, and the existing queue limit is still
enforced. For example:

```text
https://www.uwufufu.com/worldcup/vpop-vit-nam-c-in-tn-trng-yeetuzmymeatuz
```

While Musina inspects the shuffled songs, it edits one reply with the number
checked, queued, and skipped. The normal import result replaces that progress
text when queueing finishes.

## Requirements

- Node.js 22 or newer
- `ffmpeg` on `PATH`
- A current `yt-dlp` on `PATH`
- A Discord application and bot token

Only play media you are authorized to access. Bot operators are responsible for
following Discord's and each media provider's terms.

## Discord setup

1. Create an application and bot in the Discord Developer Portal.
2. Enable **Message Content Intent** on the Bot page. It is required for the
   mention-with-link feature.
3. Invite the bot with the `bot` and `applications.commands` scopes. Grant it
   View Channels, Send Messages, Connect, Speak, and Set Voice Channel Status
   permissions.
4. Copy `.env.example` to `.env`, then fill in the token and application ID.
   Set `DISCORD_GUILD_ID` during development for immediate command updates.

## Run locally

```sh
npm install
npm run register
npm run dev
```

The available commands are `/play`, `/search`, `/pause`, `/resume`, `/skip`,
`/skip-to`, `/stop`, `/queue`, `/nowplaying`, `/shuffle`, and `/help`. Search
menus expire after five minutes; only the requester can choose a result, and
voice-channel validation happens when they make that choice. `/queue` shows 10
upcoming tracks at a time with live Previous/Next buttons that only its
requester can use. `/skip-to N` jumps to the displayed one-based upcoming
position. Shuffle keeps the current track playing and randomizes the upcoming
queue. Pause, resume, skip, skip-to, stop, and shuffle may only be used from
the bot's active voice channel. A manual pause requires an explicit resume.
When the active voice channel becomes empty, Musina pauses automatically,
displays `paused - waiting for someone...`, and resumes when a listener
returns. An empty session disconnects after the configured five-minute
default. Tracks default to a four-hour maximum and queues default to 50
upcoming tracks. These limits can be changed with the variables in
`.env.example`.

## Validate and build

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

## Docker

```sh
docker build -t musina .
docker run --rm --env-file .env musina
```

The image includes FFmpeg and `yt-dlp`, runs as a non-root user, and uses `tini`
to reap media subprocesses.

## Live deployment

Musina has one remote environment. It uses the `KOMODO_STAGING_*` GitHub setting
names inherited from `shoe-web`, but this stack is the live deployment rather
than a pre-production promotion stage.

Configure Komodo to load `docker-compose.yml` from `main` and provide the
runtime variables from `.env.example`. `DISCORD_TOKEN` and
`DISCORD_CLIENT_ID` are required; the remaining variables keep the defaults
shown in that example. The stack pulls
`ghcr.io/haina2410/musina/app:${RELEASE_TAG:-latest}`. Leave `RELEASE_TAG`
unset to follow the newest successful `main` build, or set it to a published
full commit SHA to pin or roll back the bot.

Configure these GitHub repository settings:

- variable `KOMODO_STAGING_URL`
- variable `KOMODO_STAGING_STACK_NAME`
- secret `KOMODO_STAGING_API_KEY`
- secret `KOMODO_STAGING_API_SECRET`

Every push to `main` builds the Docker target `app` for `linux/amd64`, publishes
full-SHA and `latest` tags to GHCR, and redeploys the Komodo stack after the
image push succeeds. Manual workflow runs publish an image without deploying
the live stack.
