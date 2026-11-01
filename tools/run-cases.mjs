/**
 * Evidence runner for the 20 team-made test cases.
 *
 * 1. Runs every case headlessly against the engine (tests/lib/cases.mjs) — this is
 *    the PASS/FAIL verdict, identical to `npm test`.
 * 2. Replays the same case against the real Berezz server and UI in Chrome and saves
 *    screenshots to screenshots/ (plan, approval screen, end state, audit).
 * 3. Writes docs/test-results.md and renders docs/architecture.png and docs/cover.png.
 *
 * Usage: npm run build && node tools/run-cases.mjs [T01 T05 …]
 * Needs Google Chrome (or CHROME_PATH) and playwright-core (devDependency).
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';
import * as C from '../tests/lib/cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = join(ROOT, 'screenshots');
const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;
const UNKNOWN = '__belum_pasti__';
const only = process.argv.slice(2);
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/* ------------------------------------------------------------ server */

const dataFile = join(tmpdir(), `berezz-cases-${process.pid}.json`);
const server = spawn(process.execPath, [join(ROOT, 'server.mjs'), '--port', String(PORT), '--data', dataFile, '--test-clock'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => { if (String(d).includes('berjalan')) resolve(); });
  server.on('exit', (c) => reject(new Error(`server berhenti (${c})`)));
});

let token = '';
async function api(path, method = 'GET', body) {
  const res = await fetch(BASE + path, { method, headers: { 'content-type': 'application/json', 'x-berezz-token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/* ------------------------------------------------------------ browser */

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(e.message));

async function shot(name, fullPage = true) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(SHOTS, name), fullPage });
  return `screenshots/${name}`;
}

