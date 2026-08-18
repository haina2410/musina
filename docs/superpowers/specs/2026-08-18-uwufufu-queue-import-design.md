# UwUFUFU Queue Import Design

## Goal

Let a Discord user pass an UwUFUFU selections API URL to the existing `/play`
command and enqueue the YouTube tracks in that response page, in response order.

Example input:

`https://api.uwufufu.com/v1/selections?page=1&perPage=10&worldcupId=168808`

## Considered approaches

1. Extend `/play` with a narrowly scoped UwUFUFU importer. This is the selected
   approach because users retain one obvious playback entry point and the bot
   fetches only a known API.
2. Add a separate `/import` command. This is explicit, but adds command surface
   without providing meaningful extra control for this single provider.
3. Accept arbitrary JSON-list URLs. This is out of scope because it would need a
   user-defined schema and would expose the bot to unrestricted server-side URL
   fetching.

## Command and data flow

`/play` continues to accept one required `url` option. The command handler first
classifies the input:

- Existing YouTube and SoundCloud URLs follow the current single-track path.
- An HTTPS URL with host `api.uwufufu.com` and path `/v1/selections` follows the
  import path.
- Other URLs retain the existing unsupported-link error.

The importer fetches the supplied selections URL with a short timeout and
redirects disabled. It validates the response as an object containing a `data`
array. Each usable entry must contain a YouTube embed URL in `videoUrl`. The
importer converts `/embed/<video-id>` URLs to ordinary YouTube watch URLs before
passing them to playback inspection. The current page only is imported; the bot
does not follow `total` or make additional pagination requests.

Playback inspects candidates in response order and adds successful tracks in
that same order. If nothing is playing, the first successful track starts
immediately and the rest become upcoming tracks. Existing per-guild voice
channel rules remain unchanged.

## Limits and partial results

The configured queue limit applies to upcoming tracks; the currently playing
track remains a separate slot, matching existing behavior. When less upcoming
capacity remains, only the entries that fit are attempted. Invalid, unsupported,
or unresolvable entries are skipped so one bad selection does not block the
valid tracks. An import never fetches another API page merely because some
entries were skipped.

The command response reports how many tracks were added and how many were
skipped. If at least one track was added, it also identifies the first added
track. If no track can be added, the command fails with a useful explanation.
The existing `/queue` command remains the way to display the resulting queue.

## Components

- A focused UwUFUFU URL/parser module classifies supported API URLs, fetches the
  payload, validates its minimal shape, and returns ordered YouTube URLs.
- `PlaybackManager` gains a bulk-enqueue operation that reuses existing voice,
  queue, title-sanitization, and resolver behavior.
- The Discord command handler dispatches `/play` to either single-track or bulk
  playback based on URL classification.
- Command wording and README documentation are updated to mention UwUFUFU list
  imports.

The importer depends only on the platform `fetch` API and has no Discord or
playback dependency. The playback layer receives ordinary media URLs and does
not know the external response schema.

## Error handling and safety

- Only standard HTTPS URLs on the exact UwUFUFU API host and selections path are
  fetched.
- Credentials, custom ports, redirects, malformed JSON, non-success HTTP
  responses, and malformed payloads are rejected.
- Fetches time out rather than holding a deferred Discord response indefinitely.
- Individual bad media entries count as skipped; provider-level failures reject
  the import.
- User-visible titles continue through the existing Discord escaping and length
  limit.

## Testing

Unit tests cover URL classification, minimal payload parsing, embed-to-watch URL
conversion, rejection of unsafe or malformed inputs, response-order
preservation, partial media failures, capacity handling, and all-failed imports.
The HTTP dependency is injected or represented by a small boundary so tests do
not depend on the live UwUFUFU service. Existing tests continue to cover normal
media URL behavior. The full test, lint, typecheck, and build commands must pass.
