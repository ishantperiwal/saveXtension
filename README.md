# saveXtension

Your Instagram saves and X bookmarks in one searchable library, on your computer.

## Desktop app

The Electron desktop app bundles its runtime and local server. Install the Mac DMG by dragging **saveXtension** to **Applications**, or run the Windows EXE installer. Opening the app starts the library automatically. Opening it again brings the existing window forward rather than starting a second server.

On the first Sync, follow the in-app setup to load the included helper in Chrome or Edge and approve social/bookmark access. The helper uses the logins in that browser; Electron does not copy your Chrome cookies. Chrome/Edge must remain available while syncing. The desktop app opens a short-lived browser connection page and the helper closes it once connected. Background collection still uses extension-owned tabs.

After the first configured sync, opening the app automatically runs a **quick** sync for the last selected accounts. **Library → Quick sync when app opens** turns this behavior on or off. Deep scans always require an explicit click.

**Settings → App updates** shows the installed version, download progress and **Check for updates**. Installed builds also check on opening and automatically download a newer stable installer from this repository's GitHub Releases. Only the matching OS/architecture package is accepted. The app verifies its size and GitHub SHA-256 digest before offering **Install version…**. Finish or stop sync first; installation opens the verified installer and quits the app. On Mac, drag the replacement into Applications, then reopen it. Saves and notes stay in the application-data directory. Local source runs do not download installers.

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

Open **http://localhost:3210**. There is no password, setup code, or pairing code in local mode. Existing saves and notes are preserved. Change the library name under **Settings & backups**. Open a save to add a note; it saves automatically as you type.

No runtime npm packages, API keys, AI services, or subscriptions are required.

## One button for setup and sync

Click the sync control directly below the sidebar logo. It shows an estimated **Synced** time; a new library shows **Sync saves**. While a sync runs it shows the current state. Successful and partial syncs update the timestamp, which survives restarts and is not replaced by failed or cancelled attempts.

The main sidebar click starts a quick sync with your saved choices. Its small arrow opens **Sync options**, with an estimated **Last synced** heading, account chips and active-save counts, plus manual **Deep scan**. Choose one or several accounts; the choices persist for the next sync. These controls are kept out of the browsing toolbar, which contains Filters and search.

The sidebar control starts the selected sources:

- If the extension is ready, background syncing starts immediately. You do not need to open the extension.
- If no helper is detected, the app downloads `savextension.zip` and shows installation instructions: unzip, open `chrome://extensions` (or `edge://extensions`), enable Developer mode, and load the extracted `extension/` folder.
- If Chrome needs background access, click **Open setup in Chrome**, then approve the extension’s one-time X/Instagram permission request.
- If your helper connected before but is offline, the app asks you to open Chrome instead of downloading another copy.

The installation dialog checks for readiness and starts the requested sync automatically when setup finishes. Closing that dialog cancels the pending request. Downloads do not repeat when you use Check installation; Download again and Reinstall remain available explicitly.

Sign in to X or Instagram in Chrome normally. Social passwords and cookies are not sent to the library. Chrome still requires you to complete extension installation and permission approval yourself.

The same Sync button works from another browser or the Codex in-app browser when a connected Chrome helper is online.

## Sync

Open the arrow within the sidebar **Sync** button to choose Instagram, Chrome, and individual signed-in X accounts using chips. **All** selects every available account. Click **Sync now**, or use the main sidebar button later to repeat those choices.

For social sources, the extension creates its own inactive, muted tab and discovers saved posts in batches. It only visits individual posts when richer details are missing; successful detail captures do not expire daily. It closes its own tabs when done. Your existing tabs are never navigated or scrolled. Progress and **Stop** stay in the library; imported batches are kept even if you stop.

The Chrome library page starts the request immediately. If using the library in another browser or the Codex in-app browser, Chrome checks the local queue about every 30 seconds. Keep Chrome and the local server running.

For X, select one or several detected **@handle** chips inside **Sync options**. A current-account fallback appears before account discovery. The helper discovers accounts from X’s own account menu and switches automatically before importing each selected account. It verifies the active profile before starting an import. The chips follow the accounts X exposes rather than assuming a pair. Choosing several but not all X accounts requires the updated helper; older helpers leave those requests queued instead of importing excluded accounts. Signed-in accounts are detected automatically at startup and checked periodically; there is no separate refresh control.

