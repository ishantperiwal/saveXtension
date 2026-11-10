# Architecture

How saveXtension works, in one place. Last reviewed against the code on 2026-11-06.
For a fast way into the code, see [NEW_CHAT_CONTEXT.md](NEW_CHAT_CONTEXT.md). For security boundaries, see [SECURITY.md](SECURITY.md).

## In one paragraph

saveXtension is a local desktop library of your Instagram saves, X bookmarks, Pinterest pins and Chrome bookmarks, also available to LLMs over MCP. It uses no platform APIs. You sign in inside the app, and hidden windows read your saved lists the way your own browser would, storing a copy on your computer. Everything else (search, topics, notes, MCP) works from that local copy, so it keeps working when a site changes or goes down.

## The API-less approach

Official access to saved content is paid, restricted or needs developer approval, depending on the platform. So the app reads the same pages a signed-in person sees. Four rules shape everything else:

1. **Read what a person can see.** Your own session, your own lists, at a human-like pace. No developer keys are used, and scans only read pages. The one exception is Pinterest's Unsave button, which sends the request Pinterest's own page sends, one pin at a time when you click it.
2. **The local copy is the product.** Saves, notes, topics and cover images live in SQLite and plain files. A broken scan stops new saves arriving, but it can't touch what's stored.
3. **Adding is easy, removing is hard.** Anything may be added on sight. Missing from a list is only ever a reason to look closer.
4. **Fail closed and say so.** If the app can't positively identify the account, the post or the control, it does nothing and reports it.

## System map

```
Electron main process  (desktop/main.mjs)
├─ Local server + SQLite  (server/*)  loopback :3217, also serves MCP at /mcp
│    ▲ HTTP from the window              ▲ in-process transport from the scan engine
├─ Library window  (public/*)  the web UI, in a sandboxed renderer
│    └─ Post panel  a WebContentsView laid over the window, showing the real post page
├─ Scan engine  worker thread running extension/background.js with a chrome.* shim
│    │           (desktop/social-worker.mjs)
│    └─ drives ▼ by RPC
└─ Hidden windows  (desktop/social.mjs)  sandboxed, muted, one session per account
     └─ run extension/extractors.js, collector.js and unsave-dom.js inside the site's page

Optional: the same extension/ code in real Chrome, for handing over a sign-in, or for browser mode.
```

**Why the scan engine lives in `extension/`:** the code began as a Chrome extension and runs unchanged in both places. The desktop app gives it a fake `chrome.*` API, where "tabs" are hidden windows. A change to `extension/` affects both.

## How a scan works

1. **Trigger.** Something posts to `/api/sync`, creating a `sync_jobs` row. Only one job or unsave runs at a time.
2. **Claim and plan.** The engine claims the job (`checkJobs`), then `preparePlan` expands it into accounts and lists.
3. **Open a list** (`startSource`). A hidden window loads the site and the app checks the signed-in account matches (`verify`). If it doesn't match, the scan stops. It discovers lists from Instagram's saved page or Pinterest's boards page, then opens the list.
4. **Read and scroll** (`collector.js`). It reads posts on screen, sends batches the server must acknowledge, then scrolls. It stops when:
   - **Quick scan:** it has seen 7 known posts in a row, so anything newer has been read.
   - **Any scan:** 5 scrolls bring nothing new. If it's at the bottom with nothing loading, the list ended. If not, the run is `partial`.
   - **Limits:** quick 500 posts or 10 minutes, deep 100,000 posts or 2 hours.
   - **Unfinished lists:** until a list's scan completes, what counts as known stays what was known when the unfinished scan began (`knownForScan`). Otherwise posts from a cut-short scan would look known and the next scan would stop at them, never reading the rest.
5. **Store.** `importPosts` merges by platform and post ID. A re-read never overwrites something better: the longer caption wins, an empty field keeps the old value, and a guessed type never replaces one read from the post (`kindSure`). User notes and topics are never overwritten.
6. **Fill in details** (`enrich`). Whole-account runs may open up to 25 post pages for missing details. Three failures in a row stop it.
7. **Finish.** The run is recorded, the list is compared for unsaves (below), and the next list starts.

