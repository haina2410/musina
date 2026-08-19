# UwUFUFU Import Progress Design

## Goal

Keep one bot reply visibly updated while a slow UwUFUFU song-game import inspects and queues tracks. The same reply becomes the final success or error message; the bot does not emit a stream of separate progress messages.

## User experience

After the public game page and selections have loaded, the bot immediately shows:

```text
Found 256 UwUFUFU songs. Checking tracks…
```

While tracks are inspected, that message is edited in place with log-like text:

```text
UwUFUFU import: checked 25/256 • queued 24 • skipped 1
```

The update includes selections rejected by the importer, tracks rejected during media inspection, and songs skipped because the queue became full. Progress edits are limited to at most one every two seconds, except the terminal progress state is always eligible. The normal final result or provider error replaces the progress text.

Slash `/play` uses its deferred interaction reply. Mention-prefixed `@Musina play <url>` creates one reply after selections load and edits that same reply. Other `/play` inputs keep their current reply behavior and do not show import progress.

## Architecture

`ResolvedPlayInput` identifies the batch source as `uwufufu` or `youtube-playlist`, allowing the bot layer to enable progress only for UwUFUFU without reparsing the original input.

`PlaybackManager.enqueueMany` accepts an optional asynchronous progress callback. Its progress snapshot contains `processed`, `total`, `added`, and `skipped`. `processed` and `total` include entries already rejected by the importer, so the displayed denominator represents the complete UwUFUFU game. The manager reports after each inspected track and once when remaining entries are accounted for as queue overflow.

The bot owns Discord-specific formatting and throttling. A progress editor catches and logs failed intermediate edits so a transient status-update failure cannot cancel playback. Final reply failures retain the existing command error behavior.

## Testing

Playback tests prove progress snapshots for successful, failed, and overflowed entries while preserving final import results. Bot tests prove slash replies are edited in place, intermediate edits are throttled, terminal progress is published, mention imports edit one reply rather than creating multiple replies, and non-UwUFUFU batches retain their existing behavior.
