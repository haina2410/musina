# Shuffle and Help Commands Design

## Goal

Add shuffle behavior for randomizing upcoming playback and help behavior for
showing concise usage guidance without changing the currently playing track.
Expose every bot command through both Discord slash commands and a leading bot
mention.

## Considered Approaches

1. Add both commands through the existing command definition, bot handler, and
   playback manager boundaries. This is selected because it follows the current
   architecture and keeps queue mutation inside `PlaybackManager`.
2. Implement shuffling in the Discord command handler. This requires exposing
   session internals or moving queue ownership out of `PlaybackManager`, which
   weakens the existing boundary.
3. Introduce a command registry and separate command classes. This could make a
   much larger bot easier to extend, but is unnecessary for two small commands
   and would create unrelated refactoring.

## Command Behavior

`/shuffle` keeps the current track playing and randomizes every upcoming track
using an unbiased in-place Fisher-Yates shuffle. The caller must be in the voice
channel used by the active playback session, matching `/skip` and `/stop`.
Shuffling requires at least two upcoming tracks; otherwise the command returns a
clear error. A successful command reports the number of shuffled tracks.

`/help` returns an ephemeral response so reference text does not clutter the
channel. Its content is defined in one shared constant and lists the syntax and
purpose of `/play`, `/skip`, `/stop`, `/queue`, `/nowplaying`, `/shuffle`, and
`/help`. It also notes the active-voice-channel restriction on playback control
commands.

A leading bot mention is also a command prefix. Command names are
case-insensitive, so messages such as `@musina help`, `@musina shuffle`, and
`@musina stop` invoke the same behavior and validation as their slash-command
counterparts. `@musina play <url>` is the explicit mention form for playback,
while the existing `@musina <url>` shorthand remains supported. Mention-command
replies are ordinary channel replies because message interactions cannot be
ephemeral.

## Components and Data Flow

- The slash-command definitions add `shuffle` and `help` registrations.
- `PlaybackManager.shuffle(member)` validates the active session and caller's
  voice channel, then mutates only the session's upcoming queue.
- A small mention parser recognizes a leading `<@bot-id>` or `<@!bot-id>`,
  normalizes the command name, and returns its remaining argument without any
  Discord or playback dependency.
- The Discord interaction and message handlers explicitly dispatch all known
  commands. Shuffle delegates to the playback manager; slash-command help uses
  the ephemeral flag; mention-command help uses a normal reply.
- The README command list is updated so operator documentation matches the
  registered commands and describes mention syntax.

## Error Handling

`/shuffle` reuses the existing messages for no active session and wrong voice
channel. A queue with zero or one upcoming track fails with `Queue at least two
tracks before shuffling.` The existing command error handler returns these
errors ephemerally and logs the failure.

The handler will not silently treat an unknown command as `/nowplaying`; each
supported command has an explicit branch, and an unexpected name produces a
generic unsupported-command error.

An unknown mention command returns guidance to use `@musina help`. Mention
playback without a supported URL retains the existing supported-link guidance.

## Testing

Playback manager tests will make randomness deterministic and verify that:

- all upcoming tracks are reordered by Fisher-Yates while the current track is
  unchanged;
- successful output reports the shuffled track count;
- fewer than two upcoming tracks are rejected;
- callers outside the active voice channel are rejected.

Command tests will verify that both definitions are registered and that `/help`
is represented in the shared help content. Parser tests will cover both Discord
mention forms, case-insensitive commands, arguments, non-leading mentions, and
the URL shorthand. Handler tests will verify that mention commands dispatch to
the same playback operations as slash commands. The full test, lint, typecheck,
and build commands must pass.

## Out of Scope

- Moving or replaying the current track.
- Persisting a shuffled order across bot restarts.
- Adding shuffle modes, seeds, undo, or per-user help localization.
- Supporting natural-language commands or command aliases beyond the existing
  URL shorthand.
- Refactoring the command handler into a new command framework.
