import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer, request } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { buildLocalDshRuntime } from '../../../integrations/deepseek-harness/desktop/build.mjs';

const require = createRequire(import.meta.url), esbuild = createRequire(require.resolve('vite'))('esbuild');
const client = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const runtime = { exports: {} };
vm.runInNewContext(buildLocalDshRuntime(client).outputFiles[0].text, { module: runtime, exports: runtime.exports, require, process, Buffer, URL, setTimeout, clearTimeout });
const compiled = await esbuild.build({ entryPoints: [new URL('../electron/main/localDshAccount.ts', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], bundle: true, platform: 'node', format: 'cjs', write: false,
  external: ['./localDshRuntime'],
  plugins: [{ name: 'native-boundary', setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const net = {};' }));
    build.onLoad({ filter: /localFolderManage\.ts$/ }, () => ({ contents: 'export function authority(){throw Error("not an IPC test")}' }));
    build.onLoad({ filter: /windowManage\.ts$/ }, () => ({ contents: 'export function getResearchServiceStatus(){throw Error("not an IPC test")}' }));
  } }],
});
const module = { exports: {} };
vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require: name => name === './localDshRuntime' ? runtime.exports : require(name), Buffer, URL, setTimeout, clearTimeout });
const { createDshRelay } = module.exports;

