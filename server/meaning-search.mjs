import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

// Search by meaning is optional, so none of this ships in the installer. These exact files are what the library
// page will run, so each is pinned to a version and checked against its hash before it's kept.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist';
const ENGINE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist';
const MODEL = 'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/751bff37182d3f1213fa05d7196b954e230abad9';
const MODEL_DIR = 'models/Xenova/all-MiniLM-L6-v2';
const FILES = [
  { path: 'transformers.min.js', url: `${LIBRARY}/transformers.min.js`, size: 587917, sha256: '8b5a3171f8876bab2b1820a7d65eb87628e3d30bb5ea85b9dd398e76eb34decb' },
  { path: 'ort-wasm-simd-threaded.asyncify.mjs', url: `${ENGINE}/ort-wasm-simd-threaded.asyncify.mjs`, size: 53057, sha256: '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611' },
  { path: 'ort-wasm-simd-threaded.asyncify.wasm', url: `${ENGINE}/ort-wasm-simd-threaded.asyncify.wasm`, size: 26861777, sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082' },
  { path: `${MODEL_DIR}/config.json`, url: `${MODEL}/config.json`, size: 650, sha256: '7135149f7cffa1a573466c6e4d8423ed73b62fd2332c575bf738a0d033f70df7' },
  { path: `${MODEL_DIR}/tokenizer.json`, url: `${MODEL}/tokenizer.json`, size: 711661, sha256: 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0' },
  { path: `${MODEL_DIR}/tokenizer_config.json`, url: `${MODEL}/tokenizer_config.json`, size: 366, sha256: '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3' },
  { path: `${MODEL_DIR}/onnx/model_quantized.onnx`, url: `${MODEL}/onnx/model_quantized.onnx`, size: 22972370, sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1' },
];
const TOTAL = FILES.reduce((sum, file) => sum + file.size, 0);
const sizeOf = path => { try { return statSync(path).size; } catch { return -1; } };

export function meaningSearch({ dir, files = FILES, request = fetch } = {}) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  let job = null, done = 0, error = '';
  const present = file => sizeOf(join(dir, file.path)) === file.size;
  const ready = () => !!dir && files.every(present);
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
        finally { job = null; }
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
