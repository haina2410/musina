# Queue Pagination and Skip-To Design

## Goal

Make long playback queues navigable with requester-only Previous and Next
buttons, while adding an explicit command that jumps playback to a numbered
upcoming track. Keep the existing `/skip` behavior unchanged.

## User Experience

`/queue` and `@Musina queue` show the current track and up to 10 upcoming
tracks per page. When the queue has more than one page, the reply includes
Previous and Next buttons. The unavailable direction is disabled on the first
or last page. A single-page queue does not need navigation controls.

Only the user who requested the queue may use its buttons. Another user who
clicks one receives an ephemeral explanation, and the queue message is not
changed.

Pagination is live rather than a snapshot. Each click reads the current queue
again. If playback or another command has shortened the queue so that the
requested page no longer exists, Musina shows the latest valid page. If the
session has ended, the message becomes `Nothing is playing.` and its buttons
are removed.

`/skip` and `@Musina skip` continue to skip only the current track. The new
`/skip-to <position>` and `@Musina skip-to <position>` commands use the same
one-based positions shown by `/queue`. For example, `skip-to 3` discards the
current track and upcoming positions 1 and 2, then starts the track that was at
position 3.

## Architecture

### Playback queue pages

`PlaybackManager` exposes a structured, read-only queue-page operation instead
of making the Discord layer parse a formatted queue string. A page result
contains the rendered content plus enough normalized pagination metadata for
the caller to build controls. The manager uses a fixed page size of 10,
preserves absolute queue numbering across pages, clamps requested pages to the
current valid range, and sanitizes titles through the existing safe-title
path.

The existing plain `queue(guildId)` behavior may delegate to the first page so
existing consumers remain compatible while Discord commands use the structured
page result.

### Stateless Discord buttons

A focused queue-pagination command module owns button custom IDs, parsing, and
component rendering. Custom IDs encode the requester ID and target page. No
server-side paginator state is stored, so controls continue to work after a
process restart as long as the Discord message remains interactive.

Both slash and mention queue commands build the initial reply through the same
helper. The interaction listener recognizes queue buttons, verifies the
requester before reading or editing anything, reads the live page, and updates
the existing message with new content and controls.

### Skip-to mutation

`PlaybackManager.skipTo(member, position)` owns validation and queue mutation.
It requires the requester to be in Musina's active voice channel, requires a
positive integer, and requires that the requested upcoming position exist.
After validation, it removes every upcoming entry before the target and stops
the current player once. The existing idle/advance path then promotes the
target track, preserving the established playback and voice-status lifecycle.

The slash command defines a required integer `position` option with a minimum
of 1. Mention-command routing parses its argument strictly as one positive
integer and reports a usage error otherwise. Both command forms invoke the
same manager method.

## Errors and Edge Cases

- Empty sessions render `Nothing is playing.` without buttons.
- A queue with a current track but no upcoming tracks renders only the current
  track and has no buttons.
- Unauthorized button clicks receive an ephemeral response and do not edit the
  queue message.
- Live queue shrinkage clamps navigation to the last available page.
- `skip-to` rejects zero, negative, non-integer, missing, non-numeric, and
  out-of-range positions without changing the queue or stopping the player.
- Voice-channel authorization failures use the existing playback-control
  errors.

## Testing

Tests will cover:

- first, middle, and last queue pages with absolute track positions;
- page clamping after live queue shrinkage and empty-session rendering;
- button custom-ID parsing and boundary component states;
- requester-only button handling and live message updates;
- slash and mention routing for queue pagination and `skip-to`;
- successful skip-to queue mutation and promotion through the existing idle
  path;
- invalid and out-of-range skip-to positions leaving playback unchanged; and
- updated command definitions, help text, and README documentation.

## Out of Scope

- Changing the existing `/skip` command.
- Storing queue snapshots or paginator sessions.
- Adding direct page-number buttons or a page-number slash option.
- Allowing queue viewers other than the original requester to operate a
  message's controls.
