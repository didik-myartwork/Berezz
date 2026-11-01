import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { WorkspaceStore } from '../app/persistence.js';

function fakeFiles(initial = {}) {
  const files = new Map(Object.entries(initial));
  let failNextWrite = false;
  const io = {
    exists: (path) => files.has(path),
    read: async (path) => {
      if (!files.has(path)) throw new Error('ENOENT');
      return files.get(path);
    },
    mkdirParent: async () => {},
    write: async (path, contents) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('disk full');
      }
      files.set(path, contents);
    },
    rename: async (from, to) => {
      if (!files.has(from)) throw new Error('temporary snapshot missing');
      files.set(to, files.get(from));
      files.delete(from);
    },
    failNextWrite() { failNextWrite = true; },
    files,
  };
  return io;
}

test('missing workspace initializes in memory without writing until a mutation', async () => {
  const io = fakeFiles();
  const store = new WorkspaceStore('/data/workspace.json', io);
  const initial = await store.load(() => ({ version: 1, jobs: [] }), (raw) => raw);
  assert.deepEqual(initial, { version: 1, jobs: [] });
  assert.equal(io.files.size, 0);
});

test('corrupt workspace fails closed and keeps the original bytes intact', async () => {
  const original = '{broken json';
  const io = fakeFiles({ '/data/workspace.json': original });
  const store = new WorkspaceStore('/data/workspace.json', io);
  await assert.rejects(
    store.load(() => ({ version: 1, jobs: [] }), (raw) => raw),
    /Berkas asli dipertahankan/,
  );
  assert.equal(io.files.get('/data/workspace.json'), original);
  assert.equal(io.files.size, 1);
});

test('server refuses to start on a corrupt workspace instead of serving an empty one', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'berezz-workspace-'));
  const dataFile = join(directory, 'workspace.json');
  const original = '{broken json';
  await writeFile(dataFile, original);

  try {
    const child = spawn(process.execPath, ['server.mjs', '--data', dataFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(code, 1);
    assert.match(stderr, /Berkas asli dipertahankan/);
    assert.equal(await readFile(dataFile, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('valid JSON with unsupported structure also fails closed', async () => {
  const io = fakeFiles({ '/data/workspace.json': JSON.stringify({ version: 99 }) });
  const store = new WorkspaceStore('/data/workspace.json', io);
  await assert.rejects(
    store.load(() => ({ version: 1, jobs: [] }), (raw) => {
      if (raw.version !== 1 || !Array.isArray(raw.jobs)) throw new Error('unsupported workspace schema');
      return raw;
    }),
    /unsupported workspace schema/,
  );
  assert.equal(io.files.get('/data/workspace.json'), JSON.stringify({ version: 99 }));
});

test('atomic save writes a private temporary snapshot then renames it into place', async () => {
  const io = fakeFiles();
  const store = new WorkspaceStore('/data/workspace.json', io);
  await store.save({ version: 1, jobs: [{ id: 'JOB-1' }] });
  assert.deepEqual(JSON.parse(io.files.get('/data/workspace.json')), { version: 1, jobs: [{ id: 'JOB-1' }] });
  assert.deepEqual([...io.files.keys()], ['/data/workspace.json']);
});

test('failed save rejects and preserves the previous snapshot; a later retry can succeed', async () => {
  const previous = JSON.stringify({ version: 1, jobs: [{ id: 'JOB-OLD' }] });
  const io = fakeFiles({ '/data/workspace.json': previous });
  const store = new WorkspaceStore('/data/workspace.json', io);
  io.failNextWrite();
  await assert.rejects(store.save({ version: 1, jobs: [{ id: 'JOB-NEW' }] }), /disk full/);
  assert.equal(io.files.get('/data/workspace.json'), previous);
  await store.save({ version: 1, jobs: [{ id: 'JOB-RETRY' }] });
  assert.deepEqual(JSON.parse(io.files.get('/data/workspace.json')).jobs, [{ id: 'JOB-RETRY' }]);
});

test('concurrent snapshots are serialized in request order', async () => {
  const io = fakeFiles();
  const store = new WorkspaceStore('/data/workspace.json', io);
  await Promise.all([
    store.save({ version: 1, revision: 1 }),
    store.save({ version: 1, revision: 2 }),
    store.save({ version: 1, revision: 3 }),
  ]);
  assert.deepEqual(JSON.parse(io.files.get('/data/workspace.json')), { version: 1, revision: 3 });
  assert.deepEqual([...io.files.keys()], ['/data/workspace.json']);
});

/* ---------------------------------------------------------- save → restart */

import { emptyWorkspace, normalizeWorkspace } from '../app/workspace.js';
import * as D from '../app/dataset.js';

test('a workspace in the shape the server writes passes the startup validator', () => {
  const ws = emptyWorkspace();
  ws.settings.orgName = 'PT Uji';
  const text = readFileSync(join(process.cwd(), 'datasets/organisasi-uji/dataset.json'), 'utf8');
  ws.dataset = D.importDataset(ws.dataset, { fileName: 'dataset.json', text }).dataset;
  ws.jobs.push({ id: 'JOB-0001', title: 't', session: { rawInput: 'x', actions: [], audit: [] } });
  const reloaded = normalizeWorkspace(JSON.parse(JSON.stringify(ws)));
  assert.equal(reloaded.settings.orgName, 'PT Uji');
  assert.equal(reloaded.dataset.contacts.length, ws.dataset.contacts.length);
  assert.equal(reloaded.jobs[0].id, 'JOB-0001');
  assert.throws(() => normalizeWorkspace({ ...ws, jobs: [{ title: 'tanpa id' }] }), /Job ke-1/);
});

async function startServer(dataFile, port) {
  const child = spawn(process.execPath, ['server.mjs', '--data', dataFile, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  await new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8').on('data', (chunk) => { if (chunk.includes('berjalan')) resolve(); });
    child.once('exit', (code) => reject(new Error(`server berhenti (kode ${code}): ${stderr}`)));
  });
  const base = `http://127.0.0.1:${port}`;
  const { token } = await (await fetch(`${base}/api/bootstrap`)).json();
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-berezz-token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const stop = () => new Promise((resolve) => { child.once('exit', resolve); child.kill(); });
  return { call, stop };
}

test('server restarts on the workspace it saved itself, keeping settings, data and jobs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'berezz-restart-'));
  const dataFile = join(directory, 'workspace.json');
  const port = 18000 + Math.floor(Math.random() * 1000);
  try {
    const first = await startServer(dataFile, port);
    assert.equal((await first.call('PUT', '/api/settings', { orgName: 'PT Restart' })).status, 200);
    const text = await readFile(join(process.cwd(), 'datasets/organisasi-uji/dataset.json'), 'utf8');
    assert.equal((await first.call('POST', '/api/dataset/import', { fileName: 'dataset.json', text })).status, 200);
    const job = await first.call('POST', '/api/jobs', { text: 'Buat tugas revisi proposal untuk Rina Senin.', channel: 'chat' });
    assert.equal(job.status, 201);
    await first.stop();

    const second = await startServer(dataFile, port);
    const boot = await second.call('GET', '/api/bootstrap');
    await second.stop();
    assert.equal(boot.data.settings.orgName, 'PT Restart');
    assert.ok(boot.data.dataset.contacts.length > 0);
    assert.deepEqual(boot.data.jobs.map((j) => j.id), [job.data.job.id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