test('loopback relay rejects browser-origin, wrong and non-ASCII tokens, restricts routes, fences accounts and closes sockets', async t => {
  let calls = 0, valid = true;
  const upstream = createServer((req, res) => {
    calls++; assert.equal(req.headers['x-csrf-token'], 'synthetic-csrf'); assert.equal(req.headers.authorization, undefined);
    const chunks = []; req.on('data', chunk => chunks.push(chunk)); req.on('end', () => {
      const body = JSON.parse(Buffer.concat(chunks)); assert.equal(body.fingerprint, 'synthetic-version');
      res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: synthetic\n\n');
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => upstream.close(r)));
  const relay = await createDshRelay({ metadata: { protocol: 'openai-completions', fingerprint: 'synthetic-version' }, csrf: 'synthetic-csrf',
    valid: async () => { if (!valid) throw Error('revoked') }, request: () => request({ host: '127.0.0.1', port: upstream.address().port, method: 'POST' }),
  });
  t.after(() => relay.close());
  const call = (headers = {}, suffix = '/v1/chat/completions') => fetch(relay.baseURL + suffix, { method: 'POST', headers: { authorization: 'Bearer ' + relay.secret, ...headers }, body: JSON.stringify({ model: 'synthetic', messages: [] }) });
  assert.equal((await call({ authorization: 'Bearer ' + 'é'.repeat(64) })).status, 401);
  assert.equal((await call({ origin: 'https://untrusted.example' })).status, 401);
  assert.equal((await call({ authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await call({}, '/other')).status, 404);
  assert.equal(calls, 0);
  const response = await call(); assert.equal(response.status, 200); assert.equal(await response.text(), 'data: synthetic\n\n');
  valid = false; assert.equal((await call()).status, 401); assert.equal(calls, 1);
  await relay.close(); await assert.rejects(call());
});

test('managed account overlay preserves user plugins and contains only a credential reference', async t => {
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-profile-')); t.after(() => rmSync(home, { recursive: true, force: true }));
  const client = path.resolve(new URL('../', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  const built = buildLocalDshRuntime(client), runtime = { exports: {} };
  vm.runInNewContext(built.outputFiles[0].text, { module: runtime, exports: runtime.exports, require, process, Buffer, URL, setTimeout, clearTimeout });
  writeFileSync(path.join(home, 'cordis.patch.yml'), 'synthetic user plugin settings');
  const file = await runtime.exports.prepareAccountProfile(home, { baseURL: 'http://127.0.0.1:4321', model: 'synthetic-model', protocol: 'openai-completions', maxTokens: 8192 });
  const entries = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(entries[0].config.providers.acceptcat.apiKeyEnv, 'ACCEPTCAT_DSH_TOKEN');
  assert.equal(entries[0].config.providers.acceptcat.retryPolicy.maxRetries, 0);
  assert.equal(entries[1].config.provider, 'acceptcat');
  assert.equal(readFileSync(path.join(home, 'cordis.patch.yml'), 'utf8'), 'synthetic user plugin settings');
  for (const [provider, model, contextWindow] of [
    ['deepseek', 'deepseek-flash', 1048576], ['deepseek', 'deepseek-v4-pro', 1048576],
    ['qwen', 'deepseek-flash', 65536], ['deepseek', 'unknown-future-model', 65536],
  ]) {
    await runtime.exports.prepareAccountProfile(home, { provider, model, baseURL: 'http://127.0.0.1:4321', protocol: 'anthropic-messages', maxTokens: 8192 });
    const configured = JSON.parse(readFileSync(file, 'utf8'))[0].config.providers.acceptcat;
    assert.equal(configured.defaultContextWindow, contextWindow);
    assert.equal(configured.models[0].contextWindow, contextWindow);
    assert.equal(configured.models[0].maxTokens, 8192);
    const overlay = JSON.parse(readFileSync(file, 'utf8'));
    const native = overlay.find(entry => entry.id === 'llm-deepseek');
    if (provider === 'deepseek' && model !== 'unknown-future-model') {
      assert.equal(native.config.apiKeyEnv, 'ACCEPTCAT_DSH_TOKEN');
      assert.equal(native.config.baseURL, 'http://127.0.0.1:4321');
      assert.equal(native.config.models[0].maxTokens, 8192);
      assert.equal(native.config.models[0].contextWindow, contextWindow);
      assert.deepEqual(native.config.models.map(m => m.id), ['deepseek-flash', 'deepseek-v4-pro']);
      assert.equal(native.config.thinking, undefined); // DSH owns effort semantics/defaults.
      assert.equal(overlay.find(entry => entry.id === 'agent-default-model').config.provider, 'deepseek-official');
      assert.equal(overlay.find(entry => entry.id === 'session-log-deepseek').config.enabled, false);
      assert.equal(overlay.find(entry => entry.id === 'plugin-package-inventory-deepseek').config.enabled, false);
    } else assert.equal(native, undefined);
  }
});

test('Anthropic relay accepts the bundled SDK beta messages route without allowing other operations or queries', async t => {
  const received = [];
  const upstream = createServer((req, res) => {
    assert.equal(req.url, '/api/v1/local-dsh/completion');
    assert.equal(req.headers['x-csrf-token'], 'synthetic-csrf');
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      received.push(JSON.parse(Buffer.concat(chunks)));
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    });
  });
  await new Promise(r => upstream.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => upstream.close(r)));
  const relay = await createDshRelay({ metadata: { protocol: 'anthropic-messages', fingerprint: 'synthetic-version' }, csrf: 'synthetic-csrf',
    valid: async () => {}, request: (url, method) => request({ host: '127.0.0.1', port: upstream.address().port, path: url, method }),
  });
  t.after(() => relay.close());
  const body = { model: 'deepseek-flash', messages: [{ role: 'user', content: 'Synthetic greeting' }], stream: true, max_tokens: 8192 };
  const call = (route, key = relay.secret) => fetch(relay.baseURL + route, { method: 'POST', headers: { 'x-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await call('/v1/messages?beta=true', 'wrong')).status, 401);
  for (const route of ['/v1/messages/count_tokens?beta=true', '/v1/messages/batches', '/v1/chat/completions', '/v1/messages?beta=false', '/v1/messages?beta=true&url=https://example.com', '/v1/messages?beta=true&beta=true'])
    assert.equal((await call(route)).status, 404, route);
  assert.equal(received.length, 0);
  for (const route of ['/v1/messages', '/v1/messages?beta=true']) {
    const response = await call(route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), /message_stop/);
  }
  assert.equal(received.length, 2);
  for (const envelope of received) assert.deepEqual(envelope, { fingerprint: 'synthetic-version', protocol: 'anthropic-messages', request: body });
});
