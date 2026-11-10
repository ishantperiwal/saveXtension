// Dot-grid loaders, one per kind of work, drawn in the current text colour. Each dot gets a place in the sweep, as one of
// 25 classes because the page's security rules block inline styles, and CSS does the rest. The style follows Dot Matrix (dotmatrix.zzzzshawn.cloud), written here without React.
const SIZE = 5, MID = (SIZE - 1) / 2;
const ring = [];
for (let col = 0; col < SIZE; col++) ring.push([0, col]);
for (let row = 1; row < SIZE; row++) ring.push([row, SIZE - 1]);
for (let col = SIZE - 2; col >= 0; col--) ring.push([SIZE - 1, col]);
for (let row = SIZE - 2; row > 0; row--) ring.push([row, 0]);
const angle = (row, col) => ((Math.atan2(col - MID, MID - row) / (2 * Math.PI)) + 1) % 1;
// Each returns a dot's place in the sweep, or null to leave that spot empty, or 'on' for a dot that stays lit.
const KINDS = {
  // A radar arm turning: looking through the library.
  search: (row, col) => row === MID && col === MID ? 'on' : Math.hypot(row - MID, col - MID) > 2.3 ? null : angle(row, col),
  // A line moving down: reading an image.
  scan: row => row / SIZE,
  // Back and forth along the lines: writing.
  write: (row, col) => (row * SIZE + (row % 2 ? SIZE - 1 - col : col)) / (SIZE * SIZE),
  // Filling up from the bottom, row by row: putting things in place.
  organize: (row, col) => ((SIZE - 1 - row) * SIZE + col) / (SIZE * SIZE),
  // Columns running in turn up and down: fetching files.
  download: (row, col) => (col % 2 ? row : SIZE - 1 - row) / SIZE,
  // A light going round a fixed centre: waiting on something else.
  busy: (row, col) => row === MID && col === MID ? 'on' : (() => { const at = ring.findIndex(([r, c]) => r === row && c === col); return at < 0 ? null : at / ring.length; })(),
};
export function dotLoader(kind, size = 'small') {
  const place = KINDS[kind];
  let dots = '';
  for (let row = 0; row < SIZE; row++) for (let col = 0; col < SIZE; col++) {
    const at = place(row, col);
    dots += at === null ? '<i class="is-empty"></i>' : at === 'on' ? '<i class="is-on"></i>' : `<i class="t${Math.round(at * 24)}"></i>`;
  }
  return `<span class="dot-loader is-${kind} is-${size}" aria-hidden="true">${dots}</span>`;
}
