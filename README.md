# saveXtension

Your Instagram saves and X bookmarks, together in a private, searchable library.

A personal, self-hosted web app and a Manifest V3 Chrome/Edge extension. Open the account’s Saved or Bookmarks page, press **Sync**, and the extension sends the posts it can load to your library. Repeat for each account. There are **no Instagram/X API keys, AI-service keys, or npm runtime dependencies**.

## Start here

Install **Node.js 24 or later**. Then:

```sh
git clone https://github.com/ishantperiwal/saveXtension.git
cd saveXtension
npm start
```

Open **http://localhost:3210**. On first launch the terminal prints a **setup code**. Paste it into the web app, choose a library name and a password of at least 12 characters. Your saves are stored in `data/savextension.sqlite`.

`npm start` packages the extension automatically. No `npm install` is needed to run the application; dependencies are only for development tests.

## Install and pair the extension

1. In Chrome open `chrome://extensions` (Edge: `edge://extensions`). Enable **Developer mode**.
2. Choose **Load unpacked** and select this repository’s **`extension/`** folder. Alternatively, use **Connect extension → Download extension** in the web app, unzip, and select its `extension/` folder.
3. Pin the extension using the browser’s Extensions menu.
4. In the web library click **Connect & sync → Generate pairing code**.
5. Open the extension’s **settings**. Enter `http://localhost:3210`, the one-time code, and a browser name. Read and accept the import notice, then **Pair my library**. Approve access to the library host when the browser asks. Codes expire in five minutes and work once.

The extension gets a separate token. It never receives your library password. Revoke that browser at any time in **Settings & backups → Disconnect**.

## Sync

### X / Twitter

Sign into your account in the browser and open **Bookmarks** (`https://x.com/i/bookmarks`). Click the extension icon, optionally label the account, choose a post limit, and press **Sync this Saved / Bookmarks tab**.

### Instagram

Open your profile’s **Saved** page on the desktop website. Open **All posts** or a specific collection so the post grid is visible. Click the extension and press **Sync**. Collection tiles on the Saved landing page aren’t themselves posts.

Keep the source tab open until the import stops. You may close the popup: the collector runs in the source tab. It captures small batches, scrolls to load more, and sends acknowledged batches to the server. Reopening the popup shows progress. **Stop sync** retains batches already received.

For another account, switch accounts yourself and repeat. X profile links and the Instagram Saved path provide account labels when available; the optional input overrides detection. Imported posts are deduplicated by platform and post ID, even if you saved the same post from several accounts.

### What “Sync” means here

This is a **user-triggered, additive import**, not unattended background mirroring. Unsaving a post on Instagram/X does not delete your local copy. It doesn’t traverse unopened Instagram collections, switch accounts, or access the native mobile apps.

- **X:** captures rendered post text, author, timestamp, and available image/video-poster URLs. Collapsed long posts and unloaded thread replies aren’t expanded.
- **Instagram:** captures rendered post links, thumbnail URLs and available image accessibility descriptions. Grid pages often do **not** expose full captions or reliable creator names. Full carousel slides, video files and transcripts aren’t downloaded.
- **Previews:** images load from the original platform, with no referrer, and can expire. A fallback card retains the original link and captured text. Private, deleted or restricted originals can still require the corresponding social login.
- **Completeness:** virtualized feeds, layout changes, slow loading, login checks and platform limits can cause partial imports. After five checks with no new posts the app reports a **partial import**, not a guaranteed full history. Each run is capped at ten minutes and the chosen post limit (50–5,000).

