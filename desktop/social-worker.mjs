import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const pending = new Map(), handlers = [], alarmHandlers = [];
let sequence = 0;
function rpc(method, args = []) {
  return new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('The desktop operation took too long.')); }, 120000);
    pending.set(id, { resolve, reject, timer }); parentPort.postMessage({ id, method, args });
  });
}
const clone = value => structuredClone(value);
function storage(initial = {}) {
  let values = initial;
  return {
    async get(keys) { return clone(keys == null ? values : Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, values[key]]))); },
    async set(input) { Object.assign(values, clone(input)); },
    async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; },
    async setAccessLevel() {}
  };
}
async function dispatch(message, sender) {
  if (!handlers.length) throw new Error('The native collector is not ready.');
  return new Promise(resolve => { for (const handler of handlers) handler(message, sender, resolve); });
}
parentPort.on('message', message => {
  if (message.reply) {
    const call = pending.get(message.reply); if (!call) return;
    clearTimeout(call.timer); pending.delete(message.reply);
    if (message.error) call.reject(new Error(message.error)); else call.resolve(message.result);
  } else if (message.collector) {
    void dispatch(message.collector, message.sender).then(result => parentPort.postMessage({ collectorReply: message.id, result })).catch(error => parentPort.postMessage({ collectorReply: message.id, result: { ok: false, error: error.message } }));
  } else if (message.wake) void dispatch({ type: 'CHECK_JOBS' }, { id: 'savex-native', url: 'savex-native://options' }).catch(() => {});
});
globalThis.SaveXDesktopWorker = {
  async request(path, body) {
    // Only this worker receives the private transport key; it is never sent to
    // library renderers or social websites.
    if (body?.message) body = { ...body, message: body.message.replaceAll('in Chrome', 'in saveXtension') };
    if (body?.results) body = { ...body, results: body.results.map(result => ({ ...result, message: result.message?.replaceAll('in Chrome', 'in saveXtension') })) };
    const response = await fetch(`${workerData.origin}/api/extension${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: workerData.origin, 'Content-Type': 'application/json', 'X-SaveX-Native': workerData.token }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(12000) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The local library is unavailable.'); return result;
  },
  accounts: platform => rpc('accounts', [platform]),
  selectAccount: (platform, account) => rpc('selectAccount', [platform, account]),
  verifyAccount: (id, platform, account) => rpc('verifyAccount', [id, platform, account]),
  accountError: message => rpc('accountError', [message]),
  bookmarks: () => rpc('bookmarks')
};
const call = name => (...args) => rpc(name, args);
globalThis.chrome = {
  storage: { local: storage({ instance: workerData.instance, libraryOrigin: workerData.origin }), session: storage() },
  permissions: { contains: value => rpc('permissions', [value]) },
  tabs: Object.fromEntries(['create', 'update', 'get', 'query', 'remove', 'reload', 'group', 'sendMessage'].map(name => [name, call(`tabs.${name}`)])),
  tabGroups: { get: call('groups.get'), update: call('groups.update') },
  windows: { get: async () => ({ state: 'normal' }), update: async () => ({}) },
  scripting: {
    getRegisteredContentScripts: async () => [{ id: 'savex-background-layout' }],
    registerContentScripts: async () => {},
    executeScript: options => rpc('execute', [{ ...options, func: options.func?.toString() }])
  },
  runtime: {
    id: 'savex-native', getURL: path => `savex-native://${path}`, getManifest: () => ({ version: workerData.version }),
    onMessage: { addListener: handler => handlers.push(handler) },
    onInstalled: { addListener() {} }, onStartup: { addListener() {} }, openOptionsPage: call('openAccounts')
  },
  alarms: { async create() { setInterval(() => alarmHandlers.forEach(handler => handler({ name: 'savex-sync' })), 30000).unref(); }, onAlarm: { addListener: handler => alarmHandlers.push(handler) } }
};
await import(pathToFileURL(join(workerData.extensionRoot, 'background.js')).href);
parentPort.postMessage({ ready: true });