Account switching shares X’s login state with your other Chrome tabs and may leave X on the last account synced. Saves are labeled with their source account; the same post saved by multiple accounts stays one library record with both labels. Your own titles, notes and tags are preserved. Login prompts and platform checks still require you to resolve them normally.

Instagram uses the active Instagram login. On each Instagram sync, it first reads the Saved collection list, then checks **All posts** and each collection exposed in that list. Names appear automatically beneath **Instagram** as an indented sidebar tree with connecting branches. Click a collection to browse its captured posts. A post in multiple collections remains one library record, with a membership in each collection. Collection names retain emoji; identical names under different accounts remain separate.

Quick checks use a separate known-post boundary for each collection, so an existing library post can still acquire its original Instagram folder membership. Deep scans check older collection history only when manually requested. Collection passes capture list metadata and membership without adding individual detail-fetch passes for each folder. Empty collections remain listed, and renaming a collection updates its name without losing membership. Partial or missing collection lists never erase existing folders or memberships. The next sync requires the updated extension (1.6.0 or later); older helpers are asked to reload before claiming Instagram jobs.

**Sync** performs a quick check. It imports new post IDs and stops after a stretch of 20 distinct previously saved posts for that source account. The same post under another account does not establish this boundary. Quick checks are limited to 500 posts or ten minutes per account/collection; they do not verify older history or older unsaves. With no known posts, the quick check collects until the page stops yielding posts or a limit is reached; choose Deep scan for a larger first import.

**Deep scan**, in the sidebar’s **Sync options** menu and in the extension popup, is always manual. It checks older history without stopping at known posts, with limits of 100,000 posts or two hours per account/collection. No timer, quick check, startup, or partial result schedules another deep scan. Thousands of posts can still take time to load. The library keeps acknowledged batches immediately; Stop keeps imported data. An interrupted scan may need to traverse earlier pages again on the next manual attempt; there is no reliable platform pagination checkpoint yet.

Both modes deduplicate by platform post ID. Extra detail visits are limited to 25 per source scan and to posts observed in that run. Posts with complete X list metadata or a previous successful detail capture are skipped. Failed detail attempts wait a day before retrying; pending details are reported and can be revisited in a later manual deep scan.

During a manual X deep scan, older saves missing from the exposed list are checked separately, up to 25 per source scan. Missing from a list alone never deletes anything. Removal requires an explicit enabled **Bookmark** control on the exact post, with the signed-in account verified, stable across samples and confirmed again after a page reload. An unavailable post, unknown control, account mismatch, or absence from a partial list alone leaves the save intact. A confirmed unsave removes that account association; another account's save and its notes are retained. Locally archived posts are retained. Instagram and Chrome unsaves/deletions are not propagated.

Slow loading, virtualized feeds and platform changes can produce partial imports. Five checks without new content, an interruption, or a safety limit produces an incomplete result, never a claim that all history or all removals were verified.

## Chrome bookmarks

Choose **Chrome bookmarks** and click **Sync**. On first use, open setup and approve **Allow Chrome bookmarks**. This optional permission is separate from X/Instagram access; browser bookmarks work without social logins. Chrome itself describes the permission as reading and changing bookmarks, but saveXtension only reads the tree.

The **Chrome bookmarks** source tab shows titles, domains and full folder paths. Search includes bookmark titles, URLs, folders and your annotations. Filter by folder or view browser bookmarks alongside social saves in **All saves**. Duplicate URLs merge with all their folders. A repeat sync refreshes Chrome’s title and folder metadata while preserving your own title, notes and tags. Chrome links stay separate from social-save records even when a bookmark points at a social post.

The import uses the current Chrome profile’s bookmark tree, without opening bookmarked websites or changing bookmarks. It supports HTTP/HTTPS links; bookmarklets, internal Chrome pages and file links are skipped. Deleted Chrome bookmarks are retained in the library until you remove them there; library edits do not change Chrome. No page screenshots, favicons or website content are downloaded. Chrome bookmark metadata is included in library backups.

## Native previews and local content

X posts and Instagram posts/Reels render as native platform embeds directly in the grid and in the expanded preview. Their own media players and carousel controls are available where the platform supports the post. Your notes and automatic topic labels remain around the embed. Chrome bookmark titles come from Chrome.

Only posts near the viewport load embeds. Platform scripts run inside sandboxed preview frames rather than the library document. Background metadata refreshes update the wrapper without rebuilding an existing player. Closing an expanded preview unloads that preview’s frame.

