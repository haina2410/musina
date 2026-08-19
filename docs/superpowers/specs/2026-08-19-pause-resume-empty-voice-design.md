# Pause, Resume, and Empty Voice Channel Design

## Goal

Add explicit pause and resume controls, automatically pause when the last non-bot listener leaves the bot's voice channel, resume when a listener returns, and disconnect after five minutes if the channel stays empty.

## Commands

- Register `/pause` and `/resume` slash commands.
- Support `@Musina pause` and `@Musina resume` through the existing mention-command path.
- Both commands require the caller to be in the bot's active voice channel.
- `/pause` returns `Paused.` and `/resume` returns `Resumed.`.
- Pausing an already paused player and resuming a player that is not paused return clear errors.
- Add both commands to help text and the README command list.

## Playback State and Voice Events

`PlaybackManager` remains the owner of each guild's playback session. Each session records whether its current pause is manual or was caused by an empty channel, plus a timer for the empty-channel disconnect.

`createBot` listens for Discord `voiceStateUpdate` events and forwards them to `PlaybackManager`. The manager reacts only when the event affects its active voice channel. It determines occupancy from the channel's current cached members and ignores bot accounts.

When the channel has no non-bot listeners while a track is active, the manager pauses the audio player, marks the pause as automatic, sets the voice channel status exactly to `paused - waiting for someone...`, and starts a timer using `IDLE_DISCONNECT_MS` (default `300000` milliseconds).

When a non-bot listener joins during an automatic pause, the manager cancels the timer, resumes the audio player, clears the automatic-pause marker, and restores the current track status. A join never overrides an explicit `/pause`.

If the timer expires while the session is still automatically paused and empty, the manager uses its existing destruction path to stop playback, clean up media, clear status and queue state, destroy the voice connection, and delete the session.

## Status and Edge Cases

- Manual `/pause` sets the voice channel status to `paused`.
- `/resume` restores the current track status.
- Empty-channel pausing does nothing when there is no current track.
- Repeated voice-state events are idempotent: they do not create duplicate timers or repeat pause/resume calls.
- Existing natural queue exhaustion continues to use the idle disconnect behavior unchanged.
- Stop and shutdown clear any active empty-channel timer through the shared destruction path.

## Testing

Keep coverage focused for implementation speed:

1. Extend the command-definition/dispatch coverage to prove pause and resume are registered and routed.
2. Add one playback lifecycle test that proves the last listener leaving pauses and sets the waiting status, a listener returning resumes and restores the song status, and five minutes of continued emptiness destroys the connection.

Run the focused tests first, then the existing full test, lint, and typecheck commands before completion.
