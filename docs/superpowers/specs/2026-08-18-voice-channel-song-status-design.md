# Voice Channel Song Status Design

## Goal

Show the currently playing song in the active Discord voice channel's status as
`🎵 <song title>`, and remove that status when playback is no longer active.

## API Integration

Discord exposes `PUT /channels/{channel.id}/voice-status` with a nullable
`status` field of at most 500 characters. In discord.js 14.27.0, the endpoint is
available through the client's authenticated REST manager and
`Routes.channelVoiceStatus(channelId)`; there is no voice-channel convenience
method for it in the installed release.

Introduce a small status service that accepts the discord.js REST manager. It
will provide two operations:

- Set a voice channel's status to `🎵 <song title>`, truncated to Discord's
  500-character limit.
- Clear a voice channel's status by sending `status: null`.

The service keeps REST and formatting details outside `PlaybackManager`.

## Playback Lifecycle

`PlaybackManager` receives the status service as a dependency and updates the
channel status at the same lifecycle boundaries that already control audio:

1. When a track starts, set the session's voice channel status to that track's
   formatted title.
2. When the player advances to another track, the normal play path replaces the
   status with the new title.
3. When the queue becomes empty, clear the status immediately, even though the
   bot remains connected during the configured idle timeout.
4. When playback is stopped, the connection is destroyed, or the application
   shuts down, clear the status as part of session cleanup.

Repeated cleanup may request another clear. Clearing is idempotent at the API
boundary, so this is safe; the implementation should avoid unnecessary duplicate
requests within a single destroy path.

## Error Handling

Voice channel status is supplementary to audio playback. REST failures—including
a missing `SET_VOICE_CHANNEL_STATUS` permission—must not interrupt playback,
queue advancement, stopping, or shutdown. The status service will catch rejected
REST requests and log a warning with the channel identifier and operation.

Status requests are asynchronous and are not awaited by synchronous playback
controls. Each request handles its own rejection so no unhandled promise
rejection is produced.

## Permissions and Documentation

The bot's role needs Discord's **Set Voice Channel Status** permission. Because
the bot is connected to the channel while setting or clearing playback status,
Discord does not additionally require **Manage Channels**. The README Discord
setup instructions will list the new permission.

## Testing

Tests will verify:

- The status service uses `Routes.channelVoiceStatus(channelId)` and sends
  `{ status: "🎵 <song title>" }`.
- Long formatted statuses are limited to 500 characters without corrupting the
  intended prefix.
- Clearing sends `{ status: null }`.
- REST failures are logged and resolve without propagating.
- Starting a track sets its status, advancing replaces it, and an exhausted
  queue clears it.
- Explicit stop and shutdown clear active session statuses without breaking
  existing playback cleanup.

## Out of Scope

- Changing the bot user's global presence or activity.
- Reading or restoring a status previously set by another user.
- Adding configuration for alternate prefixes or status formats.
- Requesting `MANAGE_CHANNELS` or changing channel names.
