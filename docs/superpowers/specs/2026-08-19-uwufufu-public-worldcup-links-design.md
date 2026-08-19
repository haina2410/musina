# UwUFUFU Public Game Links Design

## Goal

Make `/play` accept a public UwUFUFU song-game link at `https://www.uwufufu.com/worldcup/<slug>`, discover its game ID from the page HTML, fetch every selection in the game, shuffle the playable YouTube entries, and import that randomized list into the existing bounded queue. Remove support for caller-supplied UwUFUFU API URLs. The site's `worldcup` route names a bracket-style game and does not imply football content.

## Input and security boundary

The importer recognizes only standard HTTPS URLs on the exact host `www.uwufufu.com` whose path contains exactly one non-empty segment after `/worldcup/`, with an optional trailing slash. Credentials and custom ports are rejected. Query strings and fragments are allowed because they do not change the trusted origin or path classification.

Direct `api.uwufufu.com/v1/selections` URLs are no longer classified as UwUFUFU inputs. They fall through the existing media URL validation and are rejected because they are neither YouTube nor SoundCloud links.

Every provider request disables redirects and uses an independent ten-second abort signal. API URLs are constructed internally from a validated numeric ID, so user input cannot choose the API host or endpoint.

## Import flow

`PlayInput.resolve` recognizes the public game URL and delegates it to `UwufufuImporter.load`.

The importer performs these requests:

1. Fetch the public page as text.
2. Match the Next.js hydration marker `\"worldcup\":{\"id\":<digits>` and validate that the captured ID is a positive safe integer.
3. Construct `https://api.uwufufu.com/v1/selections?page=1&perPage=1000&worldcupId=<id>` internally.
4. Fetch and validate the first JSON page, including its non-negative integer `total`.
5. If `total` exceeds the collected entry count, fetch every remaining page required by that total and validate each page.
6. Convert every valid YouTube embed, count malformed or unsupported entries as skipped, and shuffle the complete playable URL list with an in-place Fisher-Yates shuffle.

The importer returns the complete shuffled URL list. `PlaybackManager.enqueueMany` retains responsibility for inspecting tracks and applying the current-track plus `MAX_QUEUE_SIZE` capacity; because the shuffle happens first, every song has a chance to enter a partially empty queue. Malformed or non-YouTube selections and queue overflow continue to contribute to the skipped count.

## Errors

The importer reports clear failures for an unsupported public URL, a failed public-page request, missing or invalid hydration data, a failed API request, invalid API JSON, an invalid or incomplete paginated selections payload, and a game with no playable YouTube entries. If any required page fails, the entire import fails rather than silently returning a partial game. Existing `/play` command error handling returns these messages to the requester.

## User-facing copy

Command help and the README describe UwUFUFU game links rather than selections API URLs. The README uses the supplied public song-game URL as its example and explains that all selections are fetched and shuffled before the queue limit is applied.

## Tests

Unit tests cover strict public URL classification, rejection of direct API and lookalike URLs, ID extraction, exact paginated API requests, complete-page aggregation, deterministic shuffle behavior through an injected random source, skipped entries, incomplete pagination, and each provider failure class. `PlayInput` and bot-level tests use public game links to prove `/play` routing while existing YouTube, SoundCloud, playlist, and query behavior remains unchanged.
