import test from 'node:test';
import assert from 'node:assert/strict';
import { embedTarget } from '../public/embed-target.js';
import { embedDocument } from '../server/embeds.mjs';

test('native embeds accept only supported post URLs and stable IDs', () => {
  assert.equal(embedTarget('https://x.com/a/status/123?x=1').path, '/embed/x/123');
  assert.equal(embedTarget('https://twitter.com/i/web/status/123').path, '/embed/x/123');
  assert.equal(embedTarget('https://www.instagram.com/reels/AbC_123-/').path, '/embed/instagram/reel/AbC_123-');
  for (const url of ['javascript:alert(1)', 'https://x.com.evil.example/a/status/123', 'https://instagram.com@evil.example/p/Code/', 'https://x.com:443/a/status/not-an-id', 'https://x.com/home', 'https://instagram.com/accounts/login/']) assert.equal(embedTarget(url), null);
});
test('embed documents isolate platform scripts and never interpolate arbitrary markup', () => {
  const x = embedDocument('/embed/x/123', 'http://localhost:3210');
  assert.match(x.html, /data-post-id="123"/); assert.match(x.csp, /sandbox allow-scripts/); assert.match(x.csp, /allow-same-origin/);
  assert.match(x.csp, /frame-ancestors http:\/\/localhost:3210/);
  const ig = embedDocument('/embed/instagram/reel/Code_123', 'http://localhost:3210');
  assert.match(ig.html, /data-instgrm-permalink="https:\/\/www.instagram.com\/reel\/Code_123\//);
  for (const path of ['/embed/x/<script>', '/embed/instagram/p/Code%22', '/embed/evil/123', '/embed/instagram/profile/name']) assert.equal(embedDocument(path, 'http://localhost:3210'), null);
});
