# New Chat Context

Start here when editing saveXtension. It's loaded automatically through `CLAUDE.md`, so keep it short.
For how things work and why, read only the section you need in `docs/ARCHITECTURE.md`.
**Anything about AI inside the app (AI search, MiniLM, Claude Code or Codex, image scanning or descriptions, filling a note, Organize): read `docs/AI.md` first.** It holds the user's decisions on this.

## What this is

A local Electron app (Node 24+, SQLite via `node:sqlite`, no framework) that keeps Instagram saves, X bookmarks, Pinterest pins and Chrome bookmarks in one library, with MCP for LLMs. Beside them, documents: the person's own Markdown pages. It uses **no platform APIs**: hidden windows, signed in as you, read the sites' own pages.

Four folders:
- `public/`: the UI
- `server/`: local server and SQLite
- `desktop/`: Electron, hidden windows and the panel
- `extension/`: the scan engine and all site-reading code, used by both the desktop app and real Chrome

## Rules that must hold

- **Removing needs evidence.** Missing from a list is never enough by itself. The post's own page must show "not saved" twice, including after a reload, with the right account. Pinterest uses two full board reads instead.
- **Verify-only checks never click.** The worker and the server both enforce this.
- **Fail closed.** If the account, post or control can't be positively identified, do nothing.
- **MCP shows exactly what the app shows.** Visibility rules are shared. For anything else about MCP, read the MCP section of `docs/ARCHITECTURE.md`, and `MCP_CONNECTION.md` before changing the connection prompt.
- **One job or unsave at a time.** Quiet checks give way to anything a person starts.
- **AI in the app stays within the user's decisions.** Word search and MiniLM are the free default, AI search only runs from its button, cards only, small models, ask before large scans, each image read once, notes filled one post at a time only when asked. See `docs/AI.md`.
- **Never overwrite better data.** See the merge in `importPosts`. Notes and curated topics are the user's.

## Working with this user

- **Testing is manual.** Don't run test suites after a change. End with a short list of what to check by hand. Only run a test to diagnose a specific failure, or before a release if asked.
- **Commit or push only when asked.**
- **Speak plainly.** The user reads results, not diffs, and often changes direction mid-task.
- **Process safety:** never use `pkill`, `killall` or pattern kills, including in subagent briefs. One closed the user's apps. Kill only a verified PID you started.
- Don't touch real AI client configs, and don't quote saved content needlessly.

## Running it

```bash
env -u ELECTRON_RUN_AS_NODE npm run desktop
```

- **Which app:** this runs from source on port 3217. `/Applications/saveXtension.app` is an older build.
- **`public/` changes:** press ⌘R in the app.
- **`server/`, `desktop/`, `extension/` changes:** restart the app, but first check `sync_jobs` and `unsave_requests` have nothing running. Stop the previous run by its background task, and confirm port 3217 is free before starting again.
- **Real data:** `~/Library/Application Support/saveXtension/savextension.sqlite`. Open it `readOnly`.
- **Tests when needed:** `npm test`, `npm run test:desktop`, `npm run test:e2e`.
- **Shell notes:** in zsh an unquoted `$VAR` doesn't split into words, and there's no `timeout`, so use `perl -e 'alarm N; exec @ARGV' cmd`. Empty output with exit 0 may mean nothing ran.

## Loading context cheaply

- Find code by the anchors below with grep. Line numbers drift, so they aren't listed.
- Don't read `public/app.js` (over 2,000 lines) or `public/styles.css` whole. Read around the anchor.
- Many lines are very long. Pipe through `cut -c1-300` when exploring.
- In `styles.css`, later rules often override earlier ones, so check the whole file for a selector before editing it.

## Where things are

`tests/context-doc.test.mjs` checks every row below still exists, so update this table when renaming.

### Reading the sites

| Task | File | Anchor |
|---|---|---|
| X post fields, video and quote logic | `extension/extractors.js` | `function xPosts` |
| Instagram grid | `extension/extractors.js` | `function instagramPosts` |
| Pinterest pins | `extension/extractors.js` | `function pinterestPosts` |
| A single post's page | `extension/extractors.js` | `function detail` |
| Is this a saved list, and whose | `extension/extractors.js` | `function pageInfo` |
| Spotting a layout change | `extension/extractors.js` | `function diagnose` |
| Scrolling and when to stop | `extension/collector.js` | `QUICK_KNOWN_BOUNDARY` |
| Saved state on a post (X, Instagram) | `extension/unsave-dom.js` | `globalThis.SaveXUnsave=` |
| Pinterest board check and unsave request | `extension/unsave-dom.js` | `globalThis.SaveXPinterest=` |

### Scan engine

| Task | File | Anchor |
|---|---|---|
| Claiming jobs | `extension/background.js` | `function checkJobs` |
| Turning a job into accounts and lists | `extension/background.js` | `function preparePlan` |
| Opening a list | `extension/background.js` | `function startSource` |
| Details visits | `extension/background.js` | `function enrich` |
| X deep scan missing-post check | `extension/background.js` | `function verifyMissing` |
| Performing an unsave | `extension/unsave-worker.js` | `function performUnsave` |
| Performing a Pinterest unsave | `extension/unsave-worker.js` | `function performPinterestUnsave` |
| The fake `chrome.*` API | `desktop/social-worker.mjs` | `function storage` |