async function open(hash) {
  // Always a full load: job ids repeat after each workspace reset, and a hash-only
  // navigation would keep the previous case's job in the page state.
  await page.goto('about:blank');
  await page.goto(`${BASE}/${hash}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
}

/* ------------------------------------------------------------ replay */

const datasetText = readFileSync(join(ROOT, 'datasets/organisasi-uji/dataset.json'), 'utf8');
const { organization } = C.loadDataset();
const lampiran = (p) => ({ name: p.split('/').pop(), text: readFileSync(join(ROOT, 'datasets/organisasi-uji', p), 'utf8') });

async function resetWorkspace(caseDef) {
  token = (await (await fetch(`${BASE}/api/bootstrap`)).json()).token;
  await api('/api/workspace', 'DELETE');
  const settings = C.buildSettings(caseDef, organization);
  await api('/api/settings', 'PUT', { ...settings, orgDomains: settings.orgDomains, operatorName: settings.operatorName || 'Nadia Putri', operatorRole: settings.operatorRole || 'Admin operasional' });
  await api('/api/dataset/import', 'POST', { fileName: 'dataset.json', text: datasetText });
}

function pickValue(q, step) {
  if (step.unknown) return UNKNOWN;
  if (step.value !== undefined) return String(step.value);
  if (step.option !== undefined) return q.options[step.option]?.value;
  if (step.match) {
    const m = String(step.match).toLowerCase();
    return q.options.find((o) => `${o.label} ${o.detail || ''} ${o.tag || ''}`.toLowerCase().includes(m))?.value;
  }
  return q.options[0]?.value;
}

async function replay(caseDef) {
  const shots = [];
  const notes = [];
  await resetWorkspace(caseDef);
  const inp = caseDef.input;
  const created = await api('/api/jobs', 'POST', {
    text: inp.text,
    requester: inp.requester,
    channel: inp.channel,
    attachments: (inp.attachments || []).map(lampiran),
    plan: inp.plan || undefined,
    plannerName: inp.planner || undefined,
    planner: 'rules',
  });
  if (!created.ok) {
    // Rejected input: show it the way a person meets it, on the New job screen.
    await open('#/new');
    await page.fill('#req-text', inp.text || '');
    await page.click('[data-form="newjob"] button[type="submit"]');
    await page.waitForTimeout(500);
    shots.push(await shot(`${caseDef.id}-1-ditolak.png`, false));
    for (const [i, v] of (caseDef.variants || []).entries()) {
      await open('#/new');
      await page.fill('#req-text', v.text || '');
      await page.click('[data-form="newjob"] button[type="submit"]');
      await page.waitForTimeout(500);
      shots.push(await shot(`${caseDef.id}-${i + 2}-varian.png`, false));
    }
    return { shots, notes: [`Server menolak input: ${created.data?.error?.message || created.status}`] };
  }
  const jobId = created.data.job.id;
  await open(`#/inbox/${jobId}`);
  shots.push(await shot(`${caseDef.id}-1-rencana.png`));

  let shotApproval = false;
  for (const step of caseDef.steps || []) {
    const job = (await api(`/api/jobs/${jobId}`)).data;
    const a = job.session.actions.find((x) => x.id === step.action);
    const call = async (verb, body) => {
      const r = await api(`/api/jobs/${jobId}/actions/${step.action}/${verb}`, 'POST', body);
      if (!r.ok && !step.expectError) notes.push(`${step.do} ${step.action}: ${r.data?.error}`);
      if (r.ok && step.expectError) notes.push(`${step.do} ${step.action}: server menerima, padahal engine diharapkan menolak`);
      return r;
    };
    if (step.do === 'answer') {
      const q = a?.questions?.[0];
      if (!q || (step.kind && q.kind !== step.kind)) { if (!step.optional) notes.push(`tidak ada pertanyaan ${step.kind || ''} di ${step.action}`); continue; }
      await call('answer', { questionId: q.id, value: C.answerValue ? C.answerValue(q, step, step.action) : pickValue(q, step) });
    } else if (step.do === 'ack') {
      await call('ack', { code: step.code, value: true });
    } else if (step.do === 'approve') {
      if (!shotApproval && a && ['pending_approval', 'approved'].includes(a.status)) {
        await open(`#/inbox/${jobId}`);
        const btn = page.locator(`[data-act="review"][data-a="${step.action}"]`);
        if (await btn.count()) {
          await btn.first().click();
          await page.waitForTimeout(300);
          shots.push(await shot(`${caseDef.id}-2-persetujuan.png`, false));
          await page.keyboard.press('Escape');
          shotApproval = true;
        }
      }
      // The server approves and enqueues in one step (the UI has a single "Setujui" button).
      await call('approve', { version: step.version ?? a?.version });
    } else if (step.do === 'enqueue') {
      // Server: "Setujui" already enqueues. A refused enqueue is shown by approving a stale version instead.
    } else if (step.do === 'edit') {
      if (a?.status === 'queued') {
        // In the app an approved action is already queued: the person undoes it first.
        await call('undo', {});
        notes.push(`${step.action} sudah di antrean, jadi diurungkan dulu sebelum disunting (alur di aplikasi)`);
      }
      await call('edit', { patch: step.patch });
    } else if (step.do === 'cancel') {
      await call('cancel', { reason: 'Dibatalkan (uji)' });
    } else if (step.do === 'undo') {
      if (step.afterSeconds) await api('/api/test/advance', 'POST', { seconds: step.afterSeconds });
      await call('undo', {});
    } else if (step.do === 'settle') {
      await api('/api/test/advance', 'POST', { seconds: step.afterSeconds || 61 });
    }
  }
  const final = (await api(`/api/jobs/${jobId}`)).data;
  const touchedQueue = (caseDef.steps || []).some((s) => ['approve', 'undo', 'settle'].includes(s.do));
  await open(`#/inbox/${jobId}`);
  shots.push(await shot(`${caseDef.id}-3-hasil.png`));
  if (touchedQueue) { await open('#/queue'); shots.push(await shot(`${caseDef.id}-4-antrean.png`)); }
  if (/audit/i.test(caseDef.title) || caseDef.id === 'T20') { await open(`#/history/${jobId}`); shots.push(await shot(`${caseDef.id}-5-audit.png`)); }
  return { shots, notes, final };
}

/* ------------------------------------------------------------ run */

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
const cases = C.loadCases().filter((c) => !only.length || only.includes(c.id));
const rows = [];
for (const c of cases) {
  const head = C.runCaseHeadless(c);
  let ev = { shots: [], notes: [] };
  try { ev = await replay(c); } catch (e) { ev.notes.push(`replay gagal: ${e.message}`); }
  rows.push({ c, pass: head.failures.length === 0, failures: head.failures, ...ev });
  console.log(`${c.id} ${head.failures.length ? 'FAIL' : 'PASS'} · ${ev.shots.length} screenshot${ev.notes.length ? ` · ${ev.notes.join('; ')}` : ''}`);
}

// Submission images
await page.setViewportSize({ width: 1696, height: 900 });
await page.goto(pathToFileURL(join(ROOT, 'docs/architecture.html')).href);
await page.waitForTimeout(400);
await page.locator('.canvas').screenshot({ path: join(ROOT, 'docs/architecture.png') });
await page.setViewportSize({ width: 1520, height: 864 });
await page.goto(pathToFileURL(join(ROOT, 'docs/cover.html')).href);
await page.waitForTimeout(400);
await page.locator('.cover').screenshot({ path: join(ROOT, 'docs/cover.png') });

await browser.close();
server.kill();
rmSync(dataFile, { force: true });

/* ------------------------------------------------------------ report */

if (!only.length) {
  const passed = rows.filter((r) => r.pass).length;
  const date = new Date().toISOString().slice(0, 10);
  const md = [
    '# Hasil uji Berezz',
    '',
    `Dijalankan ${date} dengan \`node tools/run-cases.mjs\`. **${passed} dari ${rows.length} test case lulus**${passed < rows.length ? `, ${rows.length - passed} gagal (lihat catatan)` : ''}.`,
    '',
    '> **Label:** test case dan dataset (`datasets/organisasi-uji`, organisasi fiktif) **dibuat tim Berezz** dengan gaya contoh test di handbook, karena dataset dan test resmi panitia belum diterima. Ganti `tests/cases/cases.json` dan dataset bila test resmi tersedia; runner yang sama bisa dipakai.',
    '',
    'Cara kerja: setiap case dijalankan dua kali. (1) Langsung ke engine dengan jam virtual — ini yang menentukan PASS/FAIL, sama dengan `npm test`. (2) Diputar ulang lewat server dan UI Berezz sungguhan di Chrome untuk screenshot. Di server, tombol Setujui langsung memasukkan aksi ke antrean 60 detik, dan waktu dimajukan dengan jam uji (`--test-clock`).',
    '',
    `Error JavaScript di halaman selama run: ${consoleErrors.length ? consoleErrors.map((e) => `\`${e}\``).join(', ') : 'tidak ada'}.`,
    '',
    '| ID | Test | Cakupan handbook | Hasil | Screenshot |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.c.id} | ${r.c.title.replace(/\|/g, '/')} | ${String(r.c.handbook || '').replace(/\|/g, '/')} | **${r.pass ? 'PASS' : 'FAIL'}** | ${r.shots.map((s, i) => `[${i + 1}](../${s})`).join(' ')} |`),
    '',
    '## Rincian per test',
    '',
    ...rows.flatMap((r) => [
      `### ${r.c.id} — ${r.c.title}`,
      '',
      `- **Input:** ${String(r.c.input.text || '(kosong)').replace(/\n/g, ' ')}`,
      r.c.input.attachments?.length ? `- **Lampiran:** ${r.c.input.attachments.join(', ')}` : null,
      r.c.input.plan ? `- **Rencana dari agent/model:** ${r.c.input.plan.length} aksi (${r.c.input.planner || 'planner model'})` : null,
      (r.c.steps || []).length ? `- **Langkah:** ${(r.c.steps || []).map((s) => `${s.do}${s.action ? ` ${s.action}` : ''}${s.match ? ` "${s.match}"` : ''}${s.unknown ? ' (belum pasti)' : ''}${s.afterSeconds ? ` +${s.afterSeconds}s` : ''}`).join(' → ')}` : null,
      `- **Perilaku yang diharapkan:** ${r.c.expected}`,
      `- **Hasil:** ${r.pass ? 'PASS' : `FAIL — ${r.failures.join('; ')}`}`,
      r.notes.length ? `- **Catatan replay UI:** ${r.notes.join('; ')}` : null,
      `- **Screenshot:** ${r.shots.map((s) => `[${s.split('/').pop()}](../${s})`).join(', ')}`,
      '',
    ].filter((x) => x !== null)),
    '## Yang belum diuji',
    '',
    '- Test resmi panitia dan dataset resmi (belum diterima).',
    '- Planner model (API kompatibel OpenAI) dengan kunci sungguhan, dan agent WorkBuddy sungguhan; integrasi MCP diuji dengan server palsu (`tests/mcp.test.mjs`).',
    '- Pengenalan suara browser untuk voice note (tergantung Chrome/Edge dan mikrofon).',
    '- Konektor nyata (semua konektor simulasi).',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'docs/test-results.md'), md);
  console.log(`\n${passed}/${rows.length} PASS · docs/test-results.md ditulis`);
}
process.exit(0);
