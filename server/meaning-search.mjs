import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

// Search by meaning is optional, so none of this ships in the installer. These exact files are what the library
// page will run, so each is pinned to a version and checked against its hash before it's kept.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist';
const ENGINE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist';
const MODEL = 'https://huggingface.co/MongoDB/mdbr-leaf-ir/resolve/4262131b32c3182bd06e67e92ae69d7bd66e0c5c';
const MODEL_DIR = 'models/MongoDB/mdbr-leaf-ir';
// Folders an earlier version downloaded that nothing reads now: all-MiniLM-L6-v2, the model before this one.
const RETIRED = ['models/Xenova'];
const FILES = [
  { path: 'transformers.min.js', url: `${LIBRARY}/transformers.min.js`, size: 587917, sha256: '8b5a3171f8876bab2b1820a7d65eb87628e3d30bb5ea85b9dd398e76eb34decb' },
  { path: 'ort-wasm-simd-threaded.asyncify.mjs', url: `${ENGINE}/ort-wasm-simd-threaded.asyncify.mjs`, size: 53057, sha256: '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611' },
  { path: 'ort-wasm-simd-threaded.asyncify.wasm', url: `${ENGINE}/ort-wasm-simd-threaded.asyncify.wasm`, size: 26861777, sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082' },
  { path: `${MODEL_DIR}/config.json`, url: `${MODEL}/config.json`, size: 829, sha256: '258407cfa27c7e1e502a9c312abebb4f5241bf226972ffc366287f370a3567f1' },
  { path: `${MODEL_DIR}/tokenizer.json`, url: `${MODEL}/tokenizer.json`, size: 711661, sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0' },
  { path: `${MODEL_DIR}/tokenizer_config.json`, url: `${MODEL}/tokenizer_config.json`, size: 1529, sha256: '46ac231e9b955a8af80fc7f23a0ecc65b524f1df84a02c2c82cbca354fb207b4' },
  // This model keeps its weights in a second file beside the first.
  { path: `${MODEL_DIR}/onnx/model_quantized.onnx`, url: `${MODEL}/onnx/model_quantized.onnx`, size: 220597, sha256: '8c08cb4ecc00bad721b117a85738c537ceb9b85b3eedc52d9c6906fddaa55718' },
  { path: `${MODEL_DIR}/onnx/model_quantized.onnx_data`, url: `${MODEL}/onnx/model_quantized.onnx_data`, size: 22954752, sha256: 'e77ea96a124230e23e5bac8e26c3ffe5410154973d8635673fa0220b06c13f8b' },
];
const TOTAL = FILES.reduce((sum, file) => sum + file.size, 0);
const sizeOf = path => { try { return statSync(path).size; } catch { return -1; } };

export function meaningSearch({ dir, files = FILES, request = fetch, retired = RETIRED } = {}) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let job = null, done = 0, error = '';
  const present = file => sizeOf(join(dir, file.path)) === file.size;
  const ready = () => !!dir && files.every(present);
  // An older model's files go only once this one's are all in place, so search is never left with neither.
  const tidy = () => { if (ready()) for (const folder of retired) void rm(join(dir, folder), { recursive: true, force: true }).catch(() => {}); };
  tidy();
  async function fetchFile(file, signal) {
    const target = join(dir, file.path), partial = `${target}.partial`;
    await mkdir(dirname(target), { recursive: true });
    const hash = createHash('sha256');
    let received = 0;
    try {
      const response = await request(file.url, { signal });
      if (!response.ok || !response.body) throw new Error(`The download server answered ${response.status}.`);
      await pipeline(response.body, async function* (source) {
        for await (const chunk of source) {
          received += chunk.length; done += chunk.length;
          if (received > file.size) throw new Error('A download was larger than expected.');
          hash.update(chunk); yield chunk;
        }
      }, createWriteStream(partial), { signal });
      if (received !== file.size || hash.digest('hex') !== file.sha256) throw new Error('A download failed its safety check.');
      await rename(partial, target);
    } catch (failure) { await rm(partial, { force: true }); throw failure; }
  }
  return {
    status: () => ({ available: !!dir, state: job ? 'downloading' : ready() ? 'ready' : error ? 'failed' : 'absent', done, total, error }),
    download() {
      if (!dir) throw new Error('Search by meaning is not available here.');
      if (job || ready()) return;
      const controller = new AbortController();
      done = files.filter(present).reduce((sum, file) => sum + file.size, 0); error = '';
      job = { controller };
      job.finished = (async () => {
        try { for (const file of files) if (!present(file) && !controller.signal.aborted) await fetchFile(file, controller.signal); }
        catch (failure) { if (!controller.signal.aborted) error = failure.message || 'The download stopped.'; }
        finally { job = null; tidy(); }
      })();
    },
    async remove() {
      job?.controller.abort(); await job?.finished;
      error = ''; done = 0;
      if (dir) await rm(dir, { recursive: true, force: true });
    },
    // Only the files listed above are ever served, so nothing else in this folder can reach the page.
    file(path) {
      const file = files.find(item => item.path === path);
      return file && dir && present(file) ? { path: join(dir, file.path), size: file.size, stream: () => createReadStream(join(dir, file.path)) } : null;
    },
    close() { job?.controller.abort(); },
  };
}
export const MEANING_DOWNLOAD_SIZE = TOTAL;