### Desktop

| Task | File | Anchor |
|---|---|---|
| Startup and quiet check rules | `desktop/main.mjs` | `function quietCheck` |
| Launch scan | `desktop/main.mjs` | `function autoQuickSync` |
| Routing clicked links, window setup | `desktop/main.mjs` | `function createWindow` |
| Library menu | `desktop/main.mjs` | `function installMenu` |
| Hidden windows | `desktop/social.mjs` | `function makeWindow` |
| Checking the signed-in account | `desktop/social.mjs` | `function verify` |
| Connecting an account | `desktop/social.mjs` | `function connect` |
| Post panel | `desktop/social.mjs` | `function openPost` |
| Keeping the panel's page running | `desktop/social.mjs` | `function warmView` |
| Moving to the next post in that page | `desktop/social.mjs` | `function moveWarmView` |
| Saved check on opening a post | `desktop/social.mjs` | `function checkStillSaved` |
| Label correction on opening | `desktop/social.mjs` | `function correctLabel` |
| Hidden visit for recovery | `desktop/social.mjs` | `function recoverPost` |
| Spotting saves and unsaves in the panel | `desktop/runtime.mjs` | `function panelRequestKind` |
| Which account opens a post | `desktop/runtime.mjs` | `function panelAccount` |
| Reading Chrome's bookmark file | `desktop/chrome-bookmarks.mjs` | `function readChromeBookmarks` |

### Server

| Task | File | Anchor |
|---|---|---|
| All HTTP routes | `server/app.mjs` | `export function createApp` |
| Merging saves | `server/store.mjs` | `importPosts(inputs)` |
| Removing a save | `server/store.mjs` | `confirmSourceUnsave(id, account)` |
| A pin leaving a board | `server/store.mjs` | `pinLeftBoard(id` |
| Post identity | `server/domain.mjs` | `function canonicalPost` |
| Validating incoming posts | `server/domain.mjs` | `function cleanPost` |
| Allowed image hosts | `server/domain.mjs` | `function imageUrl` |
| Instagram caption cleanup | `server/domain.mjs` | `function instagramCaption` |
| Queueing a scan | `server/sync.mjs` | `enqueue(targets` |
| Hiding quiet checks from the UI | `server/sync.mjs` | `presented()` |
| Quiet checks giving way | `server/sync.mjs` | `giveWay()` |
| Unsave queue | `server/unsave.mjs` | `expectUnsaved(` |
| Site order for Instagram and Pinterest | `server/store.mjs` | `listOrder()` |
| Showing posts in site order | `public/source-order.js` | `function orderLibraryPosts` |
| All posts and All pins check | `server/list-changes.mjs` | `function savedListGate` |
| Resuming unfinished lists | `server/list-changes.mjs` | `function knownForScan` |
| Finding posts missing from a list | `server/list-changes.mjs` | `function missingFromList` |
| Pinterest board comparison | `server/list-changes.mjs` | `function pinterestBoardChanges` |
| Check timers | `server/background-checks.mjs` | `function backgroundChecks` |
| Saving cover images | `server/saved-images.mjs` | `function savedImages` |
| Spotting GIF pins | `server/pinterest-gifs.mjs` | `export function pinterestGifs` |
| Background recovery | `server/image-recovery.mjs` | `function imageRecovery` |
| Search by meaning: pinned download | `server/meaning-search.mjs` | `export function meaningSearch` |
| Search with a detected AI tool | `server/ai-search.mjs` | `export function aiSearch` |
| AI services reached with an API key | `server/ai-search.mjs` | `async function askApi` |
| Keeping API keys encrypted | `server/ai-keys.mjs` | `export function aiKeys` |
| Filling a note through an API key | `server/note-api.mjs` | `export async function noteConversation` |
| Organize button: planning and applying | `server/ai-organize.mjs` | `export function aiOrganize` |
| Checking unsure posts' images, saving descriptions | `server/ai-search.mjs` | `current.readImages` |
| Asking before a large image scan | `public/app.js` | `function askToScanImages` |
| Filling a note with AI: the job | `server/note-ai.mjs` | `export function noteAi` |
| The tools it gets for that one post | `server/mcp.mjs` | `function noteServer` |
| Its prompt and tool arguments | `server/ai-search.mjs` | `export function noteArguments` |
| Its button and box | `public/app.js` | `function noteFoot` |
| MCP tools and server instructions | `server/mcp.mjs` | `function createLibraryMcp` |
| MCP reads and visibility | `server/mcp.mjs` | `function mcpLibrary` |
| MCP image tool | `server/mcp.mjs` | `register('get_save_images'` |
| MCP deep read of one post | `server/mcp.mjs` | `register('view_save'` |
| MCP clearing image descriptions | `server/mcp.mjs` | `register('clear_image_descriptions'` |
| Reading that post in a hidden window | `desktop/social.mjs` | `function viewPost` |
| MCP capturing a view's video frames | `server/mcp.mjs` | `register('capture_view_frames'` |
| MCP reading those frames | `server/mcp.mjs` | `register('read_view_frames'` |
| MCP endpoint and access checks | `server/app.mjs` | `path === '/mcp'` |
| Copied connection prompt | `public/mcp-settings.js` | `function connectionPrompt` |
| What's hidden from app and MCP | `server/instagram-save-lists.mjs` | `function hiddenInstagramSaveIds` |
| Documents: storage, AI edits, pictures | `server/documents.mjs` | `export class Documents` |
| MCP document tools | `server/mcp.mjs` | `register('edit_document'` |
| Fonts for documents: download and storage | `server/documents.mjs` | `export function documentFonts` |

