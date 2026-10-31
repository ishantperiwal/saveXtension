# Architecture

The local web library posts a job to `/api/sync`. A localhost content-script bridge wakes the extension immediately in Chrome; a 30-second Chrome alarm also checks the queue, allowing requests from other browsers or the Codex in-app browser.

The extension claims a job, creates an inactive muted tab, and collects X Bookmarks or Instagram All posts using the existing Chrome login. It owns and closes only the tabs it creates. It never navigates or scrolls a pre-existing user tab.

Dedicated sync pages carry `#savex-sync`. An early main-world layout helper provides a timer fallback for animation-frame callbacks on these hidden pages. The isolated collector also dispatches scroll events after moving the viewport so virtualized feeds can advance without selecting the tab.

Collector batches are acknowledged by the Node server before being dropped from the collector queue. Jobs and runs persist an explicit quick/deep mode. Quick collection uses an account-scoped snapshot of stored post IDs and stops after 20 distinct known IDs, importing only unseen posts; repeated viewport content does not advance the boundary. Deep collection ignores that boundary and is only queued by an explicit user action. Quick limits are 500 posts/10 minutes; deep limits are 100,000 posts/two hours. Idle and interrupted collection stays partial. There is no durable remote pagination cursor; interrupted deep scans may retraverse earlier history.

`sync_discoveries` records successfully stored posts observed in each account/run. Extra detail selection is restricted to that run, skips archived records, complete X list metadata and all previous successful detail fetches, and caps visits at 25. Failed attempts have a one-day retry delay. Three unavailable detail pages end enrichment; pending counts are reported. The extension does not persist an ever-growing URL array for large collections.

The server validates and deduplicates posts in SQLite, preserving titles, notes, tags, favorite/archive state and accounts. Post media stays on its platform; the library stores links and search/classification metadata rather than image bytes. Startup removes the old generated media cache.

Archive is a local exclusion from the active knowledge base. `Store.posts()` and `GET /api/posts` default to active records; `scope=archive` and `scope=all` must be requested explicitly. The management UI loads all records to support archive counts and restoration, then scopes its search, filters and topics to the active or archived view. Backups include both scopes. Sync updates preserve the archive flag; enrichment queues use the active default. Future MCP retrieval tools should use the default active reads.

`sync_jobs` persists queue status, ownership, results and cancellation. Extension storage persists orchestration state, owned tab IDs and progress. Heartbeats and stale-job handling permit recovery after interruption. `sync_runs` records per-source imports and metadata activity. A stopped or interrupted sync keeps its acknowledged batches.

Local mode bypasses library passwords, sessions and extension pairing. It keeps loopback binding and host/origin checks. The legacy authenticated backend remains available for future development; the new background workflow is local-only.

No external API keys, runtime npm packages, AI services, manual X account switching, video downloads or subscription services are required. Collection remains best effort and does not guarantee full platform history. Manual X deep scans inspect up to 25 missing older saves using explicit bookmark controls on the exact post and verified account. Two stable unsaved observations separated by a reload permit removing only that source association; absence, failures, and unknown UI states do not. Archived posts are retained. Instagram and Chrome deletion propagation is not supported. Missing-check attempts have a one-day cooldown; larger backlogs require another manual deep scan. Only helpers advertising sync-mode support may claim deep jobs.

## Native preview frames

A preview-only HTTP server listens on a separate, dynamically allocated loopback port. The library session reports that origin and the main page’s CSP permits frames only from that preview origin. The preview server serves only validated post documents and its host JS/CSS; it has no library API or saved-content endpoints.

The grid and expanded preview load `/embed/x/:id` or `/embed/instagram/:kind/:code` on that separate origin. These documents load the platforms’ official widget scripts. Cross-origin isolation keeps them away from the library document and APIs, while sandbox permissions let the SDKs initialize their own nested players. The preview CSP permits embedding only from the configured library origin and its loopback alias.

The parent validates resize/readiness messages against the exact child window, lazy-loads nearby cards, and displays retry/original-link actions on failure. Keyed card updates preserve the existing iframe during background sync and annotation changes. Expanded-preview frames are removed when the dialog closes.

## X account selection

The helper discovers signed-in handles by reading X’s rendered account menu and publishes the catalog to the local server. Sync jobs persist `x_account` as `current`, `all`, or a specific handle. A durable per-account plan processes each selection sequentially, using the account menu’s exact Switch to control and verifying the profile link before importing. A missing or failed selection never silently falls back to another account.

Only helpers advertising account-switching support may claim jobs that require explicit selection. Results retain each source account, and ingestion merges account labels on a shared post. The library remembers the chosen account setting. Shared browser login state is allowed to change during this user-authorized workflow.

## Chrome bookmark source

The optional `bookmarks` permission enables read-only `chrome.bookmarks.getTree()` import. `extension/bookmarks.js` flattens the folder tree, rejects unsupported schemes and credentials, and combines duplicate URLs before batching them through normal sync runs. Chrome-only jobs require bookmark access but not social host access; older helpers cannot claim them. All-sources plans include Chrome first.

Bookmark records use the `chrome` platform and a SHA-256 identity over the normalized full HTTP/HTTPS URL, preserving meaningful query strings and fragments. `bookmark_title` and `folders` are source metadata refreshed on reimport; `title`, notes and user classifications remain user-owned. No destination fetch occurs. The shared library includes a source tab, folder filter, URL/title/folder search and backups. Imports are additive, with no writes back to Chrome.

## Instagram collections

Instagram sync visits the account's Saved index before All posts. The extractor reads same-account collection links and accessible names, ignores All posts and Audio, and uses the numeric Instagram collection ID as identity across slug/name changes. A bounded catalog discovery adds each observed collection to the persisted job plan. Every collection inherits the explicitly requested quick/deep mode; catalog discovery never upgrades a quick sync to deep.

`instagram_collections` stores account-scoped external IDs, names and links. `instagram_collection_posts` associates collections with deduplicated posts; `sync_runs.collection_id` scopes membership ingestion and known-ID snapshots. Global presence never establishes a collection boundary. Collection passes don't multiply individual detail visits. Partial lists retain existing folders and associations. Instagram membership removals are not inferred from absent page content.

Library reads expose the catalog (including empty collections) and each post's memberships. The sidebar renders accessible nested list items with connecting CSS branches; collection selection filters by stable local collection ID and coexists with search/date/topic filters. Catalog/membership changes refresh without reloading the page. Backed-up posts carry their collection metadata for restoration. Helpers must advertise collection support before claiming Instagram jobs.
