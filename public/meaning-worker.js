// Search by meaning runs here, away from the page. Every file comes from this computer once downloaded, and a save's
// text never leaves it. Its words become a list of numbers, and a search finds the saves whose numbers are closest.
const CUTOFF = .38, LIMIT = 40, MODEL = 'MongoDB/mdbr-leaf-ir', STORE = 'vectors';
// The model was trained with this in front of a search, and nothing in front of the text being searched.
const ASKING = 'Represent this sentence for searching relevant passages: ';
const vectors = new Map();
let items = [], listed = false, embed = null, queue = Promise.resolve(), indexing = false, again = false, database = null, wanted = null;
const pause = () => new Promise(resolve => setTimeout(resolve));
const inTurn = work => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
const read = text => embed(text);
const toVector = text => inTurn(() => read(text));

function openDatabase() {
  return new Promise(resolve => {
    try {
      // Numbers from different models can't be compared, so each model has its own store and the last one's is dropped.
      indexedDB.deleteDatabase('savex-meaning-1');
      const request = indexedDB.open('savex-meaning-2', 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
const loadSaved = () => new Promise(resolve => {
  if (!database) return resolve();
  const cursor = database.transaction(STORE).objectStore(STORE).openCursor();
  cursor.onsuccess = () => { const row = cursor.result; if (!row) return resolve(); vectors.set(row.key, row.value); row.continue(); };
  cursor.onerror = () => resolve();
});
function save(key, vector) { try { database?.transaction(STORE, 'readwrite').objectStore(STORE).put(vector, key); } catch { /* It's worked out again next time. */ } }
function forget(key) { try { database?.transaction(STORE, 'readwrite').objectStore(STORE).delete(key); } catch { /* Harmless if it stays. */ } }

async function load() {
  const { AutoTokenizer, AutoModel, env } = await import('/meaning-files/transformers.min.js');
  env.allowRemoteModels = false; env.allowLocalModels = true; env.localModelPath = '/meaning-files/models/'; env.useBrowserCache = false;
  Object.assign(env.backends.onnx.wasm, { wasmPaths: '/meaning-files/', numThreads: 1, proxy: false });
  database = await openDatabase(); await loadSaved();
  const tokenizer = await AutoTokenizer.from_pretrained(MODEL), model = await AutoModel.from_pretrained(MODEL, { dtype: 'q8', device: 'wasm' });
  // One list of 768 numbers per text, scaled to length 1 so that comparing two is a plain sum. Text past the model's limit is cut.
  embed = async text => {
    const vector = Float32Array.from((await model(await tokenizer([text], { padding: true, truncation: true }))).sentence_embedding.data);
    let length = 0; for (const value of vector) length += value * value;
    length = Math.sqrt(length) || 1; for (let index = 0; index < vector.length; index++) vector[index] /= length;
    return vector;
  };
  postMessage({ type: 'ready' });
  void index();
  if (wanted) void search(wanted);
}
async function index() {
  // Saved numbers for text that's no longer in the library are dropped below, so nothing runs until the page has
  // sent the library. Without the wait, a model that loads before the list arrives would drop them all and read every save again.
  if (!embed || !listed) return;
  if (indexing) { again = true; return; }
  indexing = true;
  try {
    do {
      again = false;
      const parts = items.flatMap(item => item.parts), current = new Set(parts.map(part => part.key));
      for (const key of [...vectors.keys()]) if (!current.has(key)) { vectors.delete(key); forget(key); }
      const missing = parts.filter(part => !vectors.has(part.key));
      for (const part of missing) {
        if (again) break;
        const vector = await toVector(part.text);
        vectors.set(part.key, vector); save(part.key, vector);
        await pause();
      }
    } while (again);
    postMessage({ type: 'indexed', count: items.length });
  } catch (failure) { postMessage({ type: 'failed', error: failure.message }); }
  finally { indexing = false; }
}
async function search(request) {
  wanted = request;
  if (!embed) return;
  try {
    // Each letter typed asks again. By its turn a search may be out of date, so it's dropped before the model reads it.
    const query = await inTurn(() => wanted === request ? read(ASKING + request.query) : null);
    if (!query || wanted !== request) return;
    const matches = [];
    for (const item of items) {
      let best = -1;
      for (const part of item.parts) {
        const vector = vectors.get(part.key); if (!vector) continue;
        let score = 0; for (let index = 0; index < vector.length; index++) score += vector[index] * query[index];
        if (score > best) best = score;
      }
      if (best >= CUTOFF) matches.push([item.id, best]);
    }
    matches.sort((a, b) => b[1] - a[1]);
    postMessage({ type: 'results', query: request.query, matches: matches.slice(0, LIMIT) });
  } catch (failure) { postMessage({ type: 'failed', error: failure.message }); }
}
async function rank({ id, query: text }) {
  if (!embed) return postMessage({ type: 'ranked', id, complete: false, ranking: [] });
  try {
    const query = await toVector(ASKING + text), scored = [];
    let complete = !indexing;
    for (const item of items) {
      let best = -1, seen = false;
      for (const part of item.parts) {
        const vector = vectors.get(part.key); if (!vector) { complete = false; continue; }
        seen = true; let score = 0; for (let index = 0; index < vector.length; index++) score += vector[index] * query[index];
        if (score > best) best = score;
      }
      if (seen) scored.push([item.id, best]);
    }
    postMessage({ type: 'ranked', id, complete, ranking: scored.sort((a, b) => b[1] - a[1]) });
  } catch { postMessage({ type: 'ranked', id, complete: false, ranking: [] }); }
}
onmessage = ({ data }) => {
  if (data.type === 'index') { items = data.items; listed = true; void index(); }
  if (data.type === 'search') void search(data);
  if (data.type === 'rank') void rank(data);
};
load().catch(failure => postMessage({ type: 'failed', error: failure.message }));