**Platform rules matter:** X explicitly prohibits non-API automation, including scripting its website, and says accounts may be suspended. [Read X’s automation rules](https://help.x.com/en/rules-and-policies/x-automation). Instagram’s terms also restrict unauthorized automated collection; review the [Instagram terms](https://help.instagram.com/581066165581870). A user-triggered extension is not an assurance of platform permission. This tool does not bypass login checks, rate limits, challenges or access controls. Use manual links/file imports if you don’t want browser-based collection.

## Use the library

- Search captured text, titles, notes, tags, creators, URLs and source accounts. Press `/` to focus search.
- Filter by platform, favorites, archive, or topic. Sort newest/oldest/by creator; use grid or list view.
- Open a card to add a title, notes and tags, archive it, or open the original.
- **Topics** are local keyword suggestions, not AI analysis. No content is sent to an LLM.
- **Settings & backups → Export library** downloads JSON containing your saves and annotations.
- **Add a save → Import** reads JSON, HTML, TXT URL lists, or JSON data assigned inside an X archive `.js` file. It never executes imported scripts. Extract ZIP archives first. Formats and export contents vary, and some exports omit saved posts. Only supported post links are imported.
- An imported saveXtension backup restores notes, tags, accounts, favorite/archive states and saved timestamps into a fresh library. Reimports preserve existing edits. Restore backup files through the authenticated UI, not through the extension.
- **Sample library** is explicitly labeled example content and never added to your real saves.

## Configuration

Copy `.env.example` to `.env` to change defaults. Node reads `.env` at startup.

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listening address; loopback by default |
| `PORT` | `3210` | HTTP port |
| `APP_ORIGIN` | `http://localhost:<PORT>` | Exact browser-facing origin; required for a custom hostname/reverse proxy |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS; required when origin is HTTPS |
| `DATA_DIR` | `./data` | Persistent SQLite directory |

For access from other machines, host it behind an **HTTPS reverse proxy**, set `HOST=0.0.0.0`, `APP_ORIGIN=https://your-host.example`, and `COOKIE_SECURE=true`. Preserve the original `Host` header at the proxy. Pair the extension with that exact public origin. A hosted library can be viewed from your phone; browser syncing still runs on desktop. This is a **single-user personal library**, not a multi-tenant service with invitations, account recovery or billing.

### Docker

```sh
docker compose up --build -d
docker compose logs app
```

Open `http://localhost:3210` and use the setup code from the logs. Compose binds only to loopback and keeps SQLite in the `savextension-data` volume. Back up the volume or export your library before removing it.

### Backups and password recovery

Keep JSON exports somewhere private. For a full database backup, stop the server before copying the entire `data/` directory (SQLite may use `-wal` and `-shm` companions while running). Database files and export JSON are not encrypted at rest.

If you forget your password, there is no remote recovery service. Stop the server and run:

```sh
npm run reset-password
```

Confirm the local reset, restart, and use the newly printed setup code. This preserves saves, invalidates web sessions, revokes paired browsers and requires a new library password. It requires access to the local database; protect that directory.

## Develop and test

```sh
npm ci
npm test
npx playwright install chromium
npm run test:e2e
npm run dev
```

Server/domain tests cover URL validation, authentication, request origins, one-time pairing, token scopes/revocation, annotations and multi-account deduplication. DOM fixtures cover X and Instagram extraction. The browser suite exercises setup, saving, notes, search, file imports, backups, mobile layout, and the real extension service worker/options/collector against intercepted fixture pages. It pre-grants origins in an isolated test-only manifest to represent the browser permission dialog and toolbar’s activeTab grant. It **does not** sign into or collect from live social accounts.

```sh
npm run package:extension
```

Produces `dist/extension.zip` and the web app’s download at `public/extension.zip`. Reload the unpacked extension in the extensions page after editing its source.

## Project map

```text
server/       HTTP server, authentication, SQLite store, validation
public/       Web library: plain browser JavaScript and CSS, no build step
extension/    Manifest V3 extension, pairing settings, popup, DOM collectors
scripts/      Extension packaging and local password recovery
tests/        API/domain tests, DOM fixtures, browser integration test
docs/         Security and architecture notes
```

The app’s `/api/*` routes are its **own internal backend**, not Instagram/X APIs. The extension only reads rendered DOM content and sends it to your selected library. It does not call undocumented social endpoints or copy social session cookies.
