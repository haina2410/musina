# UwUFUFU Public Game Links Design

## Goal

Make `/play` accept a public UwUFUFU song-game link at `https://www.uwufufu.com/worldcup/<slug>`, discover its game ID from the page HTML, and import its first queue-sized page of playable YouTube selections. Remove support for caller-supplied UwUFUFU API URLs. The site's `worldcup` route names a bracket-style game and does not imply football content.

## Input and security boundary

The importer recognizes only standard HTTPS URLs on the exact host `www.uwufufu.com` whose path contains exactly one non-empty segment after `/worldcup/`, with an optional trailing slash. Credentials and custom ports are rejected. Query strings and fragments are allowed because they do not change the trusted origin or path classification.

Direct `api.uwufufu.com/v1/selections` URLs are no longer classified as UwUFUFU inputs. They fall through the existing media URL validation and are rejected because they are neither YouTube nor SoundCloud links.

Both provider requests disable redirects and use independent ten-second abort signals. The API URL is constructed internally from a validated numeric ID, so user input cannot choose the API host or endpoint.

## Import flow

`PlayInput.resolve` recognizes the public game URL and delegates it to `UwufufuImporter.load`.

The importer performs two requests:

1. Fetch the public page as text.
2. Match the Next.js hydration marker `\"worldcup\":{\"id\":<digits>` and validate that the captured ID is a positive safe integer.
3. Construct `https://api.uwufufu.com/v1/selections?page=1&perPage=<limit>&worldcupId=<id>` internally.
4. Fetch and parse that JSON response using the existing selection validation and YouTube embed conversion.

The importer preserves API response order, skips malformed or non-YouTube selections, and reports the skipped count exactly as it does today. It imports only page 1. The entry limit defaults to 51 and is configured at startup as `MAX_QUEUE_SIZE + 1`, matching the current-track slot plus the upcoming queue capacity.

## Errors

The importer reports clear failures for an unsupported public URL, a failed public-page request, missing or invalid hydration data, a failed API request, invalid API JSON, an invalid selections payload, and a page with no playable YouTube entries. Existing `/play` command error handling returns these messages to the requester.

## User-facing copy

Command help and the README describe UwUFUFU game links rather than selections API URLs. The README uses the supplied public song-game URL as its example and explains that the first queue-sized selection page is imported.

## Tests

Unit tests cover strict public URL classification, rejection of direct API and lookalike URLs, exact two-request behavior, ID extraction, queue-sized API URL construction, response ordering, skipped entries, and each provider failure class. `PlayInput` and bot-level tests use public game links to prove `/play` routing while existing YouTube, SoundCloud, playlist, and query behavior remains unchanged.
