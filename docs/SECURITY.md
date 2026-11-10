# Local-mode boundaries

The Electron renderer has Node integration disabled, context isolation and sandboxing enabled, and no webview capability. The preload exposes a fixed list of helper actions. Main-process IPC checks both the originating web contents and exact library origin. External HTTP/HTTPS links open in the system browser; other protocols and unexpected in-window navigation are blocked. Renderer permission requests are denied; source permissions belong to Chrome/Edge.

The packaged helper is copied into a stable, user-owned application-data directory. Browser launching uses fixed application candidates and argument arrays, never a shell command assembled from page content. The connection-tab close action verifies the configured local origin, exact page path and desktop marker before closing the sender tab. The desktop runtime retains the server's loopback and origin protections.

Initial installers are local test builds: macOS uses an ad-hoc signature without Apple notarization, and Windows has no publisher signature. The build does not modify operating-system trust settings. Distribution certificates and notarization are separate release work.

The desktop updater trusts stable installer releases from `ishantperiwal/saveXtension`, with no GitHub token embedded in the app. It rejects unexpected repositories, asset names, architectures and non-GitHub redirect hosts. Files must match the release asset's declared size and SHA-256 digest; incomplete/corrupt downloads are removed and the file is hashed again before launch. A checksum verifies the published bytes, not a publisher identity independently of GitHub. Downloading never executes a package. The user explicitly opens the installer through a native dialog, and OS trust checks remain in effect. Repository/release write access therefore controls distribution. The library database and login sessions are not sent to the update service.

The default app is a personal library for this computer. It has no password, setup code, or pairing token. `server/index.mjs` restricts local-mode binding to loopback, and the HTTP server accepts local-mode connections only from loopback addresses. Host checks and library mutation Origin checks remain enabled.

The extension has localhost access and requests X/Instagram host access once through Chrome. This enables inactive-tab collection with the user's existing browser sessions. Passwords are never read. Site cookies are only handed from Chrome to the desktop app when you ask to sign in that way, and only for that site. They go to that account's session, not the library database. The localhost bridge only wakes the sync queue; it cannot choose arbitrary URLs or invoke arbitrary extension actions.

Only extension-owned tabs are navigated and closed. Collector messages are checked against the extension ID, current source tab, run ID and phase. Job claims have an owner and cancellation preserves acknowledged data. Background layout helpers run only on dedicated sync URLs marked with `#savex-sync`.

One cover image per save is copied to the local `images` folder and served only to the library itself. Video and other media stay on their platform. Captured metadata and user annotations are escaped before display. Imported archive JS is parsed as JSON data and never executed.

SQLite databases and JSON exports are local files and are not encrypted at rest. The old password/session/pairing backend is retained behind `AUTH_REQUIRED=true`; the background extension workflow has been designed and tested for local mode. Public hosting needs a separate authentication and extension-access design before exposure.

X account selection uses rendered account-menu controls with existing Chrome sessions. It does not read or rewrite authentication cookies. The helper verifies the selected handle before creating the source import run, and missing accounts fail explicitly. The user has authorized switching shared X login state; background account changes can affect other X tabs in that Chrome profile.

Chrome bookmark access is optional and requested by a click in the extension. The implementation uses only `getTree()`, reads the current profile, and sends titles, HTTP/HTTPS URLs, folder paths and bookmark dates to the loopback library. It never creates, edits or removes Chrome bookmarks, requests broad website access, or opens destination links during import. Unsupported schemes and URLs containing credentials are skipped. Existing social permissions remain independent.

Deep scans require an explicit queued mode and a helper advertising sync-mode support. Confirmed-X-unsave mutation endpoints require an active deep X run owned by the caller, two matching account/post observations, and no sighting in the current saved-list scan. The helper only emits observations for explicit, enabled bookmark controls on the target post after stable samples and a second page load; missing/inaccessible posts are never deletion evidence. Removing one source account preserves other accounts and annotations. Archived records are excluded from removal. Deep scans are never scheduled automatically.

## Desktop hidden windows and the post panel