**Instagram reads All posts first.** Every save appears in All posts, so a quick scan reads only that list (`savedListGate`). The collections are read only if something changed: a new post, a change in order, an unfinished earlier pass, or a read it can't trust. So a scan with nothing new costs one list instead of one per ticked collection. Saves outside your ticked collections are stored for this comparison, but stay hidden from the app and MCP. A collection refresh and a Deep scan always read the collections. Adding an already-saved post to a collection doesn't change All posts, so that waits for a Deep scan.

**Pinterest reads All pins first too,** with the same check, and it replaces reading the ticked boards when nothing changed. Pins outside your ticked boards are stored for the comparison and stay hidden. One addition: only a board read can confirm a pin left a board, so a pin gone from All pins, or one waiting for its second board read, also means reading the boards. A pin moved between boards doesn't change All pins, so that waits for a Deep scan or a board refresh.

Scans run with background throttling off, because hidden pages otherwise stop rendering. A sign-in page or a rate-limit message stops the scan immediately.

## What starts a scan

| Trigger | Scope | Visible? |
|---|---|---|
| App opens | Last scan you chose (`autoQuickSync`) | Yes |
| You click Sync or Deep scan | What you chose | Yes |
| Every 30–35 minutes while open, unless the computer has been idle 5+ minutes | Last scan you chose, without Instagram | Quiet |
| You return to the app, 10+ minutes since the last check | Last scan you chose, without Instagram | Quiet |
| A save is spotted in the panel | That platform, about 1.5 seconds later | Quiet |
| A Pinterest post closes in the panel | Pinterest | Quiet |

**Quiet checks** (`server/background-checks.mjs`, `quietCheck`) are jobs with `quiet=1`. `sync.presented()` hides them from the library unless they found new saves, and then shows only those. Anything you start cancels a running quiet check (`giveWay`). They pause for two hours after a sign-in or rate-limit message. Instagram is left out of timed checks because it's the least tolerant of automated visits, so it's read only at launch, on request, or after a save in the panel. Turn them off with **Library → Check for new saves in the background**. Deep scans are never automatic.

## Cover images and labels

Instagram links expire within days, so one cover image per save is copied to `images/` (`server/saved-images.mjs`, 3 at a time). Cards use the local copy.

`server/image-recovery.mjs` is the lowest-priority work in the app. It runs outside the job queue, visits one post about every 30–45 seconds, gives way to everything else, and pauses when the computer has been idle for 5 minutes. It's always on: the user had its switch removed from Settings. The `image_recovery` setting and `/api/image-recovery` route remain, so it can be brought back.
- It gets a fresh link for images that failed to download.
- It makes one visit to each Instagram post labelled "image", because the grid can only guess that label.

Opening a post in the panel also corrects its label, with no extra visit (`correctLabel`).

Pins keep their title only, on the user's decision: the link's label, never the image's alt text, which can hold the whole description. A pin with no title has no text. For pins, unlike the rest of the library, a new title replaces longer old text, so descriptions kept by older scans go away when the pin is next read.

A saved pin only gives a still preview, so a GIF looks like an image. `server/pinterest-gifs.mjs` asks once per pin labelled as an image whether a `.gif` original exists under the preview's ID, on Pinterest's public image host, with no sign-in and no visit to the pin. If it does, the pin is labelled `video`, which later scans keep. Anything but a clear answer is asked again the next round, about a minute later. This rests on Pinterest keeping originals at that address. It was right on the 5 pins it was tried on.

## Unsaves

The rule: **a post leaves only after evidence from the site itself.** Evidence means its own page shows "not saved" twice, including after a reload, with the right account (X and Instagram), or its board no longer contains it (Pinterest, which has no single saved state per pin).

| How it's noticed | X | Instagram | Pinterest | Chrome |
|---|---|---|---|---|
| Card's Unsave button | Clicks, then verifies | Clicks, then verifies | Sends Pinterest's unsave request, then rereads the board | No button |
| Unsaved in the panel | Request spotted (confirmed) | Request spotted (names unconfirmed) | Request starts a board read | n/a |
| Post opened in the panel | Save button read | Save button read (not on `/reel/` pages) | Not read | n/a |
| Quick scan | Position compared | Position compared, plus collections read to the end | Boards read to the end, twice | Not removed |
| Deep scan | Up to 25 missing per account | Collections read to the end, up to 25 | Boards read to the end, twice | Not removed |

