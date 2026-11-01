/**
 * Tests for mcp/berezz-mcp.mjs: spawn the stdio MCP server against a tiny
 * in-process fake of Berezz's /api/agent/* endpoints.
 *
 * Run: node --test tests/mcp.test.mjs
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MCP = join(ROOT, 'mcp', 'berezz-mcp.mjs');

/* ------------------------------------------------------------ fake Berezz */

const received = [];
let fake;
let baseUrl;

const agentView = (id, actions) => ({
  id,
  title: 'Uji',
  counts: { answer: 0, approve: actions.length, queued: 0, done: 0, undone: 0 },
  group: 'approve',
  url: `http://localhost:0/#/inbox/${id}`,
  note: 'Aksi hanya dijalankan setelah manusia menyetujuinya di Berezz.',
  injectionsIgnored: [],
  review: null,
  actions: actions.map((a, i) => ({ id: `a${i + 1}`, type: a.type, status: 'pending_approval', title: a.subject || a.title || '', sourceQuote: a.source_quote, openQuestion: null, blockedBy: [] })),
});

function startFake() {
  return new Promise((resolve) => {
    fake = createServer(async (req, res) => {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : null;
      received.push({ method: req.method, url: req.url, body });
      const send = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      const url = new URL(req.url, 'http://x');
      if (req.method === 'POST' && url.pathname === '/api/agent/jobs') {
        if (body?.text === 'GAGAL') return send(422, { ok: false, error: { code: 'NO_ACTIONS', message: 'Tidak ada aksi yang bisa diusulkan.' } });
        return send(201, agentView('JOB-0001', body?.plan?.actions || []));
      }
      if (req.method === 'GET' && url.pathname === '/api/agent/jobs') return send(200, [{ id: 'JOB-0001', title: 'Uji', counts: { answer: 0, approve: 1, done: 0 }, url: 'http://localhost:0/#/inbox/JOB-0001' }]);
      if (req.method === 'GET' && url.pathname === '/api/agent/jobs/JOB-0001') return send(200, agentView('JOB-0001', []));
      if (req.method === 'GET' && url.pathname.startsWith('/api/agent/jobs/')) return send(404, { error: 'Job tidak ditemukan' });
      if (req.method === 'GET' && url.pathname === '/api/agent/contacts') return send(200, [{ name: 'Rekan A', role: 'Staf', timezone: 'Asia/Jakarta', kind: 'internal' }]);
      return send(404, { error: 'Endpoint agent tidak dikenal.' });
    });
    fake.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${fake.address().port}`;
      resolve();
    });
  });
}

/* -------------------------------------------------------------- MCP client */

let child;
let nextId = 1;
const waiting = new Map();
const stdoutLines = [];

function startMcp() {
  child = spawn(process.execPath, [MCP], { env: { ...process.env, BEREZZ_URL: baseUrl }, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.on('data', () => {}); // logs belong on stderr; drain them
  createInterface({ input: child.stdout }).on('line', (line) => {
    stdoutLines.push(line);
    const msg = JSON.parse(line); // every stdout line must be valid JSON-RPC
    const w = waiting.get(msg.id);
    if (w) {
      waiting.delete(msg.id);
      w(msg);
    }
  });
}

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${method}`)), 10000);
    waiting.set(id, (m) => {
      clearTimeout(t);
      resolve(m);
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

const notify = (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);

before(async () => {
  await startFake();
  startMcp();
});

after(async () => {
  child.stdin.end();
  await new Promise((r) => child.once('exit', r));
  await new Promise((r) => fake.close(r));
});

/* ------------------------------------------------------------------- tests */

test('initialize returns protocol version, tools capability and instructions', async () => {
  const res = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
  assert.equal(res.error, undefined);
  assert.equal(res.result.protocolVersion, '2025-06-18');
  assert.ok(res.result.capabilities.tools);
  assert.equal(res.result.serverInfo.name, 'berezz');
  assert.match(res.result.instructions, /approve/i);
  notify('notifications/initialized');
  const ping = await rpc('ping');
  assert.deepEqual(ping.result, {});
});

test('tools/list exposes exactly the 5 tools and nothing that approves, sends or undoes', async () => {
  const res = await rpc('tools/list', {});
  const names = res.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['berezz_create_job', 'berezz_find_contacts', 'berezz_get_job', 'berezz_list_jobs', 'berezz_propose_plan']);
  for (const n of names) assert.doesNotMatch(n, /approve|send|undo/i);
  for (const t of res.result.tools) assert.equal(t.inputSchema.type, 'object');
  const propose = res.result.tools.find((t) => t.name === 'berezz_propose_plan');
  assert.match(propose.description, /source_quote/);
});

test('berezz_propose_plan forwards the plan body to POST /api/agent/jobs', async () => {
  received.length = 0;
  const text = 'Tolong kirim email ke Rekan A soal laporan, dan buat tugas cek anggaran.';
  const actions = [
    { type: 'email', source_quote: 'kirim email ke Rekan A soal laporan', subject: 'Laporan', body: '', recipients: ['Rekan A'] },
    { type: 'task', source_quote: 'buat tugas cek anggaran', title: 'Cek anggaran' },
  ];
  const res = await rpc('tools/call', {
    name: 'berezz_propose_plan',
    arguments: { text, actions, requester: 'Peminta B', channel: 'WeCom', attachments: [{ name: 'notulen.txt', text: 'isi' }], planner_name: 'Planner WorkBuddy (uji)' },
  });
  assert.equal(res.error, undefined);
  assert.notEqual(res.result.isError, true);
  assert.equal(received.length, 1);
  const { method, url, body } = received[0];
  assert.equal(method, 'POST');
  assert.equal(url, '/api/agent/jobs');
  assert.deepEqual(body, {
    text,
    requester: 'Peminta B',
    channel: 'WeCom',
    attachments: [{ name: 'notulen.txt', text: 'isi' }],
    plan: { actions },
    plannerName: 'Planner WorkBuddy (uji)',
  });
  const out = res.result.content[0];
  assert.equal(out.type, 'text');
  assert.match(out.text, /JOB-0001/);
  assert.match(out.text, /#\/inbox\/JOB-0001/);
});

test('read tools hit the agent endpoints', async () => {
  received.length = 0;
  const list = await rpc('tools/call', { name: 'berezz_list_jobs', arguments: {} });
  assert.match(list.result.content[0].text, /JOB-0001/);
  const get = await rpc('tools/call', { name: 'berezz_get_job', arguments: { job_id: 'JOB-0001' } });
  assert.notEqual(get.result.isError, true);
  const contacts = await rpc('tools/call', { name: 'berezz_find_contacts', arguments: { query: 'rekan a' } });
  assert.match(contacts.result.content[0].text, /Rekan A/);
  assert.deepEqual(received.map((r) => `${r.method} ${r.url}`), ['GET /api/agent/jobs', 'GET /api/agent/jobs/JOB-0001', 'GET /api/agent/contacts?q=rekan%20a']);
});

test('HTTP errors come back as isError tool results', async () => {
  const rejected = await rpc('tools/call', { name: 'berezz_create_job', arguments: { text: 'GAGAL' } });
  assert.equal(rejected.error, undefined);
  assert.equal(rejected.result.isError, true);
  assert.match(rejected.result.content[0].text, /HTTP 422/);
  assert.match(rejected.result.content[0].text, /NO_ACTIONS/);

  const missing = await rpc('tools/call', { name: 'berezz_get_job', arguments: { job_id: 'JOB-9999' } });
  assert.equal(missing.result.isError, true);
  assert.match(missing.result.content[0].text, /404/);
});

test('unreachable Berezz server yields a helpful isError result', async () => {
  // Separate MCP process pointed at a closed port.
  const probe = createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const deadUrl = `http://127.0.0.1:${probe.address().port}`;
  await new Promise((r) => probe.close(r));

  const p = spawn(process.execPath, [MCP], { env: { ...process.env, BEREZZ_URL: deadUrl }, stdio: ['pipe', 'pipe', 'ignore'] });
  const line = await new Promise((resolve) => {
    createInterface({ input: p.stdout }).once('line', resolve);
    p.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'berezz_list_jobs', arguments: {} } })}\n`);
  });
  p.stdin.end();
  const msg = JSON.parse(line);
  assert.equal(msg.result.isError, true);
  assert.match(msg.result.content[0].text, /tidak berjalan/);
  assert.match(msg.result.content[0].text, /npm start/);
});

test('protocol errors: unknown method and unknown tool', async () => {
  const unknownMethod = await rpc('resources/list', {});
  assert.equal(unknownMethod.error.code, -32601);
  const unknownTool = await rpc('tools/call', { name: 'berezz_approve', arguments: {} });
  assert.equal(unknownTool.error.code, -32602);
  // Every line written to stdout so far was a JSON-RPC message.
  for (const l of stdoutLines) assert.equal(JSON.parse(l).jsonrpc, '2.0');
});
