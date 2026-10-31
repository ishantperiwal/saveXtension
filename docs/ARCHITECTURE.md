# Architecture

```text
Instagram Saved / X Bookmarks (your logged-in tab)
        │ rendered DOM only; selected tab, no cookies exported
        ▼
Extension collector (isolated content-script world)
        │ batches via chrome.runtime messaging
        ▼
Extension service worker (holds paired device token)
        │ HTTPS, or HTTP on loopback for local development
        ▼
Node 24 HTTP server → SQLite → authenticated web library
```

There are no social API calls. A website alone cannot read the social tabs; the extension supplies the import bridge.

## Authentication boundaries

The first-run setup code is random per server process and printed only in the terminal. It is needed once to set a scrypt-hashed password. Web login creates a random seven-day session; only its SHA-256 hash is stored in SQLite. The cookie is HttpOnly, SameSite=Strict, and Secure when configured for HTTPS. Mutations require the exact application Origin; Host checks limit DNS rebinding. Requests have size limits, and login/pairing attempts are rate limited by socket IP. Behind a reverse proxy the socket IP is shared, deliberately favoring a conservative personal-app limit over trusting spoofable forwarded headers.

An authenticated web session creates a five-minute single-use pairing code. The extension exchanges it for a random device bearer token. Only the token hash is stored server-side. That token can create sync runs and send/finalize batches belonging to that device. It cannot export/read the library, edit user notes, delete posts or pair another browser. Revocation takes effect on the next server request. Extension storage is restricted to trusted extension contexts, so the collector never reads pairing tokens. Optional host permissions are requested only for the chosen library host; the social-page grant comes from activeTab.

## Data model

- `posts`: unique `(platform, external_id)`; canonical URL, captured text, creator, media URL, content type, topic suggestions, custom tags, source account labels, timestamps, notes, favorite and archive flags.
- `sync_runs`: device, platform/account, progress counters and final status/message. Stale running records appear interrupted after twenty minutes.
- `devices`, `pairing`, `sessions`, `settings`: single-owner access and browser pairing.

Ingestion is transactional. An invalid row does not prevent valid rows in the same batch from importing. Reimports keep the longer caption and existing title/notes/favorite/archive state, union tags/topics/account labels, and replace a valid thumbnail URL when newly captured. Original saved timestamps from backups are restored into a fresh library; social imports use the time first imported, not an invented original save time.

## Collector lifecycle

1. Popup starts a run for the active tab; service worker validates its URL and injects scripts using activeTab.
2. Extract current rendered posts before each scroll. The first pass resets to the top if necessary.
3. Keep a set of seen post URLs; send batches every twenty posts or every other pass, waiting for server acknowledgement before continuing.
4. Stop on navigation/account changes, login/rate-limit notices, user cancellation, ten minutes, chosen post limit, or five no-new-content checks. A no-new-content result remains explicitly partial.
5. Finish the run and retain all acknowledged data. Popup checks for missing collectors after reload/navigation; stale server records eventually display interrupted.

The service worker stores current run state in local extension storage so reopening the popup works. There is no unattended scheduling or automatic retry. If a network acknowledgement is lost after the server commits, starting a new sync is safe because ingestion is idempotent at the post level; revisited counters can increase.

## Deliberate limits

No platform passwords, hidden API interception, proxies, CAPTCHA solvers, automatic account switching, video downloads, transcript generation, guaranteed full captions, two-way unsaving, or multi-user hosting. Thumbnails are remote links with an expiry fallback. Keyword topics and search work without external services. Library JSON backups preserve user-owned annotations.
