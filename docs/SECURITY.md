# Local-mode boundaries

The default app is a personal library for this computer. It has no password, setup code, or pairing token. `server/index.mjs` restricts local-mode binding to loopback, and the HTTP server accepts local-mode connections only from loopback addresses. Host checks and library mutation Origin checks remain enabled.

The extension has localhost access and requests X/Instagram host access once through Chrome. This enables inactive-tab collection with the user's existing browser sessions. No platform cookies or passwords are copied into the local library. The localhost bridge only wakes the sync queue; it cannot choose arbitrary URLs or invoke arbitrary extension actions.

Only extension-owned tabs are navigated and closed. Collector messages are checked against the extension ID, current source tab, run ID and phase. Job claims have an owner and cancellation preserves acknowledged data. Background layout helpers run only on dedicated sync URLs marked with `#savex-sync`.

Post images and video load from the original platform in the isolated native embed. The library does not download or serve media copies. Startup discards the old generated image cache. Captured metadata and user annotations are escaped before display. Imported archive JS is parsed as JSON data and never executed.

SQLite databases and JSON exports are local files and are not encrypted at rest. The old password/session/pairing backend is retained behind `AUTH_REQUIRED=true`; the background extension workflow has been designed and tested for local mode. Public hosting needs a separate authentication and extension-access design before exposure.

X account selection uses rendered account-menu controls with existing Chrome sessions. It does not read or rewrite authentication cookies. The helper verifies the selected handle before creating the source import run, and missing accounts fail explicitly. The user has authorized switching shared X login state; background account changes can affect other X tabs in that Chrome profile.

Chrome bookmark access is optional and requested by a click in the extension. The implementation uses only `getTree()`, reads the current profile, and sends titles, HTTP/HTTPS URLs, folder paths and bookmark dates to the loopback library. It never creates, edits or removes Chrome bookmarks, requests broad website access, or opens destination links during import. Unsupported schemes and URLs containing credentials are skipped. Existing social permissions remain independent.

Deep scans require an explicit queued mode and a helper advertising sync-mode support. Confirmed-X-unsave mutation endpoints require an active deep X run owned by the caller, two matching account/post observations, and no sighting in the current saved-list scan. The helper only emits observations for explicit, enabled bookmark controls on the target post after stable samples and a second page load; missing/inaccessible posts are never deletion evidence. Removing one source account preserves other accounts and annotations. Archived records are excluded from removal. Deep scans are never scheduled automatically.