- **Showing the site's order:** scans add posts as they read them, newest first, so the time a post was added can't give the site's order. Instead the same `list-order:*` memory places each post (`listOrder` in `server/store.mjs`, `orderLibraryPosts` in `public/source-order.js`). One Instagram account follows All posts, one collection or board follows its own list, and X keeps its own positions. While a scan runs, `listReadSoFar` keeps what it has read in a `list-reading:*` setting, so posts appear in order as they arrive. A finished scan replaces it with the full read, and a stopped scan's read is kept on top of what was remembered. A post in no list yet goes below the placed ones, in the order it was added, until a deep scan reads that far. One Pinterest account follows All pins. Pins are read in the page's own order, which hasn't been compared with what the grid shows on screen.
- **Position compare** (`missingFromList`): each list remembers its order in a `list-order:*` setting. A remembered post inside the stretch a scan just read, but not seen, becomes a candidate. Up to 5 are checked per quick scan, each gets at most one check a day, and posts the app isn't showing are skipped. On Instagram a quick scan usually reads only All posts, so this comparison happens there.
- **Unsave queue:** confirming the card's Unsave puts it in a line held by the library window (`nextUnsave`), with a yellow "Queued to unsave" overlay and ✕ on the card. They run one at a time, wait out any scan, and closing or reloading the app forgets the line.
- **Checks that can't click:** candidates and panel unsaves become `verify_only` unsave requests. The server refuses a click for these.
- **What removal means:** the account's link to the post goes. The post goes when no account is left. If it was unsaved outside the card's button and has your note or organized topics, it moves to Archive instead.
- **Pinterest safeguards** (`pinterestBoardChanges`): two full reads at least a minute apart, ignored if more than 30% of a board (or more than 2 pins on a small board) goes missing at once.
- **Mistakes mostly heal themselves:** a wrongly removed post that's still saved returns at the next scan that reads it.

Chrome bookmarks are read-only. Deleted bookmarks stay in the library, and the app never writes to Chrome.

## Post panel and note view

Instagram reels open at their real `/reel/` link in the panel, even though you can swipe to the next reel there. `/p/` stops the swipe but brings the comments in beside the video, and the content-only view was preferred, so this was tried and undone on 2026-11-06.

A reel's first open is slow because of Instagram's own page, not the video or this app. One timing on 2026-11-06: 3.1s for the page to appear and 3.4s for the video, against 1.3s and 1.4s for a Pinterest pin. Instagram photo posts weren't timed. Starting the load when the pointer rests on a card was offered and declined, to avoid the extra visits.

In one-column view, every card is the same width so edges and notes line up. A tall picture on any social post sits centred on a tinted fill, and long Instagram and Pinterest names are cut to one line. A layout with the caption beside the picture was tried and undone on 2026-11-06, because stacking them was easier to read. X cards show up to 14 lines and keep their hashtags, because the words are the point of a tweet. Instagram and Pinterest cards stop at 5 lines and leave out the block of hashtags ending a caption. This and the cut caption change the display only: the saved text, search, MCP and the opened post keep the whole caption.

Saved Chrome bookmarks open here too (`savedBookmark` in `desktop/main.mjs`), in their own `persist:savex-chrome-viewer` session, so no website shares a session with your accounts. Links inside a bookmark's page stay in the panel, its requests aren't watched, and the page closes with the panel instead of staying warm. Any other link in the library opens in your browser.

Clicking a post's image or arrow calls `window.open`, which `setWindowOpenHandler` routes to `social.openPost`. It lays a `WebContentsView` over `.post-panel-view`, signed in as the account that saved the post (`panelAccount`). A page can't be drawn on top of it, so the page waits off-screen only until it can start drawing (`dom-ready`), while the library's loader shows beneath. The view follows the panel's position by IPC (`placePost`). A native view can't fade, so closing swaps in a picture of it first (`freezePost`). The note view slides up and fades in, and slides down and fades out.

Starting a whole site for every post is slow, so closing the panel keeps its page running out of sight for 5 minutes, one per signed-in session, paused and muted (`warmView`). The next post moves within it the way the site's own links do, and a site that doesn't respond gets a normal load (`moveWarmView`).

While open, `onBeforeRequest` watches that view's POST requests on API paths to spot saves and unsaves (`panelRequestKind`). Pinterest shows a pin's real saved state only when reached from its board, but opening pins through the board proved slow and didn't find the pin, so the panel opens the plain pin link. Widths are remembered per layout. Instagram `/p/` pages open narrow so tall video fits, while `/reel/` pages and other sites open wide.