Scans run in hidden, sandboxed, muted Electron windows, one session partition per connected account. Navigation is limited to that account's site (`socialUrl`), downloads are refused and permission requests are denied. Account checks read page navigation only, never password fields or cookies.

The post panel shows the real site in the same account's session, with the same limits. While it's open, the app looks at POST requests from that one view to tell whether you saved or unsaved something. Nothing from those requests is stored or sent anywhere. Setting `SAVEX_DEBUG_POST_PANEL` logs their paths to the terminal for debugging.

A saved Chrome bookmark opens in the same panel in its own separate session, which never holds your Instagram, X or Pinterest sign-ins. Any web page can load there, so it keeps the same protections: sandboxed, no app access, downloads refused and permission requests denied. Sign-ins made there stay in that session. Its requests aren't looked at, and the page is closed when the panel closes. Other links in the library still open in your browser.

MCP's `view_save` opens one saved post at a time in a hidden window, with the same limits. It takes a save's ID, not a web address, and the most it does on the page is move a carousel on, using its Next button or slide strip, and move a video's playhead. What it returns is untrusted page content. It refuses after 5 views in 10 minutes unless the caller says the user approved. A video's frames are captured in the background for up to 5 minutes, stay in the app's memory for `read_view_frames`, never on disk, and are deleted 15 minutes after capture or at the next view.

A post noticed as unsaved outside the app becomes a `verify_only` request, which only reads. The server refuses a click for it. Pinterest's Unsave button is the one place the app sends a site's own write request. It runs only when you confirm, for one pin, from that account's board page, using that session's own token, which is never stored or logged. Quiet background checks repeat the last scan you chose without Instagram, skip while the computer is idle, and pause for two hours after a sign-in or rate-limit message.

## Search by meaning (MiniLM)

The first launch contacts jsDelivr and Hugging Face to install MiniLM. Those files are code the app runs, so each is pinned to a SHA-256 hash and rejected if it doesn't match. WebAssembly is allowed only for its background worker, not the library page. Saved text stays on the computer.

## Filling a note with an AI tool

(DeepSeek is different: it's an API key the person adds in Settings, encrypted with the system keychain in `ai-keys.json` beside the library, checked with DeepSeek before it's kept and never sent back to the page. It gets saved text and images for AI search, Organize and scanning, with no tools. For notes it gets that one post's read tools and reading the web, with no shell or files.) Only when someone types a request on one post's note and presses Enter. The chosen tool (Claude Code or Codex) gets a private local address tied to that post, read tools for it, and web search, and no library access or personal settings. Claude Code can also read any web page, because a request can be about something a post links to, but it has no access to files and can't run commands. Codex's web search is its own, and it runs in a read-only sandbox with the person's connected apps, shell, browsers and plugins turned off. It returns text and the app writes the note, adding below what's there, or replacing it when the request asks for a rewrite. Undo puts the note back. The post's text, page, screenshots and frames go to the tool's AI provider, and its searches and the addresses it opens go out to the web. Saved posts can contain text meant to mislead an AI: the tools limit what that could reach, but a result could still be wrong, and a misleading page could get that post's details sent to a website. A wrong result can be edited out of the note.

## Organizing topics with an AI tool

Only when someone types a request in the Organize box and presses Enter. It sends the request and the topic names, counts and descriptions to the chosen tool's AI provider, and finding saves sends their text as AI search does. The model that plans changes never sees a post, and the ones that read posts can only score IDs, so text in a post can't get a topic deleted or renamed. It can't delete a save, and Undo takes a whole request back.

## Search with an AI tool

This sends the text of visible saves to the chosen tool's AI provider, only after someone chooses a tool and clicks its button. Claude Code runs with no tools, MCP servers or personal settings, so text in a post can't make it act. Codex runs in its read-only sandbox, where misleading post text could make it read local files into what it sends its provider, so it's the weaker option. Only post IDs that were sent are accepted back from either. Install and sign-in run fixed official commands, only when clicked. When it's unsure, Claude Code also sees that post's saved image, with no tools, and what it sees is saved locally as untrusted text. More than 30 images in one search needs a yes first.
