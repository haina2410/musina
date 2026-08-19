# Search Feature Design

## Goal

Let Musina users find and play YouTube tracks without first locating a URL.
`/play <input>` will accept either an existing supported input or free-text search
terms and queue the best YouTube match. `/search <query>` will show five YouTube
matches in a dropdown so the requesting user can choose one. Leading bot-mention
commands will provide the same behavior.

## Considered Approaches

1. Add a focused `yt-dlp` search boundary alongside the existing resolver. This
   is selected because it reuses the deployed media tool, requires no new
   credentials, and keeps provider-specific process handling outside Discord and
   playback code.
2. Use the YouTube Data API for discovery, then pass selected URLs to `yt-dlp`.
   This offers a purpose-built search API but adds credentials, quota management,
   HTTP failure modes, and operator configuration for metadata that `yt-dlp` can
   already provide.
3. Pass free text directly through the existing single-URL inspection path. This
   is initially smaller, but it mixes input classification with provider search
   syntax and does not cleanly support a five-result interactive search.

## Command Behavior

The existing `/play` command keeps one required string option, renamed from
`url` to `input` so Discord guidance reflects its broader purpose. The value is
trimmed and classified as follows:

- An UwUFUFU selections API URL follows the existing ordered import path.
- A supported YouTube or SoundCloud HTTPS URL follows the existing single-track
  path.
- Any other non-empty value without a URI-scheme prefix such as `http:`, `ftp:`,
  or `spotify:` is treated as a YouTube search query. The best match is queued or
  started immediately.
- A value with a URI-scheme prefix that is not accepted by the existing URL
  policy remains an error and is never reinterpreted as search text.

`/search` adds one required `query` string option. It searches YouTube and sends
the best five results in a string-select dropdown. Each option shows a safely
truncated title and, when known, a compact duration. Search results are public
in the channel because they lead to a public playback action, but only the user
who issued the command may use the dropdown.

Mention-prefixed commands have equivalent syntax: `@Musina play <input>` and
`@Musina search <query>`. The existing `@Musina <url>` shorthand remains limited
to supported URLs; arbitrary text without an explicit `play` or `search` command
does not trigger provider search.

## Components and Responsibilities

### Input classification

`PlayInput` distinguishes imports, supported single URLs, free-text queries, and
invalid URL-shaped values. It depends on the existing URL policy and UwUFUFU
importer, but it does not know how searching or playback works. Its result union
makes every handler branch explicit.

### YouTube search

The `yt-dlp` integration exposes a search operation that accepts a trimmed query
and a requested result limit. It invokes the binary without a shell, uses
`ytsearch<N>:` provider syntax, enables the existing Node JavaScript runtime,
disables playlists and warnings, and retains the existing process timeout and
bounded-output protections.

Search output is normalized to small candidate objects containing a canonical
YouTube URL, title, and optional duration. Entries without a usable HTTP(S) URL
or whose canonical URL cannot fit Discord's 100-character select-option value
are discarded. Option labels and descriptions are truncated to their respective
100-character Discord limits. An empty result set produces a clear no-results
error. Query length is capped at 200 characters before process invocation; blank
or longer queries are rejected.

### Playback

`PlaybackManager` gains a query-enqueue operation for `/play` text input. It
validates the member's playback voice channel and queue capacity before doing the
search, then adds the best result through the same internal track/session path as
URL playback. This avoids provider work for a request that cannot be queued and
preserves voice-channel, title-sanitization, status, and queue behavior.
The best result is subject to the configured maximum track duration before it is
added; an over-limit or unavailable best match fails rather than silently choosing
a lower-ranked result.

Interactive `/search` discovery does not require voice membership. When the
requester selects an entry, the bot passes its canonical URL through the existing
`enqueue` operation. Selection-time inspection deliberately revalidates the
track, duration limit, voice channel, and current queue capacity instead of
trusting stale dropdown metadata.

### Discord interaction handling

Slash and mention handlers share helpers that produce the same search menu and
dispatch the same playback operations. A search dropdown custom ID contains a
versioned prefix, the requester's Discord user ID, and a base-36 creation
timestamp. The selected option value contains only a canonical media URL, so no
server-side search-session store is required.

On an authorized selection, the handler defers the component update before
starting media inspection. Success replaces the original search response with
the normal `Now playing` or `Queued` text and removes its components. A playback
error is sent to the requester ephemerally and leaves the menu available for a
retry until it expires.

## Authorization, Expiry, and Error Handling

Search menus expire five minutes after creation. The timestamp in the custom ID
is authoritative, including after a bot restart. A late selection receives an
ephemeral expiry message. Selecting another user's menu receives an ephemeral
authorization message; neither case mutates the original response or invokes
playback.

Provider timeouts, invalid output, no results, unsupported URL-shaped input,
blank queries, and overlong queries use specific user-facing errors and are
logged through the existing command failure path. Search titles and echoed query
text are escaped or neutralized for Discord mentions and Markdown and truncated
to platform limits. Subprocess arguments are passed as an array with `shell:
false`; user text is never interpolated into a shell command.

If a dropdown result becomes unavailable, exceeds the configured track-duration
limit, the queue fills, or the requester is not in the correct voice channel,
normal playback validation supplies the error. The menu remains usable after
these recoverable failures until its five-minute expiry.

## Data Flow

For `/play` text input:

1. The command handler asks `PlayInput` to classify the input.
2. A query result is sent to `PlaybackManager`.
3. Playback validates voice membership and queue capacity.
4. The search boundary asks `yt-dlp` for the best YouTube result.
5. Playback adds the normalized track and returns the existing playback message.

For `/search`:

1. The handler validates and searches the query for five candidates.
2. It renders candidates in a requester-bound, timestamped dropdown.
3. The requester selects a canonical URL within five minutes.
4. The component handler re-enters the existing URL enqueue path.
5. Success removes the menu; failure is private and leaves it retryable.

## Testing

Unit tests will cover:

- `PlayInput` classification of supported URLs, UwUFUFU imports, ordinary text,
  blank values, malformed URLs, and unsupported URL schemes/hosts;
- `yt-dlp` search arguments, top-one and top-five limits, normalized metadata,
  discarded unusable entries, timeout/error behavior, and no-result behavior;
- query enqueue validation order, best-match playback, and unchanged queue and
  voice rules;
- command registration and help text for the broader `/play` input and new
  `/search` command;
- slash and mention search rendering, explicit mention syntax, and preservation
  of mention-with-URL shorthand;
- requester-only component authorization, five-minute expiry, successful
  enqueue/removal, and private recoverable errors; and
- regressions for URL playback, SoundCloud playback, UwUFUFU imports, and all
  existing commands.

The full `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build`
checks must pass before integration.

## Out of Scope

- SoundCloud text search or mixed-provider result ranking.
- Pagination, result-count controls, search filters, autocomplete, history, or
  recommendations.
- Letting users other than the requester operate a result menu.
- Persisting search results or component state across restarts.
- Searching the current playback queue.
- Changing existing duration, queue-size, idle-disconnect, or provider URL
  policies.