Posts load live from their platforms. There is no saved-copy view or duplicated creator header. Unavailable embeds show **Retry** and **Open original**. Native embeds need internet access and depend on the platform allowing embedding; private, deleted, age-restricted or embedding-disabled posts may be unavailable. No paid embedding service or API key is required.

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

The library opens directly to search, source/topic filters and saved content. Counts appear once in source navigation. Sync progress floats at the bottom right with source icons, Stop and Dismiss, without moving posts. Finished notices disappear after eight seconds; dismissed jobs stay quiet for this browser session. Full run history lives in Settings. Favorites remain hidden. Archive sits below Chrome in the source list, and saves can be archived or restored from their footer or expanded view. Archived saves are excluded from the active library, source counts, topics, search and default API reads. Existing annotations and backup fields remain intact.

Interface refinement used [unslop](https://heydamir.design/unslop) by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0. Native post embeds provide the visual content; the shell uses quiet neutrals and the existing bookmark mark.

## Notes

Each save has one editable note. Changes save after a short typing pause, on blur and when the editor closes; there is no Save Changes action. Writes to the same save are serialized so a slower earlier request cannot replace newer typing. Pending drafts stay in browser storage and are restored after reload, then retried automatically after a failed request or reconnection. The status distinguishes saving, saved and retrying. Notes retain whitespace and support clearing to an empty value. Titles and manual tags are not editable in the interface; existing legacy metadata stays in backups. The top-level add button is removed in favor of source sync.

## Search and navigation

Press **⌘F** on Mac or **Ctrl+F** on Windows/Linux to focus the library search and select its current query. The search pill shows the shortcut for the current operating system. From the note editor, the shortcut flushes the note and closes the editor before focusing search. The slash key types normally. Source navigation uses recognizable Instagram, X and Chrome marks in a floating rounded sidebar; on small screens the same source controls form a compact floating strip.

## Filters

The library always uses the grid, ordered newest saved first. **Filters** opens a panel for saved dates, account chips, topics and Chrome folders. Select one or several Instagram/X handles directly, or Chrome bookmarks. Platform icons distinguish handles shared across services. A two-handle timeline brackets the saved period. Now is on the left and All Time (negative infinity) on the right; either endpoint can move. Selected endpoint labels are bold beneath the slider, with no repeated caption above. Stops include one calendar month ago, 30 days ago, one week ago, Yesterday and Today. The two handles cannot cross. Drag a handle, click/drag the track to move the nearest handle, or use arrow keys, Home and End. Labels and the matching-save count update while moving. The lower boundary is inclusive and the upper boundary exclusive, so Yesterday → Today selects yesterday and Today → Now selects today. Calendar boundaries use the browser’s local timezone.

Saved dates on Instagram/X records reflect their first library sync, not the unavailable original bookmark timestamp. Chrome uses the bookmark’s original date. Account and topic selections each match either choice; different filter categories combine. Posts saved by multiple selected accounts appear once. The panel previews matching results and applies with **Show saves**; Escape/Close discards the draft. **Reset** beside Show clears the draft. Applied filters appear as removable chips, with **Clear all** to reset them. Chrome folders are available when Chrome alone is selected. Search combines with these filters, and Cmd/Ctrl+F closes the panel to focus search.

The interface uses locally served Space Grotesk with IBM Plex Mono for handles, counts and small details. Their SIL Open Font License files are included in `public/fonts/`; no font service is contacted at runtime.


## Archive and knowledge-base reads

Archive is a local, reversible exclusion. It does not unsave posts on Instagram/X or change Chrome bookmarks. Archive a save using its footer action; open **Archive** in the source list to search it or **Restore to saves**. Restoring retains the original saved date, notes, topics, folders and account associations. Repeat syncs preserve the archive flag.

`GET /api/posts` and `Store.posts()` return active saves by default. A future MCP reader should use this default for its knowledge-base input. `GET /api/posts?scope=archive` explicitly retrieves archived saves; `scope=all` is used by the library's Archive management interface. These are retrieval scopes, not access-control boundaries. Backups at `/api/export` include both active and archived saves so exclusions survive restoration.

## Appearance

The wider floating sidebar lists Instagram and X source handles individually, with their own save counts. Each row opens that account’s saves, and Instagram collections are nested beneath their owning handle. Shared posts count under each owner and appear once in All saves. Chrome and Archive follow the account rows. The library currently uses light mode throughout, including X previews, so native Instagram posts fit the surrounding interface. Theme switching is hidden for now; saved dark preferences and system appearance do not override light mode. The dark palette remains available in the code for future use.
