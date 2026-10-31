# Security and privacy

This is a personal single-owner service. Keep it on loopback or behind HTTPS and protect the host, browser profile and data directory. Don’t expose the plain HTTP port to the internet.

- No social login cookies, passwords or session exports are collected.
- A connected extension holds a revocable bearer token. A compromised browser profile can expose it; disconnect the device in web settings.
- Post text, source account labels and notes can be private. SQLite and downloaded backups are plaintext at rest. Rely on host disk encryption and private backup storage as appropriate.
- Thumbnail URLs are restricted to known platform image hosts. Images are loaded by your browser with no referrer; the backend does not fetch arbitrary user-supplied URLs. Third-party media servers still receive the image request and your browser IP.
- No analytics, external fonts, third-party UI scripts, remote AI services or social embeds run in the library.
- User content is rendered as escaped text. Imported HTML is parsed for links, not inserted into the app. Archive JavaScript is parsed as JSON after its assignment, never executed.
- Device-authenticated routes have a separate, limited surface. CORS permits extension origins only on that surface; pairing additionally requires a fresh secret code.
- Browser sync can conflict with platform terms, and DOM selectors can change. User consent does not grant permission from the platform. See the README for current limitations and source links.

## Before making this multi-user

Add tenant ownership on every table/query, external identity or a full account lifecycle, per-user device scopes and quotas, robust distributed rate limiting, audited recovery, encrypted backups, deployment monitoring and a platform-approved import strategy. The current implementation doesn’t claim those features.
