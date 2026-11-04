# saveXtension

Your Instagram saves and X bookmarks in one searchable library, on your computer.

Download for Mac (Apple Silicon) or Windows (64-bit) at **[ishantperiwal.github.io/saveXtension](https://ishantperiwal.github.io/saveXtension/)**. Sign in to X and Instagram inside the app; Chrome bookmarks are read straight from Chrome, including bookmarks synced from your other devices when Chrome sync is on. No browser extension is needed.

The minimal download page lives in `website/`. `node scripts/build-download-page.mjs` generates `dist/downloads/` with links to the latest stable installer assets. The Download page workflow deploys to GitHub Pages after page changes or a successful Desktop installers run, so new releases refresh both download buttons without a browser-side GitHub API request.

## Desktop app

The Electron desktop app bundles its runtime and local server. Install the Mac DMG by dragging **saveXtension** to **Applications**, or run the Windows EXE installer. Opening the app starts the library automatically. Opening it again brings the existing window forward rather than starting a second server.

Connect X and Instagram in **Settings → Accounts** (or follow the first Sync prompt). Each account signs in on its platform’s own page inside the desktop app and uses a separate persistent Electron session. Login sessions remain local across app restarts; reconnect if a platform expires the session or requests a check. The app does not copy Chrome cookies, store passwords in its library, or include social sessions in JSON exports or MCP responses.

Social scans, collection refreshes, metadata capture and confirmed unsaves run in hidden, sandboxed Electron windows with background throttling disabled. They reuse the shared collector and exact-account verification logic, preserve source ordering, and close their temporary pages after completion, failure or Stop. An unsave still requires confirmation and two account-matched unsaved observations after a verification reload before removing a local source save. Each account’s session is independent of Chrome and of the other accounts.

**Chrome bookmarks** are read directly from Chrome's own bookmark file for every Chrome profile on this computer. The desktop app needs no extension, no bookmark permission, and Chrome does not have to be open; it only reads titles, URLs, folders and dates and never changes a bookmark. The browser-hosted library continues to use the extension for bookmarks and the original extension-based social flow.

Disconnecting an account clears that account’s in-app session and keeps its existing saves, notes and topics. Interrupted scans retain acknowledged imports. A worker restart ends unverified unsaves without deleting their local references; they require a new confirmation.

After the first configured sync, opening the app automatically runs a **quick** sync for the last selected accounts. **Library → Quick sync when app opens** turns this behavior on or off. Deep scans always require an explicit click.

**Settings → App updates** shows the installed version, download progress and **Check for updates**. Installed builds also check on opening and automatically download a newer stable installer from this repository's GitHub Releases. Only the matching OS/architecture package is accepted. The app verifies its size and GitHub SHA-256 digest before offering **Install version…**. Finish or stop sync first; installation opens the verified installer and quits the app. On Mac, drag the replacement into Applications, then reopen it. Saves and notes stay in the application-data directory. Local source runs do not download installers. Their manual Check for updates button checks release metadata and offers View release when a newer version exists, without installing over local work.

Code commits alone are not app releases. To publish, bump `package.json` and the root package-lock version, commit, and push a matching `vX.Y.Z` tag. The Desktop installers workflow tests and builds on macOS and Windows, then publishes both installers only after both jobs pass. The first build with App updates must be installed manually once; older builds have no updater. These test builds use the normal installer flow rather than a silent replacement/restart mechanism.

Data and the managed helper live outside the installed app, under `saveXtension` in the operating system's application-data directory. Replacing the app does not replace the database. On first launch, an available local-mode library at `localhost:3210` is copied into the desktop library; the original is retained. If it is not running, use **Library → Import existing library** to choose a JSON backup or SQLite library. Development launches can also copy the checkout's existing `data/savextension.sqlite`. Only saves, collection metadata and the library name are imported; old queued jobs and authentication settings are not copied.

Build and verify locally:

```sh
npm ci
npx install-electron --no
npx playwright install chromium
npm run desktop
npm run test:desktop
npm run desktop:mac
npm run desktop:verify
npm run desktop:win
```

Installers are written to `dist/desktop/`. The current Mac command targets Apple Silicon; pass `--x64` directly to electron-builder for an Intel Mac build. The Windows command produces an x64 NSIS installer. Running **Desktop installers** manually uploads artifacts without publishing; pushing a version tag publishes a release after all checks pass.

These initial installers are test builds. The Mac app has a local ad-hoc signature, not Apple notarization, and the Windows installer has no publisher certificate. OS trust prompts may appear. The Windows installer can be built on a Mac, but Windows launch/install behavior requires verification on Windows. For isolated development tests, `SAVEX_DESKTOP_DATA_DIR` chooses a separate app-data directory and `SAVEX_DESKTOP_LEGACY_ORIGIN` selects the legacy source; normal users need neither.

## Start

Use Node.js 24 or later:

```sh
npm start
```

On this Mac, you can also double-click **Start saveXtension.command**, or run `npm run open`. This starts the server if needed and opens your library.

Open **http://localhost:3210**. There is no password, setup code, or pairing code in local mode. Existing saves and notes are preserved. Change the library name under **Settings & backups**. Click a save’s pencil to add an inline sticky note; it saves automatically as you type.

Run `npm install` once when using the source checkout. The desktop app bundles its dependencies. No API keys, AI services, or subscriptions are required.

## Connect your LLM with MCP

Open **Settings → MCP**, turn on **Enable MCP server**, then click **Copy connection prompt**. Paste it into an MCP-compatible AI app on this computer. The prompt asks the agent to identify its harness and installed version, configure and verify the local connection, and preserve existing servers and model/provider settings (including DeepSeek). The prompt includes the address and setup instructions; Settings shows no raw URL or manual configuration panel. A bottom-center “Connection copied” toast includes the instruction to paste into an MCP-compatible AI app, keeping that guidance out of Settings. The setting persists. The URL is the running library’s origin plus `/mcp` (normally `http://localhost:3217/mcp` in Electron or `http://localhost:3210/mcp` from `npm start`). Connection prompts always use the address of the running app, including any alternate port.

Keep saveXtension running while connected. MCP uses Streamable HTTP on the existing loopback server, supports both legacy and current MCP clients, and starts disabled for a new library. Turning it off closes active MCP exchanges and rejects subsequent requests. It requires no pairing code, password or model API key. Access is limited to this computer, with Host and Origin validation; this endpoint is unavailable in authenticated/hosted mode. Any local application that connects while enabled can read the accessible library and make the local edits listed below.

Client-specific documentation is available for [OpenCode v1](https://opencode.ai/docs/mcp-servers/), [OpenCode v2](https://dev.opencode.ai/v2/docs/mcp-servers/), [Claude Code](https://code.claude.com/docs/en/mcp), [Codex](https://developers.openai.com/codex/mcp), and [VS Code](https://code.visualstudio.com/docs/agents/reference/mcp-configuration). The universal prompt asks the agent to check its client’s current configuration format and update only the saveXtension entry. A cloud-hosted connector cannot reach this computer’s localhost URL; use a client running locally. Installing a client and approving its tool permissions remain that client’s responsibility.

The prompt requires a version-matched minimal working example and config-shape classification before writing, then separate checks for parsed configuration, registered tools and an in-client `library_overview` call. Discovery and registration waits are bounded; missing tools produce a diagnostic instead of an indefinite “loading” claim. Read [MCP_CONNECTION.md](MCP_CONNECTION.md) before maintaining this prompt: it records the reported DSH incident, causal checks, evidence requirements and client dry-run plan. A prompt instructs the receiving agent; it cannot guarantee that an arbitrary client or LLM follows those instructions.

The server advertises its tools, resource guide and an **organize_library** prompt automatically. It does not load your entire library into the model’s context. You can ask, for example:

> Use saveXtension to review my Instagram reels saved in the last month. Reuse my existing topics where appropriate, create useful new topics across sources, and add the relevant saves. Tell me which references you could actually inspect and give me the change IDs.

| Tool | Purpose |
| --- | --- |
| `library_overview` | Active counts, source accounts, date coverage, topics, Instagram collections and Chrome folders. |
| `search_saves` | Paginated summaries with original URLs; combine text, source, saved-by account, topic, source collection, folder, kind, note presence, unorganized and date filters. |
| `get_saves`, `get_save_by_url` | Full captured captions/text, original links, media references, author, saved-by accounts, notes, tags, topics, dates and source memberships. |
| `list_topics`, `create_topic`, `update_topic` | Browse and create local topics; rename them or edit descriptions. |
| `set_save_topics` | Atomically add, remove or replace memberships for up to 200 saves. An empty replacement clears topics. |
| `merge_topics`, `delete_topic` | Merge duplicate topics; delete an empty topic without deleting saves. |
| `update_save_note` | Store analysis or edit a note, using `expectedUpdatedAt` from a fresh read to avoid overwriting newer edits. |
| `list_changes`, `undo_change` | Inspect and undo recent MCP edits; the journal keeps 100 changes. |

**Archive is excluded from every MCP post read and write.** There is no tool argument to include it. Archived/deleted IDs and URLs cannot be retrieved directly, and journal entries affecting those saves are hidden. Restoring a save through the app makes it accessible again. Global topic names and merges apply to the topic identity across the library; they do not expose archived post contents. Undo refuses changed fields or unavailable affected saves, rather than overwriting newer work.

Local topics span all sources and stay separate from the read-only Instagram collection and Chrome folder mirrors. Stable topic IDs survive rename/merge operations within this library. Explicit membership edits mark a save’s topics as curated, so subsequent source syncs preserve that exact set, including an intentionally empty set. Topic descriptions, empty custom topics, and curated memberships are included in backups and desktop imports. The app’s Filters and card topic buttons reflect MCP edits on the next library refresh.

Every returned save includes its original public URL. Captured metadata can be incomplete, media URLs can expire, and a post may require login or have disappeared. **The MCP server does not download videos, extract frames or produce transcripts.** The connected LLM must use its own permitted browser/media tools for that analysis and distinguish observed content from caption-based inference. Social saved dates normally mean the first local import; Chrome may supply the original bookmark date. Post text and notes are reference data, not trusted instructions.

The implementation uses the [official TypeScript MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk). No model-specific API or hosted service is part of the server.

## One button for setup and sync

Use the refresh button beside the save count for a quick or deep scan across all sources, or right-click an account to refresh only that account. Successful and partial syncs update the timestamp, which survives restarts and is not replaced by failed or cancelled attempts.

Account handles and their active-save counts appear in the sidebar. Choose Quick scan or Deep scan from the save-count refresh button for all sources, or from an account’s context menu for only that account. The browsing toolbar contains Filters, search, and the feed/grid switch.

The sidebar control starts the selected sources:

- If the extension is ready, background syncing starts immediately. You do not need to open the extension.
- If no helper is detected, the app downloads `savextension.zip` and shows installation instructions: unzip, open `chrome://extensions` (or `edge://extensions`), enable Developer mode, and load the extracted `extension/` folder.
- If Chrome needs background access, click **Open setup in Chrome**, then approve the extension’s one-time X/Instagram permission request.
- If your helper connected before but is offline, the app asks you to open Chrome instead of downloading another copy.

The installation dialog checks for readiness and starts the requested sync automatically when setup finishes. Closing that dialog cancels the pending request. Downloads do not repeat when you use Check installation; Download again and Reinstall remain available explicitly.

Sign in to X or Instagram in Chrome normally. Social passwords and cookies are not sent to the library. Chrome still requires you to complete extension installation and permission approval yourself.

The same manual sync controls work from another browser or the Codex in-app browser when a connected Chrome helper is online.

## Sync

The refresh button beside the save count offers **Quick scan** and **Deep scan** across all sources. Right-click an account for the same scan choices scoped to that account. The small circular refresh button beside a selected account runs a quick check for that account without changing your normal Sync selections. Instagram refresh uses its current login; it does not switch Instagram accounts.

For social sources, the extension creates its own inactive, muted tab and discovers saved posts in batches. It only visits individual posts when richer details are missing; successful detail captures do not expire daily. It closes its own tabs when done. Your existing tabs are never navigated or scrolled. Progress and **Stop** stay in the library; imported batches are kept even if you stop.

The Chrome library page starts the request immediately. If using the library in another browser or the Codex in-app browser, the connected helper checks the local queue about every two seconds (with an alarm fallback). Keep Chrome and the local server running.

For X, right-click a detected **@handle** to refresh only that account. The global refresh scans all signed-in X accounts along with the other sources. The helper discovers accounts from X’s own account menu, switches automatically, and verifies the active profile before importing. It uses the accounts X exposes rather than assuming a pair. Signed-in accounts are detected automatically at startup and checked periodically; there is no separate account-discovery control.

Account switching shares X’s login state with your other Chrome tabs and may leave X on the last account synced. Saves are labeled with their source account; the same post saved by multiple accounts stays one library record with both labels. Your own titles, notes and tags are preserved. Login prompts and platform checks still require you to resolve them normally.

Instagram uses the active Instagram login. On each Instagram sync, it first reads the Saved collection list, then checks **All posts** and each collection exposed in that list. Names appear automatically beneath the owning Instagram handle as an indented sidebar tree with connecting branches. Clicking an Instagram handle selects its saves and expands or collapses its collections. The small chevron beside it toggles the tree independently. Both remember the choice on this computer. Click a collection to browse its captured posts. A post in multiple collections remains one library record, with a membership in each collection. Collection names retain emoji; identical names under different accounts remain separate.

Quick checks use a separate known-post boundary for each collection, so an existing library post can still acquire its original Instagram folder membership. Deep scans check older collection history only when manually requested. Collection passes capture list metadata and membership without adding individual detail-fetch passes for each folder. Empty collections remain listed, and renaming a collection updates its name without losing membership. Partial or missing collection lists never erase existing folders or memberships. The next sync requires the updated extension (1.6.0 or later); older helpers are asked to reload before claiming Instagram jobs.

**Sync** performs a quick check. It imports new post IDs and stops after seven consecutive distinct previously saved posts for that source account or collection. Each new post resets this count. The collector checks the entire already-loaded viewport before deciding to stop, so a new post after familiar ones still keeps the scan going without an extra page load. The same post under another account does not establish this boundary. Quick checks are limited to 500 posts or ten minutes per account/collection; they do not verify older history or older unsaves. With no known posts, the quick check collects until the page stops yielding posts or a limit is reached; choose Deep scan for a larger first import.

**Deep scan**, in the refresh menu, account context menus and extension popup, is always manual. It checks older history without stopping at known posts, with limits of 100,000 posts or two hours per account/collection. No timer, quick check, startup, or partial result schedules another deep scan. Thousands of posts can still take time to load. The library keeps acknowledged batches immediately; Stop keeps imported data. An interrupted scan may need to traverse earlier pages again on the next manual attempt; there is no reliable platform pagination checkpoint yet.

Both modes deduplicate by platform post ID. Extra detail visits are limited to 25 per source scan and to posts observed in that run. Posts with complete X list metadata or a previous successful detail capture are skipped. Failed detail attempts wait a day before retrying; pending details are reported and can be revisited in a later manual deep scan.

During a manual X deep scan, older saves missing from the exposed list are checked separately, up to 25 per source scan. Missing from a list alone never deletes anything. Removal requires an explicit enabled **Bookmark** control on the exact post, with the signed-in account verified, stable across samples and confirmed again after a page reload. An unavailable post, unknown control, account mismatch, or absence from a partial list alone leaves the save intact. A confirmed unsave removes that account association; another account's save and its notes are retained. Locally archived posts are retained. Instagram and Chrome unsaves/deletions are not propagated automatically; explicit Instagram Unsave uses the separate confirmation flow below.

Slow loading, virtualized feeds and platform changes can produce partial imports. Five checks without new content, an interruption, or a safety limit produces an incomplete result, never a claim that all history or all removals were verified.

## Chrome bookmarks

Choose **Chrome bookmarks** and click **Sync**. On first use, open setup and approve **Allow Chrome bookmarks**. This optional permission is separate from X/Instagram access; browser bookmarks work without social logins. Chrome itself describes the permission as reading and changing bookmarks, but saveXtension only reads the tree.

The **Chrome bookmarks** source tab shows titles, domains and full folder paths. Search includes bookmark titles, URLs, folders and your annotations. Filter by folder or view browser bookmarks alongside social saves in **All saves**. Duplicate URLs merge with all their folders. A repeat sync refreshes Chrome’s title and folder metadata while preserving your own title, notes and tags. Chrome links stay separate from social-save records even when a bookmark points at a social post.

The import uses the current Chrome profile’s bookmark tree, without opening bookmarked websites or changing bookmarks. It supports HTTP/HTTPS links; bookmarklets, internal Chrome pages and file links are skipped. Deleted Chrome bookmarks are retained in the library and can be archived locally; library edits do not change Chrome. When bookmark cards come near the viewport, saveXtension reads the website’s public Open Graph/Twitter preview image and description. These load through the local app without opening a tab, running website scripts or using browser cookies. Preview metadata is reused for a day; image bytes are kept only in a bounded memory cache. Missing or blocked previews retain the original title and URL. Local-network URLs are not fetched. No page screenshots are generated. Chrome bookmark metadata is included in library backups.

## Native previews and local content

X posts and Instagram posts/Reels render as native platform embeds directly in the feed or grid. Their own media players and carousel controls are available where the platform supports the post. Your notes and automatic topic labels remain around the embed. Chrome bookmark titles come from Chrome.

Each expanded time group appends batches of 24 saves ahead of your scrolling, while search and filters still cover the entire library. Every scroll and layout change reprioritizes previews: visible posts load first, followed by roughly four screens above and below. New batches enter that same preload range before you reach them. Distant queued work is deferred, and unfinished distant loads yield their slots without becoming errors. At most six previews load at once; already loaded players remain intact. Adding a batch or receiving new saves keeps existing displayed players intact. Platform scripts run inside sandboxed preview frames rather than the library document. Background metadata refreshes update the wrapper without rebuilding an existing player.

The library opens in a centered single-column feed, up to 500px wide. The Feed/Grid toggle beside search remembers your choice. Switching animates the existing cards into place without recreating loaded preview frames or note editors, and respects reduced-motion preferences. Portrait media keeps its native proportions. In the feed, available space holds a 500px post beside a 240px yellow note panel. Empty notes show “No notes added yet.” and are directly editable without a pencil. Copy, retry, archive and social Unsave controls form a vertical list to the left of the preview, with a top-right source pill in the feed showing the platform icon, saved account handle and any Instagram source collection names separated by dots. Labels follow the selected account and collection, truncate to fit, and expose their full text on hover. Collection pills and the add button sit immediately below the note. Narrow feed windows stack the note and collections below the preview; the grid retains its toolbar and expandable note editor. X previews scale to at most 88% of native size for calmer typography; Instagram retains its existing scale.

The compact grid uses a 280px minimum card width and 16px gaps, fitting three columns in a typical laptop window. Native widgets scale to fit narrow cards with their shadow gutters intact. Loading placeholders use shorter captions and smaller images in the grid.

Collapsible separators group the library into **Added today** and **Added earlier**, based solely on when a post first entered saveXtension. The local calendar day determines the group, and today's additions move to Added earlier automatically at midnight. Refreshing, editing notes, or archiving/restoring does not change that date. A dedicated addedAt field separates app additions from original Chrome bookmark dates. Existing social first-import dates are retained; older Chrome records whose import date was never recorded remain in Added earlier with no fabricated timestamp. Each card's top row has copy, retry, archive, social Unsave and note actions on the left and just its platform icon on the right, with no repeated date text. In the main Instagram account or All saves view, posts belonging to Instagram source collections also show those collection names just before the platform icon. Names truncate to fit, with the full list on hover; they are hidden in a specific source collection, local topic collection or Archive view. Shared saves show the memberships belonging to the selected source account. The bottom row shows all assigned local collections as pills, with a plus button on the left even when no collections are assigned. The plus opens a searchable picker excluding existing memberships. Choose an existing collection or type a name and create it inline; creation and assignment are atomic. Manual organization is shared with MCP and marked curated so later syncs preserve it. Source Instagram collections and Chrome folders remain separate and unchanged. Search, account filters, collections, Archive and appended batches use the same grouping. In the feed, separators are centered pills over the post column with fading lines on either side; the grid retains its line separators. Click the separator to collapse or expand its group; choices are remembered locally. Collapsed groups do not start preview loads or retries, and loaded players remain mounted for reopening. Each expanded group pages independently. Date filters use the app addition date. Selecting an individual X account shows one continuous list in its observed bookmark order across all app addition dates; date blocks do not reorder that account. Date filters still use the original app addition date. Combined views retain Added today and Added earlier, preserving each X account’s source sequence inside each group. Tweet publication dates do not determine bookmark order. Traversal positions persist across batches and retries. Scans reset restored source pages to the top and wait for the initial post list to settle before recording positions or scrolling; an empty loading viewport cannot skip the first bookmarks. Quick X scans also record the familiar prefix so existing bookmarks moved to the top keep their observed position. Mixed-source views retain other sources’ slots while ordering each X account’s subsequence; selecting an account uses that account’s ordering for shared posts. Older imports recover ordering where first-import traversal is known; the first quick scan after this upgrade walks the exposed X history to establish missing positions without running deep-scan removal checks. Reordering uses state-preserving DOM moves where available so loaded players stay intact.

Cards enter with a subtle slide and scale. Preview height changes and neighboring cards animate together, while existing cards keep their columns as embeds grow. Players remain mounted during these transitions. The interface respects the system’s reduced-motion preference, including changes made while an animation is running.

Posts load live from their platforms. While an embed is queued or loading, its captured author, caption, available image and date appear immediately; these disappear when the native post is ready. Captured text remains visible if embedding fails, alongside **Retry** and **Open original**. Images still load from their stored remote URLs. There is no separate saved-copy view or duplicated creator header after an embed loads. Native embeds need internet access and depend on the platform allowing embedding; private, deleted, age-restricted or embedding-disabled posts may be unavailable. No paid embedding service or API key is required.

Confirmed failed previews automatically retry while visible: after 5 seconds, then 10, 20 and at most 30 seconds between continued failures. Retries pause offscreen, behind an open dialog, while offline or while the app is hidden. They share the six-load preview budget and yield to fresh visible previews. Healthy players and attempts still loading remain intact. Manual Retry is always available and resets the delay. Platform error messages inside a cross-origin widget cannot always be detected; those may still need manual Retry.

Links, searchable metadata, classifications and your annotations stay in SQLite. Post images and video are not copied into the library; the old generated image cache is removed on upgrade. Richer metadata capture is best effort.

## Backups

**Settings & backups → Export library** downloads JSON with your saves and annotations. **Settings → Import a file** accepts saveXtension JSON backups, JSON/HTML/TXT URL lists and supported X archive JS data files. ZIP archives must be extracted first; imported scripts are never executed.

For a full library database backup, stop the server and copy the entire `data/` folder. Data is stored in `data/savextension.sqlite`.

## Local configuration

Optional `.env` settings:

```dotenv
HOST=127.0.0.1
PORT=3210
# DATA_DIR=./data
```

Local mode accepts only loopback connections and localhost origins. It retains host/origin checks. It is intended for your computer, not public hosting. The old password-authentication backend is retained behind `AUTH_REQUIRED=true` for future development; the new background sync workflow targets local mode.

## Development

```sh
npm ci
npm test
npm run test:e2e
```

If needed, install the test browser with `npx playwright install chromium`. Browser tests use isolated profiles and intercepted fixture pages, without signing into real social accounts. Tests cover no-password local access, name/annotation preservation, queue claims/cancellation, live-only embeds, automatic X account switching, source-account deduplication and inactive-tab sync without moving the active tab.

`npm start` packages the extension automatically. `npm run package:extension` also creates `dist/extension.zip` and `public/extension.zip`. Reload the extension after source changes.

## Reading interface

The library opens directly to search, source/topic filters and saved content. Counts appear once in source navigation. Sync progress floats at the bottom right with source icons, Stop and Dismiss, without moving posts. Successful platform notices show an eight-second countdown that pauses while reading. Notices needing attention remain visible with a platform-specific Retry button; dismissed jobs stay quiet for this browser session. Favorites remain hidden. Archived stays at the bottom of the sidebar, and saves can be archived or restored from their footer. Archived saves are excluded from the active library, source counts, topics, search and default API reads. Existing annotations and backup fields remain intact.

Interface refinement used [unslop](https://heydamir.design/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Native post embeds provide the visual content; the shell uses quiet neutrals and the existing bookmark mark.

## Notes

Each card’s **Copy post reference** icon copies its save ID, original URL and an MCP read hint. Paste this into a connected LLM chat to request that exact save with its metadata and note. Archived references indicate that the save must be restored before MCP can access it.

Each save has one editable note. In the feed, its yellow editor is always visible with “No notes added yet.” for an empty note; click anywhere in it to write. The placeholder is never saved as note content. Collection pills and the add button sit below it. In the grid, the pencil opens the sticky note below the toolbar and above the post, without a modal or a second player. Existing notes show at most six lines, with Read more and Show less to expand or collapse them. Editing always reveals the complete note; no text is removed. Notes can be edited in place. In the grid, the pencil slides an empty note open; clicking it again closes the empty section. Notes containing text remain visible. Note motion respects reduced-motion preferences and retains the existing post player. Notes are exposed through MCP as additional context in the existing notes field. The Delete control is removed; Archive remains the reversible exclusion. Open original appears in the embed failure fallback, while working social posts use their native links. Changes save after a short typing pause and on blur; there is no Save Changes action. Writes to the same save are serialized so a slower earlier request cannot replace newer typing. Pending drafts stay in browser storage and are restored after reload, then retried automatically after a failed request or reconnection. A quiet status shows saving or retrying; successful saves clear that status. Notes retain whitespace and support clearing to an empty value. While reading a note, HTTP/HTTPS URLs and bare domains become clickable links; desktop clicks open the system default browser. Click ordinary note text or blank note space to edit. The saved note and MCP context remain plain text. Titles and manual tags are not editable in the interface; existing legacy metadata stays in backups. The top-level add button is removed in favor of source sync.

## Search and navigation

Press **⌘F** on Mac or **Ctrl+F** on Windows/Linux to focus the library search and select its current query. The search pill shows the shortcut for the current operating system. From an inline note, the shortcut flushes the draft and focuses search without opening another view. Escape clears an active search and restores its previous browsing position and loaded page, keeping account, source, collection and date filters. Open dialogs and dropdowns handle Escape first; typing in a note does not dismiss the search. The slash key types normally. Source navigation uses recognizable Instagram, X and Chrome marks in a floating rounded sidebar; on small screens the same source controls form a compact floating strip.

## Filters

The library offers a single-column feed and compact grid. **Filters** opens a panel for saved dates, account chips, topics and Chrome folders. Select one or several Instagram/X handles directly, or Chrome bookmarks. Platform icons distinguish handles shared across services. A two-handle timeline brackets the saved period. Now is on the left and All Time (negative infinity) on the right; either endpoint can move. Selected endpoint labels are bold beneath the slider, with no repeated caption above. Stops include one calendar month ago, 30 days ago, one week ago, Yesterday and Today. The two handles cannot cross. Drag a handle, click/drag the track to move the nearest handle, or use arrow keys, Home and End. Labels and the matching-save count update while moving. The lower boundary is inclusive and the upper boundary exclusive, so Yesterday → Today selects yesterday and Today → Now selects today. Calendar boundaries use the browser’s local timezone and the app addition date.

Date added uses the first import into saveXtension for every platform, including Chrome. Original savedAt metadata is retained separately; it does not drive the app timeline. Account and topic selections each match either choice; different filter categories combine. Posts saved by multiple selected accounts appear once. The panel previews matching results and applies with **Show saves**; Escape/Close discards the draft. **Reset** beside Show clears the draft. Applied filters appear as removable chips, with **Clear all** to reset them. Chrome folders are available when Chrome alone is selected. Search combines with these filters, and Cmd/Ctrl+F closes the panel to focus search.

The interface uses locally served Space Grotesk with IBM Plex Mono for handles, counts and small details. Their SIL Open Font License files are included in `public/fonts/`; no font service is contacted at runtime.


## Archive and knowledge-base reads

Archive is a local, reversible exclusion. It does not unsave posts on Instagram/X or change Chrome bookmarks. Archive a save using its top-row action; open **Archive** in the source list to search it or **Restore to saves**. Restoring retains the original saved date, notes, topics, folders and account associations. Repeat syncs preserve the archive flag.

**Unsave** is a separate, destructive action for X and Instagram. Its confirmation identifies the post and source account, requires choosing an account when several have it saved, and explains that Chrome will open briefly and return to the app after completion. Cancel performs no platform action. Unsave keeps its last ten stage timings locally, including whether an X account switch was needed, to help diagnose slow operations. It removes the selected account's upstream bookmark or Instagram save (including Instagram source collection memberships). After verifying the unsaved state again on a reloaded post page, the app deletes the local save, notes, collection assignments and note-history entries. It never moves the save to Archive. If another account still has the same post saved, the shared local entry and its notes remain for that account.

Unsave requires Chrome with browser helper 1.8.2 or newer and the selected source account signed in. Instagram Reels use the single-post /p/ layout for their original shortcode, avoiding the multi-post Reels viewer. For Unsave only, the helper activates its temporary tab, checks the exact post and signed-in account before clicking, and does not automatically replay an interrupted or uncertain action. Failed or unverified results leave the local entry intact and display an error. Instagram account mismatches require signing into the selected account first. Chrome bookmarks have no Unsave action, and MCP does not expose upstream unsaving. Closing the confirmation without submitting never queues a request.

`GET /api/posts` and `Store.posts()` return active saves by default. A future MCP reader should use this default for its knowledge-base input. `GET /api/posts?scope=archive` explicitly retrieves archived saves; `scope=all` is used by the library's Archive management interface. These are retrieval scopes, not access-control boundaries. Backups at `/api/export` include both active and archived saves so exclusions survive restoration.

## Appearance

The sidebar has **Accounts** and **Collections** tabs and remembers your preferred view on this computer. Accounts lists source handles and their Instagram folders. Collections lists the local topics used by MCP, with active-save counts across all sources; choose a collection to browse its posts without an account filter. Empty managed collections remain available. Above both tabs, a shared All saves item shows the active-save count (for example, **452 saves**) and opens the complete library. Its refresh icon offers **Quick scan** or **Deep scan** for Chrome, Instagram and all signed-in X accounts, without changing the saved account selection in Settings. Instagram collection chevrons sit beside their handles; long handles truncate visually while retaining their full accessible names and hover labels.

The wider floating sidebar lists Instagram and X source handles individually, with their own save counts. Each row opens that account’s saves, and Instagram collections are nested beneath their owning handle. Shared posts count under each owner and appear once in All saves. X accounts appear first, followed by Chrome and Archive; Instagram accounts and their collections appear last. The library currently uses light mode throughout, including X previews, so native Instagram posts fit the surrounding interface. Theme switching is hidden for now; saved dark preferences and system appearance do not override light mode. The dark palette remains available in the code for future use.

Right-click an account row for **Quick scan and refresh** or **Deep scan and refresh**. Keyboard users can press Shift+F10 or the context-menu key. Instagram collection rows offer those same two refresh actions for just that collection. Selecting a collection moves the left-edge refresh button beside it; clicking that button performs a quick collection-only refresh. These one-time requests leave All and pinned collection choices unchanged and never scan unrelated collections or All Posts. The helper may read the collection catalog first to verify the selected folder and signed-in account. Instagram also offers **Customize save list**: select All and collection chips independently. All includes every Instagram save, including uncollected posts; the collection chips choose which shortcuts appear below the account. With All off, the main account shows only the union of the selected collections. The choice is stored in the local library and applies to both future Instagram scans and library visibility. With All off, scans visit only the selected collections; they do not collect from All Posts or other folders. With All on, scans collect the complete saved list regardless of the pinned collection shortcuts. Existing unselected saves are retained and reappear with All. The account handle and chevron always expand or collapse the collection shortcuts, regardless of whether All is selected. The collapsed state is remembered independently of save-list selections. Selecting an Instagram account to refresh requires that same account to be signed into Chrome; it never silently imports another account. Browser helpers older than 1.7.2 must be reloaded before they can claim these scoped jobs.
