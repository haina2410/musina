# Musina

Musina is a small Discord voice bot. Use `/play <url>` with a YouTube or
SoundCloud link, or mention the bot with one of those links; it joins your current
voice channel and starts playing. Later requests are queued per server.

`/play` also accepts an UwUFUFU selections API URL and imports the usable YouTube
videos from that response page in order. It does not fetch additional pages.
Invalid or unavailable entries are skipped, and the configured queue capacity is
still enforced. For example:

```text
https://api.uwufufu.com/v1/selections?page=1&perPage=10&worldcupId=168808
```

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
   View Channels, Send Messages, Connect, and Speak permissions.
4. Copy `.env.example` to `.env`, then fill in the token and application ID.
   Set `DISCORD_GUILD_ID` during development for immediate command updates.

## Run locally

```sh
npm install
npm run register
npm run dev
```

The available commands are `/play`, `/skip`, `/stop`, `/queue`, and
`/nowplaying`. Skip and stop may only be used from the bot's active voice
channel. Playlists are intentionally rejected, tracks default to a four-hour
maximum, queues default to 50 tracks, and an empty session disconnects after
five minutes. These limits can be changed with the variables in `.env.example`.

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