### UI

| Task | File | Anchor |
|---|---|---|
| Card image, caption, play icon | `public/app.js` | `function embedMetadata` |
| Card layout and actions | `public/app.js` | `class="card-layout"` |
| Note preview on a card | `public/app.js` | `function syncNotePreview` |
| Note saving on a card | `public/app.js` | `function syncCardNote` |
| Centered post and note view | `public/app.js` | `function showNoteView` |
| Panel contents | `public/app.js` | `function showPost` |
| Note beside the post, following the page | `public/app.js` | `function postMoved` |
| Panel slide and resize | `public/app.js` | `function slidePost` |
| Search bar centring on ⌘F | `public/app.js` | `function moveSearch` |
| Search by meaning: model and scoring | `public/meaning-worker.js` | `async function search` |
| Search by meaning: page side | `public/meaning-search.js` | `export function createMeaningSearch` |
| AI search settings, one on at a time | `public/app.js` | `function mountAiSearchSettings` |
| Organize dialog | `public/organize.js` | `export function organizeTopics` |
| Running that AI search on Enter | `public/app.js` | `async function startAiSearch` |
| Sync controls | `public/app.js` | `function renderSync` |
| Finished-scan cards | `public/app.js` | `function syncReportCards` |
| Scanning pill | `public/app.js` | `function renderSyncToast` |
| Unsave queue | `public/app.js` | `function nextUnsave` |
| Dot loaders, one per kind of work | `public/dot-loader.js` | `export function dotLoader` |
| Settings panels | `public/app.js` | `function settingsPanel` |
| What a finished scan reports | `public/sync-report.js` | `function syncReport` |
| Grid layout | `public/masonry.js` | `function layoutCards` |
| Note and size animation | `public/motion.js` | `function setNoteVisibility` |
| "Busy" messages | `public/busy-messages.js` | `BUSY` |
| Panel styles | `public/styles.css` | `#post-panel` |
| Glass notification styles | `public/styles.css` | `.sync-platform-card` |
| Note styles | `public/styles.css` | `.card-note` |
| Documents notch, drawer and editor window | `public/documents.js` | `export function mountDocuments` |
| Plain Markdown in, editor Markdown out | `public/document-markdown.js` | `export function storedMarkdown` |
| Font names drawn in their own font | `public/document-fonts.js` | `export function fontDecorations` |
| Bundling the editor | `scripts/build-editor.mjs` | `public/vendor/editor` |

## Open items (as of 2026-11-06)

**Built but not yet proven on the real sites:**
- Instagram save and unsave request names. X saves and unsaves, and Pinterest saves (`RepinResource/create`), are confirmed.
- X's quoted post detection
- Recent-unsave detection during scans, and Instagram's deep scan check
- Instagram's All posts check, which assumes every new save appears at the top of All posts
- Pinterest's All pins check, which assumes the same, and that the page's order matches what the grid shows
- AI open items are in `docs/AI.md`, including filling a note on real posts.
- `view_save` and `capture_view_frames` are proven on Instagram, X and Pinterest, including a 28-minute X video. Not yet tried above 8 a second. Carousels are proven with all-video posts on Instagram and X, not yet with images and videos mixed. A quoted post's video is proven on an X post that also has its own video, not yet on a post whose only video is the quoted one.

**Cleanup:**
- `SAVEX_DEBUG_POST_PANEL` in `desktop/social.mjs` is a temporary request log and open-time measure. Remove it once those requests and timings are confirmed.
- The browser suite passed in full on 2026-11-14 for v1.5.2, apart from one flaky run of `search.spec.mjs` "search, layout controls and Filters stick together", which passed alone three times. Run the full suite before a release, and keep the Mac awake while it runs: sleep turns most tests into timeouts.
- Live card embed code is dormant, and the user will decide on removal after using the panel for a while.

**Documents, built 2026-11-14, not yet in:** search, AI seeing their pictures, adding from the notes AI or a post, restoring from a backup.

**Offered, not built:**
- A Chrome bookmark delete button (extension only), and noticing bookmarks deleted in Chrome
- Filter pill bug: measure in `fitFilterChips` after the toolbar is shown

## Keeping this current

When a change alters behaviour or a rule, update this file and the matching section of `docs/ARCHITECTURE.md`, or `docs/AI.md` for AI in the app, in the same step. Remove finished open items. Keep this file short: details belong in the architecture doc.