The side panel's post always has its note as a separate yellow box, outside the panel on its left and vertically centred, so you can write while watching. It grows with its text from a minimum height, and there's no switch for it (the user's decision, after a tall column inside the panel was tried and dropped). It's outside the panel so the panel stays as it was and the native view can never cover it, so the panel can't be resized into the room it needs. Swiping to another reel moves the page under the panel, so the page reports its address (`savex-post-moved`) and the note follows that post, or says it has no note if it isn't saved (`postMoved`), because a note must never sit beside the wrong post. Chrome bookmarks keep their note, since links inside them can go anywhere.

In the grid, clicking anywhere on a note long enough to show **Read more** opens the same view centered, with the note editable on the right (`showNoteView`). In the one-column view it grows in place instead (`setNoteExpanded`), up to a height where it scrolls, with **Show less** to shrink it. Short notes edit in place on the card.

## Data

Stored in `~/Library/Application Support/saveXtension` on Mac: `savextension.sqlite`, `images/`, `browser-helper/`. Site sign-ins live in Electron session partitions named `persist:savex-social-<id>`.

| Table | Holds |
|---|---|
| `posts` | One row per save: platform, external ID, URL, text, media, kind, accounts, notes, archived |
| `post_images` | Saved cover copy and recovery attempts |
| `instagram_collections`, `instagram_collection_posts` | Instagram collections and Pinterest boards, and which posts are in them |
| `topics`, `topic_aliases`, `post_topics` | Topics |
| `sync_jobs`, `sync_runs`, `sync_discoveries` | Job queue, per-list history, posts seen per run and their position |
| `unsave_requests` | Unsave and verify-only jobs |
| `mcp_changes` | Undo history for MCP edits |
| `settings` | Key-value, including `list-order:*`, `list-reading:*`, `list-unfinished:*`, `instagram-collections-pending:*`, `pin-missing:*`, `unsave-attempt:*`, `kind-checked:*` |

Backups are manual: **Settings & backups → Export library** (JSON, no images), or copying the data folder.

## MCP

LLMs reach the library through an MCP server inside the app (`server/mcp.mjs`), using Streamable HTTP at `/mcp` on the same loopback port as the library (3217 on desktop).

**Connection and access**
- It's off by default. **Settings → MCP** turns it on (`mcp_enabled`), and every tool call rechecks that, so turning it off takes effect immediately.
- It accepts loopback connections and the library's own origins only, with no password or token. It's unavailable in hosted mode.
- Each request gets a fresh server from `createMcpHandler`, so there's no session state to go stale. Restarting the app drops clients until they reconnect.

**Connecting an AI app**
- **Copy connection prompt** generates instructions for the AI app's own agent to configure itself (`connectionPrompt` in `public/mcp-settings.js`).
- The prompt is client-neutral and uses proof gates: find the client's real schema, make a minimal edit, validate it, confirm the tools registered, then call `library_overview` from inside that client.
- `MCP_CONNECTION.md` is the checklist behind this. Read it before changing the prompt. Never edit a real AI client's config while developing.

**What it offers**
- **Read:** `library_overview`, `search_saves` (compact summaries, cursor pagination), `get_saves` (up to 20, full metadata), `get_save_by_url`, `get_save_images`, `view_save`, `capture_view_frames`, `read_view_frames`, `list_topics`, `list_changes`.
- **Write (local only):** `create_topic`, `update_topic`, `delete_topic` (empty topics only), `merge_topics`, `set_save_topics` (up to 200 at once, all or nothing), `update_save_note` (needs the post's current `updatedAt`), `clear_image_descriptions` (chosen saves or all of them, only ones MCP can see), `undo_change`.
- **Private address:** while a note is being filled in the app, `/mcp/note/<random>` offers a few read tools tied to that one post. It's separate from all of the above, and `docs/AI.md` has the details.
- **Also:** `savextension://guide`, `savextension://library`, `savextension://saves/{id}` and the `organize_library` prompt. The server's `instructions` string tells models how to use it all.

**Decisions to keep**
- **Topics exist on their own:** unticking a collection or board hides its saves but keeps their topics, so a topic can show 0 and fills back up when ticked again. The app lists every topic that exists. MCP lists them too, except one whose saves are all hidden from it, so it can't learn names from hidden saves (`topicCatalog`).
- **Same saves as the app:** archived saves and anything outside ticked collections and boards are invisible to every tool, with no override (`mcpLibrary`, `hiddenInstagramSaveIds`).
- **Reads stay small:** the library is never sent whole. Search returns summaries, and models fetch the full save or image only when needed, so a large library can be worked through in several contexts.
- **Tool schemas stay small:** generated regexes are stripped from advertised schemas (`.meta({ pattern: undefined })`), while the server still enforces them.
- **Results carry both forms:** text and `structuredContent`, for clients that read either one.
- **`get_save_images` is the exception:** it returns content only, because clients that prefer `structuredContent` would drop the images. Up to 8 saves and 6 MB per call, in JPEG, PNG, WebP or GIF, with a text block naming each image. Anything over budget says to request it separately.
- **`view_save` is how LLMs deep-read one post:** it opens the post in a hidden window signed in as an account that saved it (`viewPost`), so there's no login wall and no need for the LLM to use your browser. It returns screenshots, carousel slides, video frames and page text, with a 55-second limit for reading the page. It takes a save's ID, not a web address, so it can't go elsewhere. Speech in videos isn't available. How it reads each site, all learned on real posts:
  - **Instagram reels** open at `/p/`, not `/reel/`. `/reel/` is an endless feed of other people's reels with the comments hidden, while `/p/` shows this one post with its full caption and comments.
  - **Slides:** it presses the post's Next button and checks that the pictures on screen moved. X's button does nothing in a hidden window, so it then moves the slide strip directly. If neither moves anything, it stops.
  - **Video frames:** `view_save` reads the page, reports the video's length and leaves the hidden window open. The model then calls `capture_view_frames` with a `framesPerSecond` chosen from that length, with no new visit. If it doesn't within a minute, the window closes by itself. The tool's description steers it to 1 or 2 for captions, up to 8 for fast motion, below 1 for long videos, and above 8 only if you explicitly ask, up to 24. These are guidance, not a cap. Each frame is cropped to the video's picture at the screen's full resolution, not a shot of the whole page, because small text on a video was unreadable when the video took up a third of the page's width. If the video can't be placed, that frame is the whole page instead, and `framesOfWholePage` counts them. Each response reports what was captured, how long it took, the video's real size (`videoResolution`) and the frame's (`frameResolution`). The player isn't enlarged, so a large video still loses detail: tried at 1080x1920 giving 676x1202 on Instagram and 2560x1440 giving 1134x638 on X, while a 608x832 Pinterest video gave 922x1260. Enlarging it was held back, because it changes the page's layout and could break jumping. Identical frames are dropped, so `captured` can be lower than `expected`. Capture stops if a jump doesn't land, at 5 minutes, or at 1 GB of images, and says why. On Pinterest, jumps pause the video first, because a video left playing can loop mid-jump and look stuck. Instagram stays playing, because pausing puts a large play icon over its frames. X jumps the same way as the other sites, which replaced an older approach of letting its video play in real time. After reading comments, the page returns to where it was rather than the top, because a reply's parent post sits above it with its own video. If the same video isn't back on screen, no frames are captured. A video is recognised by its poster where it has one, because X can rebuild a video with a new address after scrolling.
  - **Carousels:** each video in a slide strip is treated as its own video, with its own length, rate and frames numbered from 1. `view_save` walks the slides and lists them, then tells the model to ask you whether you want one, and which, or all, unless you already said. The page waits 5 minutes for that answer instead of 1, and `capture_view_frames` and `read_view_frames` refuse to guess when no `video` is given. Videos are told apart by how far along the strip they sit, because Instagram rebuilds a video with a new address when it comes back. Captures run one after another, each moving the strip directly, or with the post's own buttons if that didn't work. A video that can't be brought fully on screen isn't captured, and the response says so. The window closes when every video is done, or after the wait if none is started. The walk stops at 20 slides or the time limit, and the note says if slides were left.
  - **A quoted post's pictures and slides (X):** read only on demand, with `quotedSlides` on `view_save` or the note AI's `view_post`, after the post's own slides. It keeps half of the 12 screenshots for them, scrolls to plain pictures (up to 4), moves along a carousel, and says if any were left out. It moves the whole strip even past the screenshot limit, because a video further along may not exist on the page until it's been near the screen, so all of them get listed. Without it, the reply says the quoted post has a carousel or pictures (`quotedCarousel`, `quotedImages`) so the model can ask, which is another visit. Image carousels are proven on a real post. Plain quoted pictures and quoted video carousels aren't yet.
  - **Quoted posts (X):** on X only the saved post's own box counts, so a parent's, a reply's or a recommended post's video is never treated as this post's. A video in a post it quotes counts as one of this post's videos. It's listed after the post's own, marked `fromQuotedPost` only to show where it sits, and found without clicking and without a new visit, by scrolling to it to read its length. A post with its own video and a quoted one therefore follows the carousel rule: the model asks one or all, and capture refuses to guess. If the quoted video is the only one, it's captured like any single video.
  - **Pinterest:** the recommended pins under a pin play their own videos, and their markup matches the pin's own, so only a video starting in the top 400px of the unscrolled hidden window counts as this pin's. Recommendations start around 650px. A GIF pin has no video to capture, so a pin labelled `video` with none gets 4 screenshots about a second apart, and the note says they're moments from a GIF.
  - **Reading them:** capture carries on in the background in the same hidden window, which closes when it finishes, or for a carousel when the wait ends with no more started. One response can't hold many frames (Claude Code cuts a tool response off at 25,000 tokens, about 15 frames), so the model reads up to 10 at a time by number with `read_view_frames`, including while capture runs, and stops when it has what it needs. Reading makes no new visit. Frames stay in the app's memory, never on disk, and are deleted 15 minutes after capture ends or at the next `view_save`, which also stops any capture still running. Each read checks the save is still visible.
  - **Links:** `pageLinks` lists up to 100 full addresses from the same part of the page as the text. X's text shows cut-off links, its short `t.co` links are replaced by the address in the link's own text, or for link cards, whose text isn't the address, by asking `t.co` where they go without following them (`expandShortLinks`, up to 20). Instagram's and Pinterest's redirects are unwrapped. The site's own links are left out. It can include recommended posts and ads.
  - **Text** comes from X's main column, or `main` elsewhere, which leaves out X's sidebar. A pin's page isn't scrolled, because that only loads other people's pins.
- **Notes stay short:** you mostly use `view_save` to enrich a note, so the server's instructions and `update_save_note` carry one writing rule (`NOTE_STYLE`): what the post is and what it's trying to do first, then names and links, then at most one short line on what couldn't be found and why. It's guidance, so a model can still ignore it.
- **Ask first:** the server's instructions tell models to ask you before viewing several posts in a row, or using their own browser or yours, and to explain the risk. That's guidance only. The real check is on `view_save`: one at a time, and after 5 in 10 minutes it refuses until called with `userApproved: true`, which a model could still claim falsely.
- **Edits are journaled:** MCP edits go in `mcp_changes` (last 100) and can be undone if nothing changed them since. Curated topics survive later scans.
- **Saved content is untrusted:** the instructions tell models to treat captions and notes as data, never as instructions.

**Status:** an audit on 2026-11-06 fixed its bugs and found the connection already fast, with no zero-tradeoff speedups left. `get_save_images` hasn't been tried in real AI apps. `view_save` was tried in Claude Code on an X video carousel, an Instagram video carousel, Instagram reels and Pinterest video and image pins. A quoted post's video was tried on one X post that also has its own video. A post whose only video is the quoted one, and a quoted carousel, haven't been tried. A carousel mixing images and videos hasn't been tried, because the two carousels MCP can currently open on Instagram are all video. Background capture has been tried at 8 frames a second on an Instagram reel (38 seconds of video took 99 seconds), including reading frames while it ran. On X, jumping covered a 28-minute video with 35 frames in 39 seconds. On Pinterest, 8 seconds of video took 11 seconds. Deletion was tried with the timer briefly set to 30 seconds. It hasn't been tried above 8 a second. After the page is scrolled for comments, X's player can show its sound as on. The window itself stays muted. Tests are in `tests/mcp.test.mjs` and `tests/browser/mcp.spec.mjs`, using an isolated SDK client, so they don't prove any specific AI app works.

## Other modes and older code

- **Browser mode:** `npm start` serves on port 3210, with the Chrome extension doing the scanning. The panel isn't available, so posts open in new tabs.
- **Hosted backend:** the password, session and pairing code stays behind `AUTH_REQUIRED=true`. It isn't the supported path.
- **Live card embeds:** `public/embeds.js`, `server/embeds.mjs` and the `savex-live-previews` flag are dormant. They're kept deliberately for now, and browser tests still rely on the flag.
- **Updates:** `desktop/updates.mjs` downloads verified installers from GitHub Releases. Builds aren't notarized.

## How it depends on each site

Ordered from most to least durable. Ratings are judgment, not measurement.

| Dependency | Used for | Where | Durability | If it changes |
|---|---|---|---|---|
| Post links: `/status/<id>`, `/p/<code>`, `/pin/<id>` | Identity, finding posts | `domain.mjs`, `extractors.js` | Very high | Scans stop finding posts, and it's reported |
| Chrome's `Bookmarks` JSON file | Chrome source | `chrome-bookmarks.mjs` | High | Read fails and is reported, with Chrome's own copy as fallback |
| List URLs: `/i/bookmarks`, `/<handle>/saved/`, `/<handle>/_boards/` | Opening lists | `background.js` | High | Scan fails with an error |
| X `data-testid`: `tweet`, `tweetText`, `tweetPhoto`, `User-Name` | Reading posts | `extractors.js` | Medium-high | `diagnose` reports a layout change |
| X `bookmark`, `removeBookmark` buttons | Saved state | `extractors.js` | Medium-high | Post stays |
| Pinterest `data-test-id`: `pin`, `board-feed` | Reading pins | `extractors.js` | Medium | `diagnose` reports a layout change |
| Account checks: X profile link, Instagram navigation, Pinterest `__PWS_DATA__` | Right account | `social.mjs` | Medium | Scan refuses to run |
| X quoted post block (`div[role="link"]` with its own author) | Video label | `extractors.js` | Medium, unconfirmed | Wrong play icon only |
| Instagram English labels: Save, Saved, Like, Comment | Saved state | `unsave-dom.js` | Low-medium | Post stays; card button refuses to click |
| Save and unsave request names | Instant panel reaction | `runtime.mjs` | Low; X and Pinterest saves confirmed, Instagram not | Falls back to the next check |
| Pinterest's `PinResource/delete` request and `csrftoken` cookie | Unsave button | `unsave-dom.js` | Medium; confirmed working on the real site | Pinterest refuses it, nothing changes, and the button reports it |
| Sites tolerating automated reading | Everything | n/a | Unknown | Sign-in challenges, rate limits, account risk |

## Failure behaviour

| What breaks | What you see | What's lost |
|---|---|---|
| Site changes its page so posts can't be read | "couldn't read the page" on the next scan you see | Nothing, but new saves stop until fixed |
| Sign-in expires or a challenge appears | Account marked as needing sign-in, or a scan error | Nothing |
| Site rate-limits | Scan stops, and quiet checks pause for 2 hours | Nothing |
| Saved-state reading breaks | Nothing: unsaves simply stop being noticed | Nothing |
| Image link expires before copying | Recovery revisits the post | Nothing, unless the post is gone |
| App crashes mid-scan | Marked interrupted, batches already sent are kept | Nothing |

**Gaps that stay quiet today:**
- A scan can keep "working" while a field degrades, such as captions or images no longer being found. Nothing alerts on this.
- Quiet checks hide their own problems, so only a scan you can see surfaces them.
- Tests use hand-made fixture pages, so they can't notice a real site changing.
- Pinterest removal relies on absence, without a post-level check, so it's the one automatic removal a site change could wrongly trigger. Its safeguards limit this and scans restore a pin that's still saved, but notes-free pins would briefly vanish.
- Backups aren't automatic, including before database changes at startup.

## Repairing a site change

1. Check the site's real page in a signed-in panel, and find what moved.
2. Most fixes are in `extension/extractors.js` (reading), `extension/unsave-dom.js` (saved state) or `desktop/runtime.mjs` (request names). These are small, self-contained files.
3. Update the fixture in `tests/fixtures/` and `tests/extractors.test.mjs` to match the new page.
4. Ship a release. Reading code ships inside the app, so fixes reach you through the app's updater.

## AI in the app

MiniLM, Claude Code and Codex search, image scanning, saved descriptions, filling a note and Organize have their own document: [AI.md](AI.md).
