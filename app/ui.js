/**
 * Berezz UI — a renderer over the local server. Business rules live in the engine,
 * approval runs on the server; this file only shows state and sends the person's
 * decisions. The quick preview on "Job baru" runs the same engine locally on a
 * throwaway session and never reaches a connector.
 */
import * as E from './engine.js';
import { icon } from './icons.js';
import { select, multiSelect, datePicker, timeSelect, initControls, closeControl } from './controls.js';
import { renderGuide as guideHTML } from './guide.js';
function speechRecognitionConstructor() {
    const speechWindow = window;
    return speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
}
const S = {
    boot: null,
    token: '',
    job: null,
    histJob: null,
    route: { name: 'inbox', id: null, filter: null },
    expanded: new Set(),
    editing: null,
    newContactFor: null,
    dlg: null,
    contactQuery: '',
    contactFilter: 'all',
    contactSel: null,
    histQuery: '',
    histStatus: 'all',
    draft: { mode: 'text', text: '', requester: '', channel: 'Chat tim', attachments: [], planner: 'rules', sourceFile: '' },
    listening: false,
    busy: false,
    storageWarningShown: false,
    connectorsExpanded: false,
    lastSig: '',
};
/* ------------------------------------------------------------ helpers */
const $ = (sel) => {
    const element = document.querySelector(sel);
    if (!element)
        throw new Error(`Elemen Berezz tidak ditemukan: ${sel}`);
    return element;
};
const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => HTML_ENTITIES[c] ?? c);
const ico = (n, size = 15) => icon(n, size);
const plural = (n, w) => `${n} ${w}`;
const hhmm = (iso) => { if (!iso)
    return ''; const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`; };
const t = (s) => String(s || '').replace(':', '.');
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
const firstName = (n) => String(n || '').split(' ')[0] || '';
/** "Budi Santoso (Manajer Operasional)" → "Budi S." */
const shortName = (n) => {
    const words = String(n || '').replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
    return words.length ? [words[0], ...words.slice(1, 2).map((w) => `${w[0]}.`)].join(' ') : null;
};
function dayLabel(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    const today = new Date();
    const k = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    if (k(d) === k(today))
        return 'Hari ini';
    if (k(d) === k(y))
        return 'Kemarin';
    return E.humanDate(E.isoDate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))));
}
function shortWhen(iso) {
    const lbl = dayLabel(iso);
    return lbl === 'Hari ini' ? hhmm(iso) : lbl === 'Kemarin' ? 'Kmrn' : E.shortDate(E.isoDate(new Date(Date.UTC(new Date(iso).getFullYear(), new Date(iso).getMonth(), new Date(iso).getDate()))));
}
function boot() {
    if (!S.boot)
        throw new Error('Data awal Berezz belum dimuat.');
    return S.boot;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function toast(msg, kind = 'ok', action) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast${kind === 'err' ? ' err' : ''}`;
    el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
    if (action)
        el.querySelector('button')?.addEventListener('click', () => { action.run(); el.remove(); });
    box.appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 8000 : 5000);
}
async function api(path, opts = {}) {
    const res = await fetch(path, {
        method: opts.method || 'GET',
        headers: { 'content-type': 'application/json', 'x-berezz-token': S.token },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = typeof data.error === 'string' ? data.error : data.error?.message || data.report?.errors?.join(' ') || `HTTP ${res.status}`;
        throw Object.assign(new Error(msg), { data });
    }
    return data;
}
async function loadBoot() {
    const b = await api('/api/bootstrap');
    S.token = b.token;
    S.boot = b;
}
async function loadJob(id) {
    if (!id) {
        S.job = null;
        return;
    }
    try {
        S.job = await api(`/api/jobs/${encodeURIComponent(id)}`);
    }
    catch {
        S.job = null;
    }
}
async function run(fn, okMsg) {
    if (S.busy)
        return null;
    S.busy = true;
    try {
        const out = await fn();
        if (okMsg)
            toast(okMsg);
        return out;
    }
    catch (e) {
        toast(errorMessage(e), 'err');
        return null;
    }
    finally {
        S.busy = false;
    }
}
/* ------------------------------------------------------------ routing */
function parseRoute() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const [name, ...rest] = h.split('/');
    const arg = rest.join('/') || null;
    switch (name) {
        case 'mine': return { name: 'inbox', id: arg, filter: 'mine' };
        case 'channel': return { name: 'inbox', id: rest[1] || null, filter: `ch:${rest[0] || ''}` };
        case 'new':
        case 'queue':
        case 'data':
        case 'contacts':
        case 'settings':
        case 'setup':
        case 'guide': return { name, id: null, filter: null };
        case 'history': return { name: 'history', id: arg, filter: null };
        default: return { name: 'inbox', id: arg, filter: null };
    }
}
function go(hash) {
    if (location.hash === hash)
        render();
    else
        location.hash = hash;
}
function inboxHash(id) {
    const f = S.route.filter;
    if (f === 'mine')
        return `#/mine/${id}`;
    if (f?.startsWith('ch:'))
        return `#/channel/${encodeURIComponent(f.slice(3))}/${id}`;
    return `#/inbox/${id}`;
}
async function onRoute() {
    S.route = parseRoute();
    S.editing = null;
    S.newContactFor = null;
    if (S.route.name === 'inbox') {
        const list = filteredJobs();
        const id = S.route.id || list[0]?.id || null;
        if (id && (!S.job || S.job.id !== id))
            await loadJob(id);
        if (!id)
            S.job = null;
    }
    if (S.route.name === 'history') {
        const id = S.route.id;
        S.histJob = id ? await api(`/api/jobs/${encodeURIComponent(id)}`).catch(() => null) : null;
    }
    render();
    $('#view')?.focus({ preventScroll: true });
}
/* ------------------------------------------------------------ derived */
function orgReady() { return Boolean(S.boot?.settings.orgName); }
function contactsReady() { return (S.boot?.dataset.contacts || []).length > 0; }
function filteredJobs() {
    const jobs = S.boot?.jobs || [];
    const f = S.route.filter;
    if (f === 'mine')
        return jobs.filter((j) => j.group === 'mine');
    if (f?.startsWith('ch:'))
        return jobs.filter((j) => j.channel === f.slice(3));
    return jobs;
}
function channels() {
    const m = new Map();
    for (const j of S.boot?.jobs || [])
        m.set(j.channel, (m.get(j.channel) || 0) + 1);
    return [...m.entries()];
}
function glyph(job) {
    const c = job.counts;
    if (c.escalated)
        return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" role="img" aria-label="Eskalasi"><circle cx="12" cy="12" r="10" fill="var(--red)"/><path d="M12 7.5V12.5M12 16.2H12.01" stroke="#fff" stroke-linecap="round" stroke-width="2.2"/></svg>`;
    if (c.answer)
        return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" role="img" aria-label="Perlu jawaban"><circle cx="12" cy="12" r="10" stroke="var(--amber)" stroke-width="2"/><path d="M9.5 9.5C9.5 8.12 10.62 7 12 7C13.38 7 14.5 8.12 14.5 9.5C14.5 10.36 14.07 11.11 13.41 11.56C12.73 12.03 12 12.67 12 13.5M12 17H12.01" stroke="var(--amber)" stroke-linecap="round" stroke-width="2"/></svg>`;
    if (c.approve)
        return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" role="img" aria-label="Siap disetujui"><circle cx="12" cy="12" r="10" stroke="var(--accent)" stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="var(--accent)"/></svg>`;
    if (c.queued)
        return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" role="img" aria-label="Di antrean"><circle cx="12" cy="12" r="10" stroke="var(--text-3)" stroke-width="2"/><path d="M12 7.5V12L14.5 14" stroke="var(--text-3)" stroke-linecap="round" stroke-width="2"/></svg>`;
    if (c.done)
        return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" role="img" aria-label="Selesai"><circle cx="12" cy="12" r="10" fill="var(--green)"/><path d="M7.5 12.5L10.5 15.5L16.5 9" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/></svg>`;
    return `<svg class="glyph" width="14" height="14" viewBox="0 0 24 24" fill="none" role="img" aria-label="Ditutup"><circle cx="12" cy="12" r="9" stroke="var(--text-4)" stroke-width="2.4"/><path d="M8 12H16" stroke="var(--text-4)" stroke-linecap="round" stroke-width="2.4"/></svg>`;
}
function nextToken(job) {
    const c = job.counts;
    if (c.escalated)
        return `<span class="c-red">butuh keputusan</span>`;
    const parts = [];
    if (c.answer)
        parts.push(`<span class="c-amber">${c.answer} pertanyaan</span>`);
    if (c.approve)
        parts.push(`<span class="c-iris">${c.approve} perlu disetujui</span>`);
    if (parts.length)
        return parts.join('<span class="muted"> · </span>');
    if (c.queued)
        return `<span class="muted">${c.queued} di antrean</span>`;
    return `<span class="muted">${c.done}/${c.total}</span>`;
}
const STATUS_TAG = {
    needs_clarification: ['Perlu jawaban', 'tag-amber'],
    pending_approval: ['Menunggu persetujuan', 'tag-iris'],
    approved: ['Disetujui', 'tag-green'],
    queued: ['Di antrean', ''],
    simulated: ['Terkirim · mock', 'tag-green'],
    undone: ['Diurungkan', ''],
    cancelled: ['Dibatalkan', ''],
    escalated: ['Butuh keputusan', 'tag-red'],
};
const TYPE_ICON = { email: 'mail', meeting: 'calendar', task: 'task' };
/**
 * The apps the simulated connectors stand in for. Shown so the flow reads like a real
 * office setup, and ALWAYS labelled mock: nothing reaches Gmail, Google Calendar or Trello.
 */
const CONNECTOR = {
    email: { app: 'Gmail', icon: 'google', color: '#ea4335', kind: 'Email', none: 'Tidak ada email yang benar-benar terkirim' },
    meeting: { app: 'Google Calendar', icon: 'google', color: '#4285f4', kind: 'Kalender', none: 'Tidak ada undangan kalender sungguhan' },
    task: { app: 'Trello', icon: 'trello', color: '#0c66e4', kind: 'Task board', none: 'Tidak ada kartu Trello sungguhan' },
};
const ADAPTER_TYPE = { email: 'email', kalender: 'meeting', 'task board': 'task' };
const appIcon = (t, size = 14) => `<span class="app-ico" style="color:${CONNECTOR[t].color}" aria-hidden="true">${ico(CONNECTOR[t].icon, size)}</span>`;
const appTag = (t) => `<span class="tag app-tag">${appIcon(t, 12)}${esc(CONNECTOR[t].app)}<span class="mock">· mock</span></span>`;
const TYPE_LABEL = { email: 'Email', meeting: 'Rapat', task: 'Tugas' };
function actionTitle(a) {
    if (a.type === 'email')
        return a.fields.subject || `Email ke ${(a.fields.to || []).map((x) => firstName(x.name)).join(', ') || '…'}`;
    return a.fields.title || TYPE_LABEL[a.type];
}
function peopleOf(a) {
    if (a.type === 'email')
        return a.fields.to || [];
    if (a.type === 'meeting')
        return a.fields.participants || [];
    return a.fields.owner ? [a.fields.owner] : [];
}
/* ------------------------------------------------------------ sidebar */
/** One icon per intake channel so the sidebar entries stay distinguishable. */
function channelIcon(ch) {
    if (/voice/i.test(ch))
        return 'mic';
    if (/notulen/i.test(ch))
        return 'note';
    if (/email/i.test(ch))
        return 'mail';
    if (/workbuddy/i.test(ch))
        return 'agent';
    if (/teks|tempel/i.test(ch))
        return 'text';
    if (/berkas|unggah/i.test(ch))
        return 'file';
    return 'chat';
}
function renderSide() {
    const b = boot();
    const jobs = b.jobs;
    const r = S.route;
    const cur = (cond) => (cond ? 'aria-current="page"' : '');
    const mine = jobs.filter((j) => j.group === 'mine').length;
    const queued = b.queue.filter((q) => q.action.status === 'queued').length;
    const dataWarn = b.dataset.holidays === null || b.dataset.rules.isDefault;
    const contactWarn = !contactsReady() || b.dataset.contacts.some((c) => !c.timezone);
    const org = b.settings.orgName;
    const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const side = $('#side');
    side.innerHTML = `
    <a class="brand" href="#/settings" title="Pengaturan organisasi">
      <svg class="brand-mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8" fill="currentColor"/><path d="M8.5 14.4l3.6 3.6 7.4-8" fill="none" stroke="var(--on-primary)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="brand-text"><span class="brand-name">Berezz</span><span class="brand-org${org ? '' : ' unset'}">${esc(org || 'Atur nama organisasi')}</span></span>
    </a>
    <div class="side-actions">
      <a class="btn btn-primary btn-lg btn-block" href="#/new">${ico('add', 16)}Job baru</a>
      <label class="search">${ico('search', 14)}<span class="sr-only">Cari job</span><input id="side-search" type="search" placeholder="Cari job atau orang" value="${esc(S.histQuery)}" /></label>
    </div>
    <div>
      <p class="nav-label">Kerja</p>
      <div class="nav">
        <a href="#/inbox" ${cur(r.name === 'inbox' && !r.filter)}>${ico('inbox', 16)}<span class="lbl">Kotak masuk</span><span class="cnt">${jobs.length || ''}</span></a>
        <a href="#/mine" ${cur(r.name === 'inbox' && r.filter === 'mine')}>${ico('clarify', 16)}<span class="lbl">Perlu tindakan saya</span>${mine ? `<span class="badge badge-amber">${mine}</span>` : ''}</a>
        <a href="#/queue" ${cur(r.name === 'queue')}>${ico('queue', 16)}<span class="lbl">Antrean kirim</span><span class="cnt">${queued || ''}</span></a>
        <a href="#/history" ${cur(r.name === 'history')}>${ico('history', 16)}<span class="lbl">Riwayat</span></a>
      </div>
    </div>
    ${channels().length ? `<div>
      <p class="nav-label">Saluran masuk</p>
      <div class="nav">${channels().map(([ch, n]) => `<a href="#/channel/${encodeURIComponent(ch)}" ${cur(r.filter === `ch:${ch}`)}>${ico(channelIcon(ch), 16)}<span class="lbl">${esc(ch)}</span><span class="cnt">${n}</span></a>`).join('')}</div>
    </div>` : ''}
    <div>
      <p class="nav-label">Kontrol</p>
      <div class="nav">
        <a href="#/contacts" ${cur(r.name === 'contacts')}>${ico('users', 16)}<span class="lbl">Kontak</span>${contactWarn ? '<span class="warn-dot" title="Kontak kosong atau ada yang belum punya zona waktu"></span>' : `<span class="cnt">${b.dataset.contacts.length}</span>`}</a>
        <a href="#/data" ${cur(r.name === 'data')}>${ico('database', 16)}<span class="lbl">Sumber data</span>${dataWarn ? '<span class="warn-dot" title="Ada data yang belum lengkap"></span>' : ''}</a>
        <a href="#/history" >${ico('audit', 16)}<span class="lbl">Jejak audit</span></a>
        <a href="#/guide" ${cur(r.name === 'guide')}>${ico('book', 16)}<span class="lbl">Panduan</span></a>
        <a href="#/settings" ${cur(r.name === 'settings')}>${ico('settings', 16)}<span class="lbl">Pengaturan</span>${org ? '' : '<span class="warn-dot" title="Organisasi belum diatur"></span>'}</a>
      </div>
    </div>
    <div class="side-foot">
      <div class="sim-card">
        <button type="button" class="connector-toggle" data-act="connector-toggle" aria-expanded="${S.connectorsExpanded}" aria-controls="connector-list">
          <span class="connector-toggle-label"><span class="dot"></span><strong>Konektor</strong></span>
          <span class="mock-badge">mock</span>
          <span class="connector-chevron" aria-hidden="true"></span>
        </button>
        <div id="connector-list" class="connector-list"${S.connectorsExpanded ? '' : ' hidden'}>
          <ul class="app-list">${['email', 'meeting', 'task'].map((t) => `<li>${appIcon(t, 15)}<span>${CONNECTOR[t].app}</span><span class="muted">mock</span></li>`).join('')}</ul>
          <p class="muted" style="font-size:12px">Data: ${b.dataset.meta.origin === 'empty' ? 'belum ada' : esc(b.dataset.meta.fileName || 'ditambah manual')}</p>
        </div>
      </div>
      <div class="me">
        <span class="avatar" aria-hidden="true">${esc(initials(b.settings.operatorName))}</span>
        <span class="me-text"><span>${esc(b.settings.operatorName || 'Nama penyetuju belum diatur')}</span><span>${esc(b.settings.operatorRole || 'Penyetuju')}</span></span>
        <button class="btn btn-ghost btn-icon" type="button" data-act="theme" aria-label="${theme === 'dark' ? 'Mode terang' : 'Mode gelap'}">${ico(theme === 'dark' ? 'sun' : 'moon', 15)}</button>
      </div>
    </div>`;
}
/* ------------------------------------------------------------ inbox */
function renderInbox() {
    const jobs = filteredJobs();
    if (!boot().jobs.length)
        return renderSetup(true);
    const groups = [
        ['mine', 'Perlu tindakan Anda'],
        ['running', 'Di antrean kirim'],
        ['done', 'Selesai'],
    ];
    const title = S.route.filter === 'mine' ? 'Perlu tindakan saya' : S.route.filter?.startsWith('ch:') ? S.route.filter.slice(3) : 'Kotak masuk';
    const list = `
    <section class="list" aria-labelledby="list-title">
      <header class="list-head"><h1 id="list-title">${esc(title)}</h1><span class="muted" style="font-size:12.5px">${jobs.length}</span><span style="flex:1"></span>
        <a class="btn btn-ghost btn-icon" href="#/new" aria-label="Job baru">${ico('add', 16)}</a></header>
      <div class="list-body" role="list">
        ${groups.map(([g, label]) => {
        const items = jobs.filter((j) => j.group === g);
        if (!items.length)
            return '';
        return `<div class="grp" role="presentation">${label} <b>${items.length}</b></div>${items.map((j) => `
            <a class="job${g === 'done' ? ' job-done' : ''}" role="listitem" href="${inboxHash(j.id)}" ${S.job?.id === j.id ? 'aria-current="true"' : ''}>
              ${glyph(j)}
              <span class="job-t">${esc(j.title)}</span>
              <span class="job-time">${esc(shortWhen(j.createdAt))}</span>
              <span class="job-m">${esc([shortName(j.requester), j.channel].filter(Boolean).join(' · '))}</span>
              <span class="job-n">${nextToken(j)}</span>
            </a>`).join('')}`;
    }).join('') || `<div class="empty"><p>Tidak ada job di tampilan ini.</p></div>`}
      </div>
    </section>`;
    return `<div class="inbox">${list}<div class="detail">${S.job ? renderJob(S.job) : `<div class="empty"><span class="empty-ico">${ico('inbox', 20)}</span><h2>Pilih job</h2><p>Pilih job di daftar untuk melihat rencananya.</p></div>`}</div></div>`;
}
function renderJob(job) {
    const s = job.session;
    const acts = s.actions;
    const groups = [
        ['answer', 'Perlu jawaban Anda', 'Tidak ada yang dikirim sebelum pertanyaannya dijawab', acts.filter((a) => a.status === 'needs_clarification')],
        ['esc', 'Butuh keputusan Anda', 'Berezz tidak bisa melanjutkan sendiri: sunting atau batalkan', acts.filter((a) => a.status === 'escalated')],
        ['approve', 'Menunggu persetujuan', 'Tinjau isinya, lalu setujui satu per satu', acts.filter((a) => ['pending_approval', 'approved'].includes(a.status))],
        ['queue', 'Di antrean kirim', `Masih bisa diurungkan sebelum hitungan ${boot().dataset.rules.undoWindowSeconds} detik habis`, acts.filter((a) => a.status === 'queued')],
        ['done', 'Selesai', '', acts.filter((a) => ['simulated', 'undone', 'cancelled'].includes(a.status))],
    ];
    // Security and reviewer problems must be visible next to the actions, not only in the side panel.
    const alerts = [
        ...s.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED').map((f) => `<b>Instruksi tersisip diabaikan</b>: “${esc((f.quote || '').slice(0, 90))}”${f.source ? ` · ${esc(f.source)}${f.line ? ` baris ${f.line}` : ''}` : ''}`),
        ...(s.review?.findings || []).filter((f) => f.severity === 'blocking').map((f) => `<b>Reviewer kedua</b>: ${esc(f.message)}`),
    ];
    const stTag = job.counts.escalated ? ['Butuh keputusan', 'tag-red'] : job.counts.answer ? ['Perlu jawaban', 'tag-amber'] : job.counts.approve ? ['Menunggu persetujuan', 'tag-iris'] : job.counts.queued ? ['Di antrean', ''] : ['Selesai', 'tag-green'];
    return `
    <header class="dhead">
      <div style="flex:1 1 360px;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="mono muted" style="font-size:11.5px">${esc(job.id)}</span>
          <span class="tag ${stTag[1]}">${stTag[0]}</span>
          <span class="muted" style="font-size:12px">rencana versi ${s.planVersion}</span>
          ${job.source === 'workbuddy' ? `<span class="tag tag-iris">${ico('agent', 12)}dari WorkBuddy</span>` : ''}
        </div>
        <h2>${esc(job.title)}</h2>
        <p class="dmeta">
          ${job.requester ? `<span class="avatar avatar-sm" aria-hidden="true">${esc(initials(job.requester))}</span><span style="color:var(--text-2)">${esc(job.requester)}</span><span>·</span>` : ''}
          <span>${esc(job.channel)}</span><span>·</span><span>${esc(dayLabel(job.createdAt))}, ${esc(hhmm(job.createdAt))}</span><span>·</span><span>Dipecah oleh ${esc((s.planner?.name || '').replace(/^Planner\s+/i, ''))}</span>
        </p>
      </div>
      <div style="display:flex;gap:6px">
        <a class="btn" href="#/history/${esc(job.id)}">${ico('audit', 15)}Audit <span class="muted" style="font-weight:400">${s.audit.length}</span></a>
        <a class="btn btn-icon" href="/api/jobs/${esc(job.id)}/audit" download aria-label="Ekspor audit job ini">${ico('download', 15)}</a>
      </div>
    </header>
    <div class="split">
      <div class="page">
        ${alerts.length ? `<div class="note-warn">${ico('shieldBlock', 14)}<span>${alerts.join('<br>')}</span></div>` : ''}
        ${groups.filter((g) => g[3].length).map(([k, label, hint, list]) => `
          <section aria-labelledby="g-${k}">
            <div class="ghead"><h3 id="g-${k}">${label}</h3><span class="n">${list.length}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div>
            <div class="box">${list.map((a) => renderAction(job, a)).join('')}</div>
          </section>`).join('')}
        <p class="lock-note">${ico('lock', 14)}Tidak ada yang dikirim sebelum Anda menyetujui aksi itu.</p>
      </div>
      ${renderRail(job)}
    </div>`;
}
function tokensFor(a) {
    const F = a.fields;
    const out = [];
    const unresolved = [...(a.ambiguousRecipients || []).map((x) => x.alias), ...(a.unknownMentions || [])];
    const ppl = peopleOf(a);
    if (ppl.length)
        out.push(`<span class="tok">${ico(ppl.length > 1 || ppl[0].members ? 'users' : 'user', 13)}${esc(ppl.map((p) => (p.members ? `${p.name} (${p.members})` : p.name)).join(', '))}</span>`);
    if (unresolved.length)
        out.push(`<span class="tok tok-warn">${ico('user', 13)}${esc(unresolved.join(', '))} belum jelas</span>`);
    else if (!ppl.length)
        out.push(`<span class="tok tok-warn">${ico('user', 13)}${a.type === 'task' ? 'Pemilik' : 'Penerima'} belum ada</span>`);
    if (ppl.some((p) => p.kind === 'external'))
        out.push(`<span class="tag tag-amber">Eksternal</span>`);
    if (a.type === 'email') {
        if (F.draftFrom && !F.contentConfirmed)
            out.push(`<span class="tag">Isi draf</span>`);
        if (!String(F.body || '').trim())
            out.push(`<span class="tok tok-warn">${ico('note', 13)}Isi belum ada</span>`);
    }
    if (a.type === 'meeting') {
        out.push(F.date ? `<span class="tok">${ico('calendar', 13)}${esc(E.shortDate(F.date))}</span>` : `<span class="tok tok-warn">${ico('calendar', 13)}tanggal ?</span>`);
        out.push(F.start ? `<span class="tok${F.timezone ? '' : ' tok-warn'}">${ico('clock', 13)}${esc(t(F.start))}${F.end ? `–${esc(t(F.end))}` : ''} ${esc(F.timezone || 'zona ?')}</span>` : `<span class="tok tok-warn">${ico('clock', 13)}jam ?</span>`);
        if (F.location)
            out.push(`<span class="tok">${ico('location', 13)}${esc(F.location)}</span>`);
    }
    if (a.type === 'task') {
        out.push(F.due ? `<span class="tok">${ico('calendar', 13)}${esc(E.shortDate(F.due))}</span>${F.dueConfidence === 'derived' ? `<span class="tok muted">dari “${esc(F.duePhrase)}”</span>` : ''}` : `<span class="tok tok-warn">${ico('calendar', 13)}tenggat ?</span>`);
    }
    return out.join('');
}
function renderAction(job, a) {
    const key = `${job.id}:${a.id}`;
    const open = S.expanded.has(key) || S.editing === key;
    const [label, cls] = STATUS_TAG[a.status];
    let end = '';
    if (['pending_approval', 'approved'].includes(a.status))
        end = `<button class="btn" type="button" data-act="review" data-a="${a.id}">Tinjau &amp; setujui</button>`;
    else if (a.status === 'queued') {
        const result = a.result;
        if (!result)
            throw new Error(`Hasil antrean ${a.id} tidak tersedia.`);
        const until = result.undoUntil;
        end = `<span class="bar" aria-hidden="true"><span data-bar="${esc(until)}" data-from="${esc(result.queuedAt)}"></span></span><span class="mono num" data-until="${esc(until)}" style="font-size:13px;font-weight:500"></span><button class="btn" type="button" data-act="undo" data-a="${a.id}">${ico('undo', 13)}Urungkan</button>`;
    }
    else if (a.status === 'simulated')
        end = `<span class="tag ${cls}">Terkirim ke ${esc(CONNECTOR[a.type].app)} <span class="mock">· mock</span></span>`;
    else
        end = `<span class="tag ${cls}">${label}</span>`;
    return `
    <article class="act" aria-labelledby="t-${a.id}">
      <span class="aico" title="${TYPE_LABEL[a.type]}">${ico(TYPE_ICON[a.type], 15)}</span>
      <div style="min-width:0">
        <div class="at-row"><p class="at" id="t-${a.id}"><span class="id">${a.id}</span><button class="t" type="button" data-act="toggle" data-a="${a.id}" aria-expanded="${open}">${esc(actionTitle(a))}</button>${a.plannedBy === 'model' ? `<span class="tag" title="Draf teks dari planner model">model</span>` : ''}</p><div class="act-end">${end}</div></div>
        <div class="toks">${tokensFor(a)}</div>
        ${a.status === 'needs_clarification' && a.questions[0] ? renderAsk(job, a) : ''}
        ${a.status === 'escalated' ? `<div class="ask"><div class="ask-q"><strong>Butuh keputusan manusia</strong><span class="muted">${esc((a.findings.find((f) => f.severity === 'blocking') || {}).message || 'Belum jelas setelah batas putaran klarifikasi.')}</span></div></div>` : ''}
        ${open ? renderMore(job, a) : ''}
      </div>
    </article>`;
}
function renderAsk(job, a) {
    const q = a.questions[0];
    const key = `${job.id}:${a.id}`;
    const round = (a.roundsByKind || {})[q.kind] || 0;
    const opts = q.options.map((o) => `
    <button class="opt${o.value === E.UNKNOWN ? ' opt-muted' : ''}" type="button" data-act="answer" data-a="${a.id}" data-q="${esc(q.id)}" data-v="${esc(o.value)}">
      <span class="radio" aria-hidden="true"></span>
      <span class="opt-main"><b>${esc(o.label)}</b>${o.detail ? `<span class="muted"> · ${esc(o.detail)}</span>` : ''}</span>
      ${o.tag ? `<span class="tag mono">${esc(o.tag)}</span>` : '<span></span>'}
    </button>`).join('');
    let input = '';
    if (q.input === 'text')
        input = `<form class="ask-form" data-form="answer" data-a="${a.id}" data-q="${esc(q.id)}"><label class="field"><span>Tulis isi pesan</span><textarea class="textarea" name="value" rows="4" required></textarea></label><div class="ask-row"><button class="btn btn-primary" type="submit">Pakai isi ini</button></div></form>`;
    if (q.input === 'line')
        input = `<form class="ask-form" data-form="answer" data-a="${a.id}" data-q="${esc(q.id)}"><div class="ask-row"><input class="input" name="value" required style="flex:1" /><button class="btn btn-primary" type="submit">Pakai</button></div></form>`;
    if (q.input === 'date')
        input = `<form class="ask-form" data-form="answer" data-a="${a.id}" data-q="${esc(q.id)}"><div class="ask-row">${datePicker({ name: 'value', value: '', label: 'Tanggal lain', placeholder: 'Pilih tanggal lain' })}<button class="btn" type="submit">Pakai tanggal ini</button></div></form>`;
    if (q.input === 'time')
        input = `<form class="ask-form" data-form="answer" data-a="${a.id}" data-q="${esc(q.id)}"><div class="ask-row">${timeSelect({ name: 'value', value: '', label: 'Jam', from: 6, to: 21 })}<button class="btn btn-primary" type="submit">Pakai jam ini</button></div></form>`;
    let add = '';
    if (q.allowNewContact) {
        add = S.newContactFor === key ? `
      <form class="ask-form" data-form="newcontact" data-a="${a.id}" data-q="${esc(q.id)}">
        <div class="grid-2">
          <label class="field"><span>Nama</span><input class="input" name="name" required value="${esc((q.mention || '').replace(/^(pak|bu|bapak|ibu|mbak|mas|kak|bang)\s+/i, ''))}" /></label>
          <label class="field"><span>Email</span><input class="input" name="email" type="email" required /></label>
          ${field('Zona waktu', (l) => select({ name: 'timezone', value: '', options: TZ_OPTIONS('Tidak diketahui'), labelledBy: l }))}
          <label class="field"><span>Jabatan / peran</span><input class="input" name="role" /></label>
          ${field('Jenis', (l) => select({ name: 'kind', value: '', options: KIND_OPTIONS('Ikuti domain email'), labelledBy: l }))}
        </div>
        <div class="ask-row"><button class="btn btn-primary" type="submit">Simpan ke kontak & pakai</button><button class="btn btn-ghost" type="button" data-act="newcontact-close">Batal</button></div>
      </form>` : `<button class="opt" type="button" data-act="newcontact" data-a="${a.id}"><span aria-hidden="true">${ico('add', 14)}</span><span class="opt-main"><b>Tambah kontak baru</b><span class="muted"> · disimpan ke data kontak organisasi</span></span><span></span></button>`;
    }
    return `<div class="ask">
    <div class="ask-q"><strong>${esc(q.text)}</strong>${q.hint ? `<span class="muted">${esc(q.hint)}</span>` : ''}</div>
    ${opts}${add}${input}
    <div class="ask-note">${ico('lock', 13)}Aksi ini tidak dikirim sebelum dijawab${round ? ` · "Saya belum tahu" sudah ${round} dari ${boot().dataset.rules.maxClarificationRounds} kali` : ''}</div>
  </div>`;
}
function renderMore(job, a) {
    const key = `${job.id}:${a.id}`;
    const F = a.fields;
    if (S.editing === key)
        return renderEdit(job, a);
    const rows = [];
    if (a.type === 'email') {
        rows.push(['Kepada', (F.to || []).map((x) => `${esc(x.name)} <span class="muted">${esc(x.email)}</span>`).join('<br>') || '<span class="c-amber">belum ada</span>']);
        rows.push(['Subjek', esc(F.subject || '—')]);
        rows.push(['Isi', F.body ? `<div class="bodytext">${esc(F.body)}</div>` : '<span class="c-amber">belum ada</span>']);
    }
    else if (a.type === 'meeting') {
        rows.push(['Peserta', (F.participants || []).map((x) => `${esc(x.name)} <span class="tag mono">${esc(x.timezone || 'zona ?')}</span>`).join('<br>') || '<span class="c-amber">belum ada</span>']);
        rows.push(['Waktu', F.date ? `${esc(E.humanDate(F.date))}${F.start ? `, ${esc(t(F.start))}–${esc(t(F.end))} ${esc(F.timezone || '(zona ?)')}` : ''}` : '<span class="c-amber">belum ada</span>']);
        const conv = F.conversions || [];
        if (conv.length)
            rows.push(['Konversi', conv.map((c) => `${esc(t(c.from.time))} ${c.from.tz} = ${esc(t(c.to.time))} ${c.to.tz}`).join('<br>')]);
        rows.push(['Lokasi', esc(F.location || 'tidak disebutkan')]);
    }
    else {
        rows.push(['Pemilik', F.owner ? `${esc(F.owner.name)} <span class="muted">${esc(F.owner.role || '')}</span>` : '<span class="c-amber">belum ada</span>']);
        rows.push(['Tenggat', F.due ? esc(E.humanDate(F.due)) : '<span class="c-amber">belum ada</span>']);
    }
    rows.push(['Versi', `<span class="mono" style="font-size:12px">v${a.version} · ${esc(a.fingerprint || '')}</span>`]);
    const sev = { blocking: 'alert', confirm: 'alertCircle', info: 'info' };
    const editable = ['needs_clarification', 'pending_approval', 'approved', 'undone'].includes(a.status);
    return `<div class="more">
    <dl class="props">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <p class="quote">${ico('quote', 13)} Sumber: ${a.source.quote ? `<q>${esc(a.source.quote)}</q> · karakter ${a.source.start}–${a.source.end}` : '<span class="c-red">tidak ada kutipan</span>'}</p>
    ${a.findings.length ? `<ul class="findings">${a.findings.map((f) => `<li class="sev-${f.severity}">${ico(sev[f.severity], 14)}<span>${esc(f.message)} <span class="mono muted" style="font-size:11px">${esc(f.code)}</span></span></li>`).join('')}</ul>` : ''}
    ${a.result ? `<p class="quote">${appIcon(a.type, 13)} ${esc(CONNECTOR[a.type].app)} (mock) · ${esc(a.result.note)} <span class="mono">${esc(a.result.ref)}</span></p>` : ''}
    ${editable ? `<div style="display:flex;gap:6px"><button class="btn" type="button" data-act="edit" data-a="${a.id}">${ico('edit', 14)}${a.status === 'undone' ? 'Sunting & ajukan lagi' : 'Sunting'}</button>${a.status === 'undone' ? '' : `<button class="btn btn-ghost btn-danger" type="button" data-act="cancel" data-a="${a.id}">Batalkan aksi</button>`}</div>` : ''}
  </div>`;
}
let fieldSeq = 0;
/** A labelled field around one of the custom controls (buttons cannot sit inside <label>). */
function field(label, control, extra = '') {
    const id = `fl-${++fieldSeq}`;
    return `<div class="field" ${extra}><span id="${id}">${esc(label)}</span>${control(id)}</div>`;
}
const TZ_OPTIONS = (empty) => [{ value: '', label: empty }, { value: 'WIB', label: 'WIB', detail: 'Jakarta' }, { value: 'WITA', label: 'WITA', detail: 'Makassar' }, { value: 'WIT', label: 'WIT', detail: 'Jayapura' }];
const KIND_OPTIONS = (empty) => [{ value: '', label: empty }, { value: 'internal', label: 'Internal' }, { value: 'external', label: 'Eksternal' }];
function contactOptions() {
    return boot().dataset.contacts.map((c) => ({ value: c.id, label: c.name, detail: [c.role, c.timezone].filter(Boolean).join(' · ') }));
}
function contactSelect(name, selected, multiple, labelledBy) {
    return multiple
        ? multiSelect({ name, values: selected, options: contactOptions(), placeholder: 'Pilih kontak', labelledBy })
        : select({ name, value: selected[0] || '', options: [{ value: '', label: '— pilih —' }, ...contactOptions()], placeholder: 'Pilih kontak', labelledBy });
}
function renderEdit(job, a) {
    const F = a.fields;
    let inner = '';
    if (a.type === 'email') {
        inner = `
      ${field('Kepada', (l) => contactSelect('toIds', (F.to || []).map((x) => x.id), true, l))}
      <label class="field"><span>Subjek</span><input class="input" name="subject" value="${esc(F.subject || '')}" /></label>
      <label class="field"><span>Isi</span><textarea class="textarea" name="body" rows="7">${esc(F.body || '')}</textarea></label>`;
    }
    else if (a.type === 'meeting') {
        inner = `
      <label class="field"><span>Judul</span><input class="input" name="title" value="${esc(F.title || '')}" /></label>
      ${field('Peserta', (l) => contactSelect('participantIds', (F.participants || []).map((x) => x.id), true, l))}
      <div class="grid-2">
        ${field('Tanggal', (l) => datePicker({ name: 'date', value: F.date, labelledBy: l }))}
        ${field('Zona waktu', (l) => select({ name: 'timezone', value: F.timezone || '', options: TZ_OPTIONS('—'), labelledBy: l }))}
        ${field('Mulai', (l) => timeSelect({ name: 'start', value: F.start, labelledBy: l }))}
        ${field('Selesai', (l) => timeSelect({ name: 'end', value: F.end, labelledBy: l }))}
      </div>
      <label class="field"><span>Lokasi</span><input class="input" name="location" value="${esc(F.location || '')}" /></label>`;
    }
    else {
        inner = `
      <label class="field"><span>Tugas</span><input class="input" name="title" value="${esc(F.title || '')}" /></label>
      <div class="grid-2">
        ${field('Pemilik', (l) => contactSelect('ownerId', F.owner ? [F.owner.id] : [], false, l))}
        ${field('Tenggat', (l) => datePicker({ name: 'due', value: F.due, labelledBy: l }))}
      </div>`;
    }
    return `<form class="more ask-form" style="border:1px solid var(--line);border-radius:8px" data-form="edit" data-a="${a.id}">
    ${inner}
    <p class="lock-note">${ico('info', 13)}Menyimpan membuat versi baru dan membatalkan persetujuan sebelumnya.</p>
    <div class="ask-row"><button class="btn btn-primary" type="submit">Simpan versi baru</button><button class="btn btn-ghost" type="button" data-act="edit-close">Batal</button></div>
  </form>`;
}
function highlightSource(job) {
    const s = job.session;
    const text = s.rawInput || '';
    const spans = s.actions.filter((a) => a.source.start >= 0).map((a) => ({ start: a.source.start, end: a.source.end, id: a.id, a })).sort((x, y) => x.start - y.start);
    const inj = s.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED' && f.sourceId === 'input');
    const vague = (a) => [...(a.ambiguousRecipients || []).map((x) => x.alias), ...(a.unknownMentions || [])];
    const markVague = (seg, words) => {
        let html = esc(seg);
        for (const w of words)
            html = html.replace(new RegExp(`(${esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i'), '<span class="amb">$1</span>');
        return html;
    };
    let out = '';
    let pos = 0;
    for (const sp of spans) {
        if (sp.start < pos)
            continue;
        out += plainSeg(text.slice(pos, sp.start), pos, inj);
        out += `<mark>${markVague(text.slice(sp.start, sp.end), sp.a.status === 'needs_clarification' ? vague(sp.a) : [])}<sup>${sp.id}</sup></mark>`;
        pos = sp.end;
    }
    out += plainSeg(text.slice(pos), pos, inj);
    return out;
}
function plainSeg(seg, offset, inj) {
    if (!inj.length)
        return esc(seg);
    let html = '';
    let i = 0;
    for (const f of inj) {
        if (f.offset === undefined || f.quote === undefined)
            continue;
        const a = f.offset - offset, quoteAt = seg.slice(Math.max(0, a)).indexOf(f.quote);
        const b = a + f.quote.length + (quoteAt > 0 ? quoteAt : 0);
        if (a >= seg.length || b <= 0)
            continue;
        const s0 = Math.max(0, a), s1 = Math.min(seg.length, b);
        html += esc(seg.slice(i, s0)) + `<span class="inj" title="Instruksi tersisip — diabaikan">${esc(seg.slice(s0, s1))}</span>`;
        i = s1;
    }
    return html + esc(seg.slice(i));
}
function renderRail(job) {
    const s = job.session;
    const inj = s.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED' && f.quote !== undefined && f.source !== undefined && f.line !== undefined);
    const rv = s.review;
    const c = job.counts;
    const auditAt = (type) => s.audit.find((e) => e.type === type)?.at;
    const ds = boot().dataset;
    const step = (state, label, right = '') => `<li class="step">${state === 'done' ? `<span class="ring done">${ico('tick', 10)}</span>` : `<span class="ring${state === 'now' ? ' now' : ''}"></span>`}<span${state === 'now' ? ' style="font-weight:600"' : state === 'todo' ? ' style="color:var(--text-2)"' : ''}>${label}</span><span class="muted" style="font-size:12px">${right}</span></li>`;
    const live = c.total - c.cancelled;
    return `<aside class="rail" aria-label="Konteks job">
    <section class="sec"><h3>Permintaan asli</h3>
      <p class="src">${highlightSource(job)}</p>
      ${s.attachments.map((d) => `<p class="lock-note" style="margin-top:8px">${ico('attachment', 13)}<span class="mono" style="font-size:12px">${esc(d.name)}</span><span class="muted">· data</span></p>`).join('')}
    </section>
    <section class="sec"><h3>Keamanan</h3>
      ${inj.length ? inj.map((f) => `<div class="sig"><span class="c-amber">${ico('shieldBlock', 16)}</span><div style="min-width:0"><b>Instruksi tersisip diabaikan</b><div class="muted" style="margin-top:2px">“${esc(f.quote.slice(0, 90))}${f.quote.length > 90 ? '…' : ''}” · ${esc(f.source)} baris ${f.line}</div></div></div>`).join('') : `<div class="sig"><span class="muted">${ico('shield', 16)}</span><div><b>Tidak ada instruksi tersisip</b></div></div>`}
      ${rv ? `<div class="sig"><span class="${rv.findings.some((f) => f.severity === 'blocking') ? 'c-red' : 'c-green'}">${ico(rv.findings.some((f) => f.severity === 'blocking') ? 'alertCircle' : 'check', 16)}</span><div style="min-width:0"><b>Reviewer kedua: ${rv.matched}/${rv.checked} cocok</b><div class="muted" style="margin-top:2px">${rv.missing} aksi hilang · ${rv.added} aksi tambahan</div>${rv.findings.length ? `<ul class="findings" style="margin-top:6px">${rv.findings.map((f) => `<li class="sev-${f.severity}">${ico(f.severity === 'blocking' ? 'alert' : 'info', 13)}<span>${esc(f.message)}</span></li>`).join('')}</ul>` : ''}</div></div>` : ''}
    </section>
    <section class="sec"><h3>Progres</h3>
      <ol style="list-style:none;margin:0;padding:0">
        ${step('done', 'Diterima', hhmm(auditAt('intake')))}
        ${step('done', `Direncanakan · ${c.total} aksi`, hhmm(auditAt('plan')))}
        ${step('done', 'Divalidasi', hhmm(auditAt('review')))}
        ${step(c.answer || c.escalated ? 'now' : 'done', 'Klarifikasi', c.answer ? `<span class="c-amber">${c.answer}</span>` : c.escalated ? `<span class="c-red">${c.escalated} butuh keputusan</span>` : '')}
        ${step(c.answer || c.escalated ? 'todo' : c.approve ? 'now' : 'done', 'Persetujuan', c.approve ? `<span class="c-iris">${c.approve}</span>` : '')}
        ${step(c.queued ? 'now' : c.done + c.undone ? 'done' : 'todo', 'Antrean kirim', c.queued ? String(c.queued) : '')}
        ${step(live && c.done + c.undone === live ? 'done' : 'todo', 'Selesai', `${c.done}/${live}`)}
      </ol>
    </section>
    <section class="sec"><h3>Data yang dipakai</h3>
      <dl class="kv">
        <dt>Organisasi</dt><dd>${esc(boot().settings.orgName || '—')}</dd>
        <dt>Kontak</dt><dd>${ds.contacts.length ? `${ds.contacts.length} · ${esc(ds.meta.fileName || 'manual')}` : '<span class="c-amber">kosong</span>'}</dd>
        <dt>Aturan</dt><dd${ds.rules.isDefault ? ' class="c-amber"' : ''}>${esc(ds.rules.isDefault ? 'bawaan (belum SOP)' : ds.rules.source)}</dd>
        <dt>Hari libur</dt><dd${ds.holidays === null ? ' class="c-amber"' : ''}>${ds.holidays === null ? 'belum tersedia' : `${ds.holidays.length} tanggal`}</dd>
        <dt>Tanggal acuan</dt><dd>${esc(E.shortDate(s.systemDate))} ${E.parseISO(s.systemDate).getUTCFullYear()}</dd>
        <dt>Dipecah oleh</dt><dd>${esc((s.planner?.name || '').replace(/^Planner\s+/i, ''))}</dd>
      </dl>
    </section>
  </aside>`;
}
/* ------------------------------------------------------------ approval dialog */
function openApproval(actionId) {
    S.dlg = { actionId };
    renderDialog();
    const d = $('#dlg');
    if (!d.open)
        d.showModal();
}
function renderDialog() {
    const d = $('#dlg');
    const dlg = S.dlg;
    const job = S.job;
    if (!dlg || !job)
        return;
    const a = job.session.actions.find((x) => x.id === dlg.actionId);
    if (!a) {
        d.close();
        return;
    }
    const F = a.fields;
    const acks = (job.acks || {})[a.id] || [];
    const ackState = a.acks || {};
    const missing = acks.filter((k) => !ackState[k.code]);
    const ppl = peopleOf(a);
    const ext = ppl.some((p) => p.kind === 'external');
    const who = ppl.map((p) => firstName(p.name)).join(', ');
    const title = a.type === 'email' ? `Setujui email ke ${who || '…'}?` : a.type === 'meeting' ? 'Setujui undangan rapat ini?' : `Setujui tugas untuk ${who || '…'}?`;
    const rows = [];
    if (a.type === 'email') {
        rows.push(['Kepada', ppl.map((p) => `<span style="font-weight:500">${esc(p.name)}</span> <span class="muted" style="font-size:12.5px">${esc(p.email)}</span>${p.kind === 'external' ? ' <span class="tag tag-amber">Eksternal</span>' : ''}`).join('<br>')]);
        rows.push(['Dari', `${esc(boot().settings.operatorName || '—')} <span class="muted" style="font-size:12.5px">${esc(boot().settings.orgName || '')}</span>`]);
        rows.push(['Subjek', `<span style="font-weight:500">${esc(F.subject)}</span>`]);
    }
    else if (a.type === 'meeting') {
        rows.push(['Judul', `<span style="font-weight:500">${esc(F.title)}</span>`]);
        rows.push(['Peserta', ppl.map((p) => `${esc(p.name)}${p.members ? ` <span class="muted">(${p.members} orang)</span>` : ''} <span class="tag mono">${esc(p.timezone || '?')}</span>${p.kind === 'external' ? ' <span class="tag tag-amber">Eksternal</span>' : ''}`).join('<br>')]);
        const conv = F.conversions || [];
        rows.push(['Waktu', `${esc(F.date ? E.humanDate(F.date) : 'Tanggal belum ada')}<br><span style="font-weight:500">${esc(t(F.start))}–${esc(t(F.end))} ${esc(F.timezone || boot().settings.defaultTimezone)}</span>${conv.length ? ` <span class="muted">= ${conv.map((c) => `${esc(t(c.to.time))} ${c.to.tz}`).join(' · ')}</span>` : ''}`]);
        rows.push(['Lokasi', esc(F.location || 'tidak disebutkan')]);
    }
    else {
        rows.push(['Tugas', `<span style="font-weight:500">${esc(F.title)}</span>`]);
        rows.push(['Pemilik', ppl.map((p) => `${esc(p.name)} <span class="muted">${esc(p.email)}</span>`).join('')]);
        rows.push(['Tenggat', esc(F.due ? E.humanDate(F.due) : 'Tenggat belum ada')]);
    }
    d.innerHTML = `
    <div class="dlg-head">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="mono muted" style="font-size:11.5px">${esc(job.id)} · ${a.id}</span><span class="tag mono">v${a.version}</span>${appTag(a.type)}${ext ? '<span class="tag tag-amber">Eksternal</span>' : ''}
        </div>
        <h2 id="dlg-title">${esc(title)}</h2>
      </div>
      <button class="btn btn-ghost btn-icon" type="button" data-act="dlg-close" aria-label="Tutup">${ico('cancel', 16)}</button>
    </div>
    <div class="dlg-body">
      <dl class="env">${rows.map(([k, v]) => `<div class="er"><dt>${k}</dt><dd>${v}</dd></div>`).join('')}
        ${a.type === 'email' ? `<div class="er" style="display:block;background:var(--canvas)"><dd style="white-space:pre-wrap;font-size:13px;line-height:1.6">${esc(F.body)}</dd></div>` : ''}
      </dl>
      <div class="env">
        ${acks.map((k) => `<label class="chk req"><input type="checkbox" data-act="ack" data-a="${a.id}" data-code="${esc(k.code)}" ${ackState[k.code] ? 'checked' : ''} /><span><span style="font-weight:500">${esc(k.label)}</span><span class="c-amber" style="display:block;font-size:12px">Wajib dicentang</span></span></label>`).join('')}
        ${F.draftFrom && !F.contentConfirmed ? `<div class="chk">${ico('info', 15)}<span><span style="font-weight:500">Isi adalah draf</span><span class="muted" style="display:block;font-size:12px">Disusun dari ${esc(F.draftFrom)}, bukan kutipan permintaan</span></span></div>` : ''}
        ${a.findings.filter((f) => f.severity === 'info' && !['DRAFTED_CONTENT'].includes(f.code)).map((f) => `<div class="chk">${ico('info', 15)}<span class="muted" style="font-size:12.5px">${esc(f.message)}</span></div>`).join('')}
        <div class="chk">${ico('clock', 15)}<span><span style="font-weight:500">Diteruskan setelah jeda ${boot().dataset.rules.undoWindowSeconds} detik</span><span class="muted" style="display:block;font-size:12px">Masih bisa diurungkan dari Antrean kirim</span></span></div>
      </div>
      <p class="mono muted" style="margin:0;font-size:11.5px">sumber “${esc((a.source.quote || '').slice(0, 70))}” · ${a.source.start}–${a.source.end} · ${esc(a.fingerprint || '')}</p>
    </div>
    <div class="dlg-foot">
      <button class="btn btn-ghost btn-danger" type="button" data-act="cancel" data-a="${a.id}">Batalkan aksi</button>
      <span style="flex:1"></span>
      <button class="btn" type="button" data-act="dlg-close">Kembali</button>
      <button class="btn btn-primary" type="button" data-act="approve" data-a="${a.id}" data-v="${a.version}" ${missing.length || a.status !== 'pending_approval' ? 'disabled' : ''}>Setujui versi ${a.version}</button>
    </div>`;
}
/* ------------------------------------------------------------ setup */
function renderSetup(asInbox = false) {
    const b = boot();
    const rows = [
        [orgReady(), 'Atur organisasi', 'Nama PT, domain email internal, dan nama penyetuju.', '#/settings', 'Buka pengaturan'],
        [contactsReady(), 'Masukkan data kontak', 'Impor CSV/JSON kontak beserta zona waktu, atau tambah satu per satu.', '#/contacts', 'Buka kontak'],
        [!b.dataset.rules.isDefault && b.dataset.holidays !== null, 'Aturan & kalender libur (disarankan)', 'Tanpa ini Berezz memakai aturan bawaan dan meminta konfirmasi untuk setiap tanggal.', '#/data', 'Impor'],
        [b.jobs.length > 0, 'Buat job pertama', 'Tempel chat atau notulen, unggah berkas, atau rekam voice note.', '#/new', 'Job baru'],
    ];
    return `<div class="page"><div class="setup">
    <h1>${asInbox ? 'Belum ada job' : 'Mulai dengan Berezz'}</h1>
    <p>Berezz mengubah satu permintaan kerja (chat, notulen, atau rekaman suara) menjadi email, rapat, dan tugas yang Anda setujui satu per satu. Berezz hanya memakai data organisasi Anda sendiri. <a href="#/guide">Baca panduan lengkap</a>.</p>
    <div class="box">${rows.map(([ok, title, desc, href, cta]) => `
      <div class="check-row"><span class="check-dot${ok ? ' ok' : ''}">${ok ? ico('tick', 11) : ''}</span>
        <div><div class="rt">${title}</div><div class="muted" style="font-size:12.5px">${desc}</div></div>
        <a class="btn${ok ? ' btn-ghost' : ''}" href="${href}">${ok ? 'Ubah' : cta}</a></div>`).join('')}
    </div>
    <p class="muted" style="font-size:12.5px;margin-top:14px">${ico('agent', 13)} Memakai WorkBuddy? Agent-nya bisa membuat job di sini, tetapi persetujuan tetap di tangan Anda. <a href="#/guide">Cara menghubungkan</a>.</p>
  </div></div>`;
}
/* ------------------------------------------------------------ new job */
let previewTimer = null;
function previewHTML() {
    const d = S.draft;
    if (!d.text.trim())
        return `<p class="muted" style="margin:0;font-size:12.5px">Mulai mengetik untuk melihat aksi yang terdeteksi.</p>`;
    const s = E.createSession(boot().dataset, boot().settings, { systemDate: boot().referenceDate });
    const r = E.intake(s, { text: d.text, attachments: d.attachments });
    if (!r.ok)
        return `<p class="c-amber" style="margin:0;font-size:12.5px">${esc(r.error?.message || 'Permintaan belum bisa direncanakan.')}</p>`;
    const qs = s.actions.flatMap((a) => a.questions.slice(0, 1).map((q) => ({ a, q })));
    return `${s.actions.map((a) => `<div class="pv"><span class="pv-ico">${ico(TYPE_ICON[a.type], 13)}</span><div style="min-width:0"><div class="rt" style="font-size:13px">${esc(actionTitle(a))}</div><div class="toks" style="font-size:12px">${tokensFor(a)}</div></div></div>`).join('')}
    ${qs.length ? `<div class="sec-h" style="margin-top:12px">Akan ditanyakan</div>${qs.map(({ a, q }) => `<div class="sig"><span class="c-amber">${ico('clarify', 14)}</span><span>${a.id} · ${esc(q.text)}</span></div>`).join('')}` : ''}
    ${s.findingsGlobal.length ? `<div class="sig" style="margin-top:12px"><span class="c-amber">${ico('shieldBlock', 14)}</span><span>${s.findingsGlobal.length} instruksi tersisip akan diabaikan</span></div>` : ''}`;
}
const INPUT_MODES = [
    { mode: 'text', icon: 'chat', title: 'Tempel teks', desc: 'Salin chat, email, atau pesan lalu tempel di sini.', channel: 'Chat tim' },
    { mode: 'file', icon: 'upload', title: 'Unggah berkas', desc: 'Notulen atau ekspor chat (.txt, .md, .eml). Isinya jadi teks permintaan.', channel: 'Notulen rapat' },
    { mode: 'voice', icon: 'mic', title: 'Rekam suara', desc: 'Bicara dalam Bahasa Indonesia, lalu periksa transkripnya. Chrome/Edge.', channel: 'Voice note' },
];
function selectInputMode(mode) {
    const next = INPUT_MODES.find((option) => option.mode === mode) || INPUT_MODES[0];
    if (!next)
        return;
    const previous = INPUT_MODES.find((option) => option.mode === S.draft.mode);
    if (!previous || S.draft.channel === previous.channel)
        S.draft.channel = next.channel;
    S.draft.mode = next.mode;
    render();
    document.querySelector(`[data-act="mode"][data-m="${next.mode}"]`)?.focus();
}
function renderNew() {
    const d = S.draft;
    const sr = speechRecognitionConstructor();
    const textLabel = d.mode === 'voice' ? 'Transkrip — periksa dan koreksi sebelum lanjut' : d.mode === 'file' ? 'Isi berkas — periksa sebelum lanjut' : 'Isi permintaan';
    const source = d.mode === 'voice' ? `
      <div class="rec">
        <button class="rec-btn${S.listening ? ' live' : ''}" type="button" data-act="listen" aria-label="${S.listening ? 'Berhenti merekam' : 'Mulai merekam'}" ${sr ? '' : 'disabled'}>${ico(S.listening ? 'stop' : 'mic', 14)}</button>
        ${S.listening ? '<span class="pulse" aria-hidden="true"></span><span style="font-size:13px">Merekam… bicara dengan jelas, tekan tombol merah untuk berhenti.</span>' : `<span class="muted" style="font-size:13px">${sr ? 'Tekan tombol untuk mulai merekam. Teks muncul di kotak di bawah.' : 'Browser ini tidak bisa merekam suara. Pakai Chrome atau Edge, atau ketik transkripnya di bawah.'}</span>`}
      </div>` : d.mode === 'file' ? `
      <label class="drop">
        ${ico('upload', 18)}
        <span><b>${d.sourceFile ? esc(d.sourceFile) : 'Pilih berkas permintaan'}</b><span class="muted">${d.sourceFile ? 'Ganti berkas · teksnya sudah dimuat di bawah' : '.txt, .md, atau .eml · maks 2 MB'}</span></span>
        <input type="file" data-act="reqfile" accept=".txt,.md,.eml,.csv,.json,text/plain" class="sr-only" />
      </label>` : '';
    const planner = boot().planner.modelAvailable
        ? `<div class="nj-row"><span class="lbl-sm" id="lbl-planner">Dipecah oleh</span><span class="seg" role="group" aria-labelledby="lbl-planner"><button type="button" data-act="planner" data-p="rules" aria-pressed="${d.planner === 'rules'}">Aturan Berezz</button><button type="button" data-act="planner" data-p="model" aria-pressed="${d.planner === 'model'}">Model AI</button></span></div>`
        : '';
    return `
    <header class="top">
      <a href="#/inbox" class="muted" style="font-size:12.5px;text-decoration:none">Kotak masuk</a><span style="color:var(--line-strong)">/</span><h1>Job baru</h1>
      <span class="sub">Masukkan satu permintaan. Berezz memecahnya jadi aksi yang Anda setujui satu per satu.</span>
    </header>
    <div class="split">
      <div class="page">
        ${!contactsReady() ? `<div class="note-warn">${ico('info', 14)}<span>Data kontak masih kosong, jadi setiap nama akan ditanyakan. <a href="#/contacts">Isi kontak</a> agar penerima dikenali otomatis.</span></div>` : ''}
        <form class="nj" data-form="newjob">
          <section class="nj-step" aria-labelledby="nj-1">
            <h2 id="nj-1"><span class="nj-n">1</span>Dari mana permintaannya?</h2>
            <div class="nj-modes" role="radiogroup" aria-labelledby="nj-1">
              ${INPUT_MODES.map((m) => `<button type="button" role="radio" aria-checked="${d.mode === m.mode}" tabindex="${d.mode === m.mode ? '0' : '-1'}" class="nj-mode" data-act="mode" data-m="${m.mode}">
                <span class="nj-mode-ico">${ico(m.icon, 16)}</span><span class="nj-mode-t">${m.title}</span><span class="nj-mode-d">${m.desc}</span>
              </button>`).join('')}
            </div>
          </section>

          <section class="nj-step" aria-labelledby="nj-2">
            <h2 id="nj-2"><span class="nj-n">2</span>${textLabel}</h2>
            <div class="box composer">
              ${source}
              <label class="sr-only" for="req-text">${textLabel}</label>
              <textarea id="req-text" name="text" placeholder="${d.mode === 'voice' ? 'Transkrip rekaman muncul di sini…' : 'Contoh: Tolong kirim notulen rapat ke Pak Budi, jadwalkan follow-up Jumat jam 10 dengan tim Makassar, dan minta Rina revisi proposal paling lambat Senin.'}">${esc(d.text)}</textarea>
            </div>
          </section>

          <section class="nj-step" aria-labelledby="nj-3">
            <h2 id="nj-3"><span class="nj-n">3</span>Keterangan <span class="muted" style="font-weight:400">· opsional</span></h2>
            <div class="box nj-meta">
              <div class="grid-2">
                <label class="field"><span>Siapa yang meminta?</span><input class="input" name="requester" value="${esc(d.requester)}" placeholder="mis. Hendra, Kepala Operasional" /></label>
                ${field('Diterima lewat', (l) => select({ name: 'channel', value: d.channel, options: ['Chat tim', 'Notulen rapat', 'Voice note', 'Email diteruskan', 'Teks ditempel'].map((c) => ({ value: c, label: c })), labelledBy: l }))}
              </div>
              <div class="field">
                <span>Dokumen pendukung</span>
                <div class="nj-atts">
                  ${d.attachments.map((f, i) => `<span class="chip">${ico('attachment', 13)}<span class="mono" style="font-size:11.5px">${esc(f.name)}</span><button type="button" data-act="rm-att" data-i="${i}" aria-label="Hapus ${esc(f.name)}">${ico('cancel', 12)}</button></span>`).join('')}
                  <label class="btn" style="cursor:pointer">${ico('attachment', 13)}Tambah dokumen<input type="file" data-act="attach" accept=".txt,.md,.eml,.csv,.json,text/plain" multiple class="sr-only" /></label>
                </div>
                <small class="muted">Dokumen yang dirujuk permintaan, mis. notulen yang harus dikirim. Isinya hanya dibaca sebagai data: perintah di dalamnya tidak pernah dijalankan.</small>
              </div>
              ${planner}
            </div>
          </section>

          <div class="nj-foot">
            <span class="muted">Belum ada yang dikirim. Setelah ini Anda meninjau setiap aksi.</span>
            <button class="btn btn-primary btn-lg" type="submit">${ico('sparkles', 14)}Buat rencana <span style="font-size:11px;opacity:.7">⌘↵</span></button>
          </div>
        </form>
      </div>
      <aside class="rail" aria-label="Pratinjau">
        <section class="sec"><h3>Yang akan dibuat <span style="font-weight:400">· pratinjau, belum disimpan</span></h3><div id="preview">${previewHTML()}</div></section>
        <section class="sec"><h3>Dipakai untuk job ini</h3><dl class="kv">
          <dt>Organisasi</dt><dd>${esc(boot().settings.orgName || '—')}</dd>
          <dt>Kontak</dt><dd>${boot().dataset.contacts.length ? `${boot().dataset.contacts.length} orang` : '<span class="c-amber">kosong</span>'}</dd>
          <dt>"Hari ini"</dt><dd>${esc(E.humanDate(boot().referenceDate))}</dd>
        </dl></section>
      </aside>
    </div>`;
}
let recognizer = null;
function toggleListen() {
    const SR = speechRecognitionConstructor();
    if (!SR)
        return;
    if (S.listening && recognizer) {
        recognizer.stop();
        return;
    }
    recognizer = new SR();
    recognizer.lang = 'id-ID';
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = (ev) => {
        let add = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++)
            if (ev.results[i].isFinal)
                add += ev.results[i][0].transcript;
        if (add) {
            S.draft.text = `${S.draft.text}${S.draft.text && !/\s$/.test(S.draft.text) ? ' ' : ''}${add.trim()}`;
            const ta = $('#req-text');
            if (ta)
                ta.value = S.draft.text;
            updatePreview();
        }
    };
    recognizer.onend = () => { S.listening = false; render(); };
    recognizer.onerror = (e) => { toast(`Perekaman berhenti: ${e.error}`, 'err'); };
    recognizer.start();
    S.listening = true;
    S.draft.channel = 'Voice note';
    render();
}
function updatePreview() {
    if (previewTimer)
        clearTimeout(previewTimer);
    previewTimer = setTimeout(() => { previewTimer = null; const p = $('#preview'); p.innerHTML = previewHTML(); }, 250);
}
/* ------------------------------------------------------------ queue */
function renderQueue() {
    const q = boot().queue;
    const grp = (st) => q.filter((x) => x.action.status === st);
    const head = `<div class="grid-row hd" role="row"><span></span><span>Aksi</span><span>Penerima</span><span>Dikirim ke</span><span>Disetujui oleh</span><span style="text-align:right">Status</span></div>`;
    const row = (x) => {
        const a = x.action;
        const ppl = peopleOf(a);
        let end = '';
        if (a.status === 'queued')
            end = `<span class="bar" aria-hidden="true"><span data-bar="${esc(a.result.undoUntil)}" data-from="${esc(a.result.queuedAt)}"></span></span><span class="mono num" data-until="${esc(a.result.undoUntil)}" style="font-size:13px;font-weight:500"></span><button class="btn" type="button" data-act="undo" data-job="${esc(x.jobId)}" data-a="${a.id}">${ico('undo', 13)}Urungkan</button>`;
        else if (a.status === 'simulated')
            end = `<span class="mono muted" style="font-size:11.5px">${esc(a.result.ref)}</span><span class="c-green">${ico('check', 15)}</span>`;
        else {
            const seconds = a.result.undoneAt ? Math.round((Date.parse(a.result.undoneAt) - Date.parse(a.result.queuedAt)) / 1000) : 0;
            end = `<span class="tag">Diurungkan di detik ${seconds}</span>`;
        }
        return `<div class="grid-row" role="row">
      <span class="aico" role="cell">${ico(TYPE_ICON[a.type], 15)}</span>
      <span role="cell" style="min-width:0"><a href="#/inbox/${esc(x.jobId)}" class="cell-t" style="display:block;color:var(--text);text-decoration:none">${esc(actionTitle(a))}</a><span class="cell-s">${esc(x.jobId)} · ${a.id} · v${a.result.version}</span></span>
      <span role="cell" class="cell">${esc(ppl.map((p) => (p.members ? `${p.name} (${p.members})` : p.name)).join(', '))}${ppl.some((p) => p.kind === 'external') ? ' <span class="tag tag-amber">Eksternal</span>' : ''}</span>
      <span role="cell" class="cell" style="display:flex;align-items:center;gap:6px">${appIcon(a.type, 14)}${esc(CONNECTOR[a.type].app)}<span class="mock">· mock</span></span>
      <span role="cell" class="cell">${esc(firstName(a.approvedBy || ''))} <span class="mono muted" style="font-size:11.5px">${esc(hhmm(a.approvedAt))}</span></span>
      <span role="cell" class="end">${end}</span>
    </div>`;
    };
    const section = (id, title, hint, list) => list.length ? `<section aria-labelledby="${id}"><div class="ghead"><h2 id="${id}">${title}</h2><span class="n">${list.length}</span>${hint ? `<span class="hint">${hint}</span>` : ''}</div><div class="box tbl-wrap" role="table" aria-labelledby="${id}">${head}${list.map(row).join('')}</div></section>` : '';
    const queued = grp('queued');
    return `
    <header class="top"><h1>Antrean kirim</h1><span class="sub">Aksi yang sudah disetujui menunggu ${boot().dataset.rules.undoWindowSeconds} detik sebelum dikirim. Urungkan kalau ada yang salah.</span><span class="grow"></span><span class="mock-badge">Konektor mock</span></header>
    <div class="page">
      ${q.length ? '' : `<div class="empty"><span class="empty-ico">${ico('queue', 20)}</span><h2>Antrean kosong</h2><p>Aksi muncul di sini setelah Anda menyetujuinya.</p></div>`}
      ${section('q1', 'Masih bisa diurungkan', 'Belum terkirim', queued)}
      ${section('q2', 'Terkirim', 'Ke aplikasi tujuan (mock)', grp('simulated').reverse())}
      ${section('q3', 'Diurungkan', '', grp('undone').reverse())}
      ${q.length ? '<p class="muted" style="margin:0;font-size:12px">Setelah konektor nyata terhubung, email yang sudah diteruskan tidak bisa ditarik kembali.</p>' : ''}
    </div>`;
}
/* ------------------------------------------------------------ history */
const AUDIT_LABEL = {
    intake: 'Diterima', error: 'Input ditolak', injection_detected: 'Instruksi tersisip diabaikan', plan: 'Rencana dibuat', review: 'Reviewer kedua',
    planner_fallback: 'Model AI gagal, dipakai aturan Berezz', clarification_answered: 'Klarifikasi dijawab', escalate: 'Butuh keputusan manusia', edit: 'Disunting',
    acknowledge: 'Konfirmasi tambahan', approve_rejected: 'Persetujuan ditolak', approve: 'Disetujui', cancel: 'Dibatalkan', gate_blocked: 'Gerbang menolak',
    queued: 'Masuk antrean', undo: 'Diurungkan', tool_result: 'Terkirim (mock)',
};
const AUDIT_DOT = { injection_detected: 'var(--amber)', approve: 'var(--green)', tool_result: 'var(--text)', escalate: 'var(--red)', gate_blocked: 'var(--red)', approve_rejected: 'var(--red)', undo: 'var(--text-3)' };
function auditDetail(e) {
    const d = Array.isArray(e.detail) ? {} : e.detail;
    const text = (key) => String(d[key] ?? '');
    const number = (key) => Number(d[key] ?? 0);
    const strings = (key) => Array.isArray(d[key]) ? d[key].map(String) : [];
    switch (e.type) {
        case 'intake': return `${number('chars')} karakter · ${strings('attachments').length ? `lampiran ${strings('attachments').join(', ')}` : 'tanpa lampiran'} · acuan ${text('referenceDate')}`;
        case 'injection_detected': return (Array.isArray(e.detail) ? e.detail : []).map((item) => {
            const row = item;
            return `“${String(row.quote ?? '').slice(0, 60)}” · ${String(row.source ?? '')} baris ${String(row.line ?? '')}`;
        }).join('; ');
        case 'plan': return `v${number('planVersion')} · ${Array.isArray(d.actions) ? d.actions.length : 0} aksi · ${text('planner')}`;
        case 'review': return `${number('matched')}/${number('checked')} cocok · ${number('missing')} hilang · ${number('added')} tambahan`;
        case 'clarification_answered': return `${text('actionId')} → ${text('value')}${d.version ? ` · v${text('version')}` : ''}`;
        case 'edit': return `${text('actionId')} → v${text('version')} · ${strings('fields').join(', ')}`;
        case 'acknowledge': return `${text('actionId')} · ${text('code')}`;
        case 'approve': return `${text('actionId')} v${text('version')} · ${text('fingerprint')}`;
        case 'queued': return `${text('actionId')} · ${text('ref')}`;
        case 'tool_result': {
            const t = ADAPTER_TYPE[text('adapter')];
            return `${text('actionId')} · ${text('ref')} lewat ${t ? `${CONNECTOR[t].app} (mock)` : text('adapter')}`;
        }
        case 'undo': return `${text('actionId')} · setelah ${number('afterSeconds')} detik`;
        case 'planner_fallback': return text('reason');
        default: return d.reason ? `${text('actionId')} · ${text('reason')}` : text('code');
    }
}
function renderHistory() {
    const q = S.histQuery.toLowerCase();
    const total = boot().jobs.length;
    const filtered = Boolean(q) || S.histStatus !== 'all';
    const jobs = boot().jobs.filter((j) => {
        if (S.histStatus === 'done' && j.group !== 'done')
            return false;
        if (S.histStatus === 'escalated' && !j.counts.escalated)
            return false;
        if (S.histStatus === 'open' && j.group === 'done')
            return false;
        return !q || `${j.title} ${j.id} ${j.requester || ''} ${j.channel}`.toLowerCase().includes(q);
    });
    const byDay = new Map();
    for (const j of jobs) {
        const k = dayLabel(j.createdAt);
        const dayJobs = byDay.get(k) || [];
        dayJobs.push(j);
        byDay.set(k, dayJobs);
    }
    const hj = S.histJob;
    const result = (j) => {
        const c = j.counts;
        const parts = [];
        if (c.done)
            parts.push(`<span style="color:var(--text)">${c.done}/${c.total} terkirim</span>`);
        if (c.undone)
            parts.push(`${c.undone} diurungkan`);
        if (c.cancelled)
            parts.push(`${c.cancelled} dibatalkan`);
        if (c.escalated)
            parts.push(`<span class="c-red">${c.escalated} butuh keputusan</span>`);
        if (c.answer + c.approve)
            parts.push(`<span class="c-amber">${c.answer + c.approve} terbuka</span>`);
        if (c.queued)
            parts.push(`${c.queued} antrean`);
        return parts.join(' · ') + (j.injections ? ` <span class="tag tag-amber">${j.injections} injeksi</span>` : '');
    };
    return `
    <header class="top"><h1>Riwayat & audit</h1><span class="sub">${total} job</span></header>
    <div class="split">
      <div class="page">
        ${total ? `<div class="tbar">
          <span class="seg" role="group" aria-label="Saring status">${[['all', 'Semua'], ['open', 'Terbuka'], ['done', 'Selesai'], ['escalated', 'Butuh keputusan']].map(([k, l]) => `<button type="button" data-act="hist-status" data-s="${k}" aria-pressed="${S.histStatus === k}">${l}</button>`).join('')}</span>
          <span class="grow"></span>
          ${filtered ? `<span class="tbar-count">${jobs.length} dari ${total}</span>` : ''}
          <label class="search tbar-search">${ico('search', 14)}<span class="sr-only">Cari di riwayat</span><input id="hist-search" type="search" placeholder="Cari job atau orang" value="${esc(S.histQuery)}" /></label>
        </div>` : ''}
        ${jobs.length ? `<div class="box tbl-wrap"><table class="t"><caption class="sr-only">Riwayat job</caption>
          <thead><tr><th scope="col" style="width:14px"><span class="sr-only">Status</span></th><th scope="col">Job</th><th scope="col">Peminta</th><th scope="col">Saluran</th><th scope="col">Hasil</th><th scope="col" style="text-align:right">Dibuat</th></tr></thead>
          <tbody>${[...byDay.entries()].map(([day, list]) => `<tr><th colspan="6" scope="rowgroup">${esc(day)}</th></tr>${list.map((j) => `
            <tr class="row${hj?.id === j.id ? ' sel' : ''}" data-act="hist-open" data-job="${esc(j.id)}" tabindex="0">
              <td>${glyph(j)}</td>
              <td><div class="cell-t" style="max-width:320px">${esc(j.title)}</div><div class="cell-s">${esc(j.id)}${j.source === 'workbuddy' ? ' · WorkBuddy' : ''}</div></td>
              <td>${esc(j.requester || '—')}</td><td>${esc(j.channel)}</td><td>${result(j)}</td>
              <td class="mono" style="text-align:right;font-size:12px">${esc(hhmm(j.createdAt))}</td>
            </tr>`).join('')}`).join('')}</tbody></table></div>` : total ? `<div class="empty"><span class="empty-ico">${ico('search', 20)}</span><h2>Tidak ada job yang cocok</h2><p>Ubah kata pencarian atau pilih filter Semua.</p></div>` : `<div class="empty"><span class="empty-ico">${ico('history', 20)}</span><h2>Belum ada riwayat</h2><p>Job yang sudah dibuat muncul di sini bersama jejak auditnya.</p></div>`}
      </div>
      <aside class="rail" aria-label="Jejak audit">
        ${hj ? `
          <div style="padding:16px 18px 14px">
            <div style="display:flex;align-items:center;gap:8px"><span class="mono muted" style="font-size:11.5px">${esc(hj.id)}</span>${glyph(hj)}</div>
            <h2 style="margin:4px 0 0;font-size:15px;font-weight:600;letter-spacing:-.01em">${esc(hj.title)}</h2>
            <div style="display:flex;gap:6px;margin-top:10px"><a class="btn" href="#/inbox/${esc(hj.id)}">Buka job</a><a class="btn" href="/api/jobs/${esc(hj.id)}/audit" download>${ico('download', 14)}Ekspor JSON</a></div>
          </div>
          <section class="sec"><h3>Ringkasan</h3><dl class="kv">
            <dt>Aksi</dt><dd>${result(hj)}</dd>
            <dt>Reviewer</dt><dd>${hj.session.review ? `${hj.session.review.matched}/${hj.session.review.checked} cocok` : '—'}</dd>
            <dt>Penyetuju</dt><dd>${esc([...new Set(hj.session.actions.map((a) => a.approvedBy).filter(Boolean))].join(', ') || '—')}</dd>
            <dt>Konektor</dt><dd>Mock: Gmail, Google Calendar, Trello</dd>
          </dl></section>
          <section class="sec"><h3>Jejak audit <span>${hj.session.audit.length}</span></h3>
            <ol style="list-style:none;margin:0;padding:0">${hj.session.audit.map((e) => `<li class="ev"><time>${esc(hhmm(e.at))}</time><span class="evdot" style="background:${AUDIT_DOT[e.type] || 'var(--text-4)'}"></span><div style="min-width:0"><b>${esc(AUDIT_LABEL[e.type] || e.type)}</b> <span class="muted">· ${esc(e.actor)}</span><div class="d">${esc(auditDetail(e))}</div></div></li>`).join('')}</ol>
          </section>` : `<div class="empty"><p>Pilih job untuk melihat jejak auditnya.</p></div>`}
      </aside>
    </div>`;
}
/* ------------------------------------------------------------ data */
function renderData() {
    const b = boot();
    const ds = b.dataset;
    const h = b.health;
    const r = ds.rules;
    const originTag = ds.meta.origin === 'empty' ? '<span class="tag tag-amber">Kosong</span>' : ds.meta.origin === 'imported' ? '<span class="tag tag-green">Data organisasi</span>' : '<span class="tag tag-green">Diisi manual</span>';
    const list = ds.holidays || [];
    const years = [...new Set(list.map((x) => x.date.slice(0, 4)))];
    return `
    <header class="top"><h1>Sumber data</h1>${originTag}<span class="sub">${ds.meta.fileName ? `${esc(ds.meta.fileName)} · diimpor ${esc(dayLabel(ds.meta.importedAt))} ${esc(hhmm(ds.meta.importedAt))}` : 'Belum ada berkas diimpor'}</span><span class="grow"></span>
      <a class="btn btn-ghost" href="/api/template" download="berezz-templat-dataset.json">Unduh templat</a>
      <label class="btn btn-primary" style="cursor:pointer">${ico('fileImport', 14)}Impor dataset<input type="file" data-act="import" accept=".json,.csv,application/json,text/csv" hidden /></label>
    </header>
    <div class="page data-page">
      <section><div class="ghead"><h2>Kontak</h2><span class="hint">Dikelola di halaman Kontak</span></div>
        <div class="box row-list">
          <a class="row" href="#/contacts"><span class="aico">${ico('users', 15)}</span>
            <span style="min-width:0"><span class="rt">${ds.contacts.length ? `${h.contacts} kontak` : 'Belum ada kontak'}</span><span class="toks" style="font-size:12.5px;color:var(--text-3)">${ds.contacts.length ? `${h.withoutTimezone.length ? `<span class="c-amber">${h.withoutTimezone.length} tanpa zona waktu</span>` : '<span>Semua punya zona waktu</span>'}${h.duplicateFirstNames.length ? `<span>${h.duplicateFirstNames.length} nama ganda</span>` : ''}` : '<span class="c-amber">Setiap nama di permintaan akan ditanyakan</span>'}</span></span>
            <span class="end">${ds.contacts.length ? '<span class="tag tag-green">Terisi</span>' : '<span class="tag tag-amber">Kosong</span>'}${ico('arrowRight', 14)}</span>
          </a>
        </div>
      </section>

      <section id="d-rules"><div class="ghead"><h2>Aturan operasional</h2>${r.isDefault ? '<span class="tag tag-amber">Aturan bawaan</span>' : '<span class="tag tag-green">SOP</span>'}<span class="hint">${esc(r.source)}</span></div>
        <div class="box">
          <dl class="rules">
            <div><dt>Jam kerja</dt><dd>${esc(t(r.officeHours.start))}–${esc(t(r.officeHours.end))} waktu lokal</dd></div>
            <div><dt>Hari kerja</dt><dd>${r.officeHours.weekdays.map((d) => E.DATE_ID[d]).join(', ')}</dd></div>
            <div><dt>Salat Jumat</dt><dd>Tidak ada rapat ${esc(t(r.fridayPrayer.start))}–${esc(t(r.fridayPrayer.end))}</dd></div>
            <div><dt>Durasi rapat</dt><dd>${r.meetingDefaultMinutes} menit bila tidak disebut</dd></div>
            <div><dt>Pertanyaan</dt><dd>Maks ${r.maxClarificationRounds} kali, lalu butuh keputusan</dd></div>
            <div><dt>Jeda urungkan</dt><dd>${r.undoWindowSeconds} detik</dd></div>
          </dl>
          ${r.isDefault ? `<p class="box-foot">Ini aturan bawaan Berezz. Impor SOP organisasi (bagian <code>rules</code> di templat) agar setiap temuan menyebut sumber yang benar.</p>` : ''}
        </div>
      </section>

      <section id="d-holidays"><div class="ghead"><h2>Kalender libur</h2><span class="n">${list.length}</span><span class="hint">${ds.holidays === null ? 'Selama kosong, setiap rapat dan tenggat minta dipastikan bukan hari libur' : 'Rapat atau tenggat di tanggal ini akan ditandai'}</span></div>
        <div class="box">
          <form data-form="holiday-one" class="hol-add">
            ${field('Tanggal', (l) => datePicker({ name: 'date', value: '', labelledBy: l, placeholder: 'Pilih tanggal' }))}
            <label class="field"><span>Nama hari libur</span><input class="input" name="name" placeholder="mis. Hari Raya Natal" /></label>
            <button class="btn btn-primary" type="submit">${ico('add', 14)}Tambah</button>
          </form>
          <details class="hol-paste">
            <summary>${ico('chevDown', 14)}Tempel banyak sekaligus</summary>
            <form data-form="holiday-list">
              <label class="sr-only" for="hol-text">Daftar hari libur, satu per baris</label>
              <textarea id="hol-text" class="textarea" name="text" rows="5" placeholder="Satu tanggal per baris, contoh:\n2026-12-25 Hari Raya Natal\n24/12/2026 Cuti bersama Natal\n1 Januari 2027 Tahun Baru Masehi"></textarea>
              <small class="muted">Salin dari daftar libur nasional dan cuti bersama, atau dari kolom Excel. Format yang dikenali: 2026-12-25, 25/12/2026, 25 Desember 2026. Tanggal yang sudah ada diperbarui, bukan digandakan.</small>
              <button class="btn" type="submit">Tambahkan semua</button>
            </form>
          </details>
          <div class="hol-list">
            ${list.length ? years.map((y) => `<div class="hol-year">${y}</div>${list.filter((x) => x.date.startsWith(y)).map((x) => `<div class="hol-row"><span class="hol-date">${esc(E.shortDate(x.date))}</span><span class="hol-name">${esc(x.name)}</span><button class="btn btn-ghost btn-icon" type="button" data-act="hol-del" data-date="${esc(x.date)}" aria-label="Hapus ${esc(x.name)} ${esc(x.date)}">${ico('cancel', 13)}</button></div>`).join('')}`).join('') : '<p class="muted" style="margin:0;font-size:13px">Belum ada tanggal.</p>'}
          </div>
        </div>
      </section>

      <section><div class="ghead"><h2>Dokumen & lampiran</h2><span class="hint">Dilampirkan per job</span></div>
        <div class="box row-list"><div class="row"><span class="aico">${ico('file', 15)}</span><span><span class="rt">Notulen, ekspor chat, email</span><span class="toks" style="font-size:12.5px;color:var(--text-3)">Hanya dipakai sebagai konteks dan kutipan · baris yang menyuruh agent ditandai dan diabaikan</span></span><span class="end"></span></div></div>
      </section>

      <section><div class="ghead"><h2>Aplikasi tujuan</h2><span class="hint">Mock · hanya menerima aksi yang sudah disetujui</span></div>
        <div class="box row-list">
          ${['email', 'meeting', 'task'].map((t) => `<div class="row"><span class="aico">${appIcon(t, 16)}</span><span><span class="rt">${CONNECTOR[t].app}</span><span class="toks" style="font-size:12.5px;color:var(--text-3)">${CONNECTOR[t].kind} · ${CONNECTOR[t].none}</span></span><span class="end"><span class="tag tag-green">Terhubung <span class="mock">· mock</span></span></span></div>`).join('')}
          <div class="row"><span class="aico">${ico('agent', 15)}</span><span><span class="rt">Agent WorkBuddy (MCP)</span><span class="toks" style="font-size:12.5px;color:var(--text-3)">Boleh membuat job & mengusulkan rencana · tidak bisa menyetujui</span></span><span class="tag">Hanya mengusulkan</span></div>
        </div>
      </section>
      ${ds.meta.origin !== 'empty' ? '<div><button class="btn btn-ghost btn-danger" type="button" data-act="clear-data">Kosongkan data organisasi</button></div>' : ''}
    </div>`;
}
/* ------------------------------------------------------------ contacts */
const CONTACT_FILTERS = [['all', 'Semua'], ['internal', 'Internal'], ['external', 'Eksternal'], ['group', 'Grup'], ['incomplete', 'Tanpa zona waktu']];
function kindOf(c) {
    if (c.kind)
        return c.kind;
    const domain = c.email.split('@')[1]?.toLowerCase() || '';
    return boot().settings.orgDomains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)) ? 'internal' : 'external';
}
function renderContacts() {
    const b = boot();
    const all = b.dataset.contacts;
    const q = S.contactQuery.toLowerCase();
    const f = S.contactFilter;
    const list = all.filter((c) => {
        const group = Boolean(c.members?.length);
        if (f === 'internal' && (group || kindOf(c) !== 'internal'))
            return false;
        if (f === 'external' && (group || kindOf(c) !== 'external'))
            return false;
        if (f === 'group' && !group)
            return false;
        if (f === 'incomplete' && c.timezone)
            return false;
        return !q || `${c.name} ${c.email} ${c.role || ''} ${c.city || ''} ${(c.aliases || []).join(' ')}`.toLowerCase().includes(q);
    });
    const filtered = Boolean(q) || f !== 'all';
    const noTz = all.filter((c) => !c.timezone).length;
    const dupes = b.health.duplicateFirstNames;
    const sel = S.contactSel;
    const editing = sel && sel !== 'new' ? all.find((c) => c.id === sel) || null : null;
    const kindTag = (c) => c.members?.length ? `<span class="tag tag-green">Grup · ${c.members.length}</span>` : kindOf(c) === 'internal' ? '<span class="tag tag-iris">Internal</span>' : '<span class="tag tag-amber">Eksternal</span>';
    return `
    <header class="top"><h1>Kontak</h1><span class="sub">${all.length ? `${all.length} kontak` : 'Buku alamat organisasi'}</span><span class="grow"></span>
      <label class="btn" style="cursor:pointer" title="Mengganti seluruh daftar kontak dengan isi berkas">${ico('fileImport', 14)}Impor CSV / JSON<input type="file" data-act="import" accept=".json,.csv,application/json,text/csv" hidden /></label>
      <button class="btn btn-primary" type="button" data-act="contact-new">${ico('add', 14)}Tambah kontak</button>
    </header>
    <div class="split">
      <div class="page">
        ${all.length && (noTz || dupes.length) ? `<div class="note-warn">${ico('info', 14)}<span>${noTz ? `<b>${noTz} kontak belum punya zona waktu</b>, jadi jam rapatnya tidak bisa dicek. <button class="link" type="button" data-act="contact-filter" data-f="incomplete">Tampilkan</button>` : ''}${noTz && dupes.length ? '<br>' : ''}${dupes.length ? `Nama depan ganda (${dupes.map((d) => `${esc(d.name[0].toUpperCase() + d.name.slice(1))} ×${d.n}`).join(', ')}) selalu memicu pertanyaan "yang mana?". Isi kolom panggilan agar mudah dibedakan.` : ''}</span></div>` : ''}
        ${all.length ? `<div class="tbar">
          <span class="seg" role="group" aria-label="Saring kontak">${CONTACT_FILTERS.map(([k, l]) => `<button type="button" data-act="contact-filter" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join('')}</span>
          <span class="grow"></span>
          ${filtered ? `<span class="tbar-count">${list.length} dari ${all.length}</span>` : ''}
          <label class="search tbar-search">${ico('search', 14)}<span class="sr-only">Cari kontak</span><input id="contact-search" type="search" placeholder="Cari nama, email, kota" value="${esc(S.contactQuery)}" /></label>
        </div>` : ''}
        ${list.length ? `<div class="box tbl-wrap"><table class="t"><caption class="sr-only">Daftar kontak</caption>
          <thead><tr><th scope="col">Nama</th><th scope="col">Dipanggil</th><th scope="col">Jabatan</th><th scope="col">Kota · zona</th><th scope="col">Jenis</th></tr></thead>
          <tbody>${list.map((c) => `
            <tr class="row${sel === c.id ? ' sel' : ''}" data-act="contact-open" data-id="${esc(c.id)}" tabindex="0">
              <td><div class="cell-t" style="max-width:260px">${esc(c.name)}</div><div class="cell-s">${esc(c.email)}</div></td>
              <td>${esc((c.aliases || []).join(', ') || '—')}</td>
              <td>${esc(c.role || '—')}</td>
              <td style="white-space:nowrap">${esc(c.city || '—')} ${c.timezone ? `<span class="mono muted" style="font-size:12px">· ${esc(c.timezone)}</span>` : '<span class="tag tag-amber">Zona?</span>'}</td>
              <td>${kindTag(c)}</td>
            </tr>`).join('')}</tbody></table></div>`
        : all.length ? `<div class="empty"><span class="empty-ico">${ico('search', 20)}</span><h2>Tidak ada kontak yang cocok</h2><p>Ubah kata pencarian atau pilih filter Semua.</p></div>`
            : `<div class="empty"><span class="empty-ico">${ico('users', 20)}</span><h2>Belum ada kontak</h2><p>Impor CSV dari Excel atau Google Sheets dengan kolom <code>nama, email, zona_waktu, kota, jabatan, alias, anggota</code>, atau tambahkan satu per satu.</p>
              <div style="display:flex;gap:8px;justify-content:center;margin-top:14px"><label class="btn" style="cursor:pointer">${ico('fileImport', 14)}Impor berkas<input type="file" data-act="import" accept=".json,.csv,application/json,text/csv" hidden /></label><button class="btn btn-primary" type="button" data-act="contact-new">${ico('add', 14)}Tambah kontak</button></div></div>`}
      </div>
      ${sel ? renderContactRail(editing) : ''}
    </div>`;
}
/** Shown only while a contact is being added or edited. */
function renderContactRail(c) {
    const join = (xs) => esc((xs || []).join('; '));
    return `<aside class="rail" aria-label="${c ? 'Ubah kontak' : 'Kontak baru'}">
    <div class="rail-head"><h2>${c ? esc(c.name) : 'Kontak baru'}</h2><button class="btn btn-ghost btn-icon" type="button" data-act="contact-close" aria-label="Tutup">${ico('cancel', 14)}</button></div>
    <form data-form="contact" class="sec contact-form">
      <label class="field"><span>Nama lengkap</span><input class="input" name="name" value="${esc(c?.name || '')}" required /></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" value="${esc(c?.email || '')}" required /></label>
      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        <label class="field"><span>Jabatan</span><input class="input" name="role" value="${esc(c?.role || '')}" /></label>
        <label class="field"><span>Kota</span><input class="input" name="city" value="${esc(c?.city || '')}" /></label>
      </div>
      <div class="grid-2" style="grid-template-columns:1fr 1fr">
        ${field('Zona waktu', (l) => select({ name: 'timezone', value: c?.timezone || '', options: TZ_OPTIONS('Belum tahu'), labelledBy: l }))}
        ${field('Jenis', (l) => select({ name: 'kind', value: c?.kind || '', options: KIND_OPTIONS('Ikuti domain email'), labelledBy: l }))}
      </div>
      <label class="field"><span>Dipanggil</span><input class="input" name="aliases" value="${join(c?.aliases)}" placeholder="mis. Pak Budi; Budi S" /><small class="muted">Pisahkan dengan titik koma.</small></label>
      <label class="field"><span>Anggota grup</span><input class="input" name="members" value="${join(c?.members)}" placeholder="Isi hanya bila ini grup" /><small class="muted">Nama anggota, pisahkan dengan titik koma.</small></label>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-primary" type="submit">${c ? 'Simpan perubahan' : 'Simpan kontak'}</button>
        ${c ? `<button class="btn btn-ghost btn-danger" type="button" data-act="contact-del" data-id="${esc(c.id)}">Hapus</button>` : ''}
      </div>
      ${c ? '<small class="muted">Perubahan berlaku untuk job berikutnya. Job yang sudah ada tetap memakai data saat job itu dibuat.</small>' : ''}
    </form>
  </aside>`;
}
/* ------------------------------------------------------------ settings */
function renderGuide() {
    const b = boot();
    return guideHTML({
        orgName: b.settings.orgName,
        approver: b.settings.operatorName,
        contacts: b.dataset.contacts.length,
        holidaysReady: b.dataset.holidays !== null,
        rulesFromSop: !b.dataset.rules.isDefault,
        undoSeconds: b.dataset.rules.undoWindowSeconds,
        maxRounds: b.dataset.rules.maxClarificationRounds,
        modelPlanner: b.planner.modelAvailable ? b.planner.model : null,
        install: b.install || null,
    });
}
function renderSettings() {
    const s = boot().settings;
    return `
    <header class="top"><h1>Pengaturan</h1><span class="sub">Berlaku untuk workspace ini</span></header>
    <div class="page" style="max-width:760px">
      <form data-form="settings" style="display:flex;flex-direction:column;gap:24px">
        <section><div class="ghead"><h2>Organisasi</h2><span class="hint">Nama ini muncul di menu, email, dan audit</span></div>
          <div class="box" style="padding:14px;display:flex;flex-direction:column;gap:12px">
            <label class="field"><span>Nama organisasi / PT</span><input class="input" name="orgName" value="${esc(s.orgName)}" placeholder="mis. PT Nama Perusahaan" required /></label>
            <label class="field"><span>Domain email internal (pisahkan dengan koma)</span><input class="input" name="orgDomains" value="${esc(s.orgDomains.join(', '))}" placeholder="perusahaan.co.id" /><small class="muted" style="font-size:12px">Kontak dengan domain lain dianggap eksternal dan butuh konfirmasi tambahan.</small></label>
          </div></section>
        <section><div class="ghead"><h2>Penyetuju</h2><span class="hint">Tercatat di setiap persetujuan</span></div>
          <div class="box grid-2" style="padding:14px">
            <label class="field"><span>Nama</span><input class="input" name="operatorName" value="${esc(s.operatorName)}" required /></label>
            <label class="field"><span>Peran</span><input class="input" name="operatorRole" value="${esc(s.operatorRole)}" placeholder="mis. Admin operasional" /></label>
          </div></section>
        <section><div class="ghead"><h2>Waktu</h2></div>
          <div class="box grid-2" style="padding:14px">
            ${field('Zona waktu pengirim', (l) => select({ name: 'defaultTimezone', value: s.defaultTimezone, options: TZ_OPTIONS('').slice(1), labelledBy: l }))}
            ${field('Tanggal acuan', (l) => select({ name: 'refMode', value: s.refDate.mode, options: [{ value: 'system', label: 'Jam sistem (hari ini)' }, { value: 'fixed', label: 'Tanggal tetap (pengujian)' }], labelledBy: l }))}
            ${field('Tanggal tetap', (l) => datePicker({ name: 'refFixed', value: s.refDate.fixed, labelledBy: l }))}
          </div></section>
        <section><div class="ghead"><h2>Planner</h2><span class="hint">Siapa yang memecah permintaan menjadi aksi</span></div>
          <div class="box" style="padding:14px;display:flex;flex-direction:column;gap:8px;font-size:13px">
            <label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="planner" value="rules" ${s.planner !== 'model' ? 'checked' : ''} /><span><b style="font-weight:500">Aturan Berezz</b><span class="muted" style="display:block;font-size:12.5px">Deterministik, tanpa model. Selalu tersedia.</span></span></label>
            <label style="display:flex;gap:8px;align-items:flex-start"><input type="radio" name="planner" value="model" ${s.planner === 'model' ? 'checked' : ''} ${boot().planner.modelAvailable ? '' : 'disabled'} /><span><b style="font-weight:500">Model bahasa${boot().planner.model ? ` (${esc(boot().planner.model)})` : ''}</b><span class="muted" style="display:block;font-size:12.5px">${boot().planner.modelAvailable ? 'Model mengusulkan; Berezz tetap menurunkan penerima, tanggal, dan jam dari kutipan.' : 'Belum dikonfigurasi. Atur BEREZZ_LLM_BASE_URL, BEREZZ_LLM_API_KEY, BEREZZ_LLM_MODEL saat menjalankan server.'}</span></span></label>
            <p class="muted" style="margin:4px 0 0;font-size:12.5px">${ico('agent', 13)} Agent WorkBuddy bisa mengusulkan rencana lewat MCP kapan saja; lihat <code>workbuddy/README.md</code>.</p>
          </div></section>
        <div style="display:flex;gap:8px"><button class="btn btn-primary btn-lg" type="submit">Simpan pengaturan</button></div>
      </form>
      <section><div class="ghead"><h2 class="c-red">Zona bahaya</h2></div>
        <div class="box" style="padding:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span style="flex:1;font-size:13px">Hapus seluruh workspace: pengaturan, data organisasi, semua job, dan audit.</span><button class="btn btn-danger" type="button" data-act="reset-ws">Hapus workspace</button></div>
      </section>
    </div>`;
}
/* ------------------------------------------------------------ render */
function render() {
    closeControl(false);
    if (!S.boot)
        return;
    const storage = boot().storage;
    if (!storage?.writable && storage?.error && !S.storageWarningShown) {
        S.storageWarningShown = true;
        toast(`Penyimpanan belum aman: ${storage.error}`, 'err');
    }
    renderSide();
    const r = S.route;
    const view = $('#view');
    const html = r.name === 'new' ? renderNew()
        : r.name === 'queue' ? renderQueue()
            : r.name === 'history' ? renderHistory()
                : r.name === 'data' ? renderData()
                    : r.name === 'contacts' ? renderContacts()
                        : r.name === 'settings' ? renderSettings()
                            : r.name === 'guide' ? renderGuide()
                                : r.name === 'setup' ? renderSetup()
                                    : renderInbox();
    view.innerHTML = html;
    updateGuideToc();
    if (S.dlg && $('#dlg').open)
        renderDialog();
    tick();
}
function tick() {
    const now = Date.now();
    document.querySelectorAll('[data-until]').forEach((el) => {
        const until = el.dataset.until;
        if (!until)
            return;
        const left = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
        el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        el.setAttribute('aria-label', `${left} detik tersisa untuk mengurungkan`);
    });
    document.querySelectorAll('[data-bar]').forEach((el) => {
        const from = el.dataset.from, until = el.dataset.bar;
        if (!from || !until)
            return;
        const a = Date.parse(from), b = Date.parse(until);
        el.style.width = `${Math.max(0, Math.min(100, ((b - now) / (b - a)) * 100))}%`;
    });
}
let lastFullSync = Date.now();
/** Deliver due queue items, and pick up jobs created elsewhere (e.g. by a WorkBuddy agent). */
async function syncIfQueued() {
    if (S.busy || document.hidden)
        return;
    const due = boot().queue.some((q) => q.action.status === 'queued' && Date.parse(q.action.result.undoUntil) <= Date.now());
    if (!due && Date.now() - lastFullSync < 5000)
        return;
    lastFullSync = Date.now();
    const before = JSON.stringify(S.boot?.jobs.map((j) => [j.id, j.updatedAt]));
    await loadBoot();
    if (!due && JSON.stringify(boot().jobs.map((j) => [j.id, j.updatedAt])) === before)
        return;
    if (S.job)
        await loadJob(S.job.id);
    const active = document.activeElement;
    if (active && /INPUT|TEXTAREA|SELECT/.test(active.tagName) && $('#view').contains(active)) {
        renderSide();
        return;
    }
    render();
}
/* ------------------------------------------------------------ actions */
async function afterJob(job) {
    S.job = job;
    await loadBoot();
    render();
}
async function actionCall(actionId, verb, body = {}, jobId = S.job?.id) {
    if (!actionId || !jobId)
        throw new Error('Aksi atau job tidak tersedia. Muat ulang sebelum mencoba lagi.');
    const out = await api(`/api/jobs/${encodeURIComponent(jobId)}/actions/${encodeURIComponent(actionId)}/${encodeURIComponent(verb)}`, { method: 'POST', body });
    if (out.contactWarning)
        toast(out.contactWarning);
    if (S.job && S.job.id === jobId)
        S.job = out.job;
    await loadBoot();
    return out.job;
}
function readFile(file) {
    return new Promise((resolve, reject) => {
        if (file.size > 2_000_000)
            return reject(new Error(`${file.name} lebih dari 2 MB`));
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result || ''));
        fr.onerror = () => reject(fr.error);
        fr.readAsText(file);
    });
}
document.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.tagName === 'INPUT')
        return;
    const act = el.dataset.act;
    const a = el.dataset.a || '';
    const key = S.job ? `${S.job.id}:${a}` : '';
    switch (act) {
        case 'connector-toggle':
            S.connectorsExpanded = !S.connectorsExpanded;
            el.setAttribute('aria-expanded', String(S.connectorsExpanded));
            $('#connector-list').hidden = !S.connectorsExpanded;
            break;
        case 'theme': {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            try {
                localStorage.setItem('berezz-theme', next);
            }
            catch { /* storage unavailable */ }
            renderSide();
            break;
        }
        case 'toggle':
            if (S.expanded.has(key))
                S.expanded.delete(key);
            else
                S.expanded.add(key);
            render();
            break;
        case 'answer':
            await run(async () => { await actionCall(a, 'answer', { questionId: el.dataset.q || '', value: el.dataset.v || '' }); render(); });
            break;
        case 'newcontact':
            S.newContactFor = key;
            render();
            $('[data-form="newcontact"] input[name="email"]')?.focus();
            break;
        case 'newcontact-close':
            S.newContactFor = null;
            render();
            break;
        case 'edit':
            S.editing = key;
            render();
            break;
        case 'edit-close':
            S.editing = null;
            render();
            break;
        case 'review':
            openApproval(a);
            break;
        case 'dlg-close':
            $('#dlg').close();
            break;
        case 'approve':
            {
                const jobId = S.job?.id || '';
                if (!jobId) {
                    toast('Job sudah tidak tersedia; muat ulang halaman.', 'err');
                    break;
                }
                await run(async () => {
                    await actionCall(a, 'approve', { version: Number(el.dataset.v) });
                    $('#dlg').close();
                    render();
                    toast(`${a} disetujui dan masuk antrean. Diteruskan dalam ${boot().dataset.rules.undoWindowSeconds} detik.`, 'ok', { label: 'Urungkan', run: () => run(async () => { await actionCall(a, 'undo', {}, jobId); render(); }, 'Diurungkan. Tidak ada yang diteruskan.') });
                });
                break;
            }
        case 'cancel':
            if (!confirm(`Batalkan ${a}? Aksi ini tidak akan dijalankan.`))
                return;
            await run(async () => { await actionCall(a, 'cancel', { reason: 'Dibatalkan oleh penyetuju' }); $('#dlg').close(); render(); }, `${a} dibatalkan.`);
            break;
        case 'undo':
            await run(async () => { await actionCall(a, 'undo', {}, el.dataset.job || S.job?.id); render(); }, 'Diurungkan. Tidak ada yang diteruskan.');
            break;
        case 'mode':
            selectInputMode(el.dataset.m || 'text');
            break;
        case 'planner':
            S.draft.planner = el.dataset.p || 'rules';
            render();
            break;
        case 'hol-del':
            await run(async () => { S.boot = { ...(await api(`/api/dataset/holidays/${el.dataset.date}`, { method: 'DELETE' })), token: S.token }; render(); }, 'Tanggal dihapus.');
            break;
        case 'goto':
            ev.preventDefault();
            document.getElementById(el.dataset.id || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
        case 'copy': {
            const text = document.getElementById(el.dataset.copy || '')?.textContent || '';
            navigator.clipboard?.writeText(text).then(() => toast('Disalin.'), () => toast('Tidak bisa menyalin otomatis; pilih teksnya lalu salin manual.', 'err'));
            break;
        }
        case 'listen':
            toggleListen();
            break;
        case 'rm-att':
            S.draft.attachments.splice(Number(el.dataset.i), 1);
            render();
            break;
        case 'hist-status':
            S.histStatus = el.dataset.s || 'all';
            render();
            break;
        case 'hist-open':
            go(`#/history/${el.dataset.job || ''}`);
            break;
        case 'contact-new':
            S.contactSel = 'new';
            render();
            $('form[data-form="contact"] input[name="name"]')?.focus();
            break;
        case 'contact-open':
            S.contactSel = el.dataset.id || null;
            render();
            break;
        case 'contact-close':
            S.contactSel = null;
            render();
            break;
        case 'contact-filter':
            S.contactFilter = el.dataset.f || 'all';
            render();
            break;
        case 'contact-del': {
            const c = boot().dataset.contacts.find((x) => x.id === el.dataset.id);
            if (!c || !confirm(`Hapus kontak ${c.name}? Job yang sudah ada tidak berubah.`))
                return;
            await run(async () => { S.boot = { ...(await api(`/api/dataset/contacts/${encodeURIComponent(c.id)}`, { method: 'DELETE' })), token: S.token }; S.contactSel = null; render(); }, 'Kontak dihapus.');
            break;
        }
        case 'clear-data':
            if (!confirm('Kosongkan semua data organisasi (kontak, aturan, hari libur)? Job yang ada tetap tersimpan.'))
                return;
            await run(async () => { S.boot = { ...(await api('/api/dataset', { method: 'DELETE' })), token: S.token }; render(); }, 'Data organisasi dikosongkan.');
            break;
        case 'reset-ws':
            if (!confirm('Hapus SELURUH workspace termasuk semua job dan audit? Tindakan ini tidak bisa dibatalkan.'))
                return;
            await run(async () => { S.boot = { ...(await api('/api/workspace', { method: 'DELETE' })), token: S.token }; S.job = null; go('#/setup'); }, 'Workspace dihapus.');
            break;
    }
});
document.addEventListener('keydown', (ev) => {
    const target = ev.target;
    const modeButton = target instanceof Element ? target.closest('[data-act="mode"][role="radio"]') : null;
    if (modeButton && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(ev.key)) {
        const index = INPUT_MODES.findIndex((mode) => mode.mode === modeButton.dataset.m);
        if (index >= 0) {
            ev.preventDefault();
            const direction = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? 1 : -1;
            const next = INPUT_MODES[(index + direction + INPUT_MODES.length) % INPUT_MODES.length];
            if (next)
                selectInputMode(next.mode);
            return;
        }
    }
    const row = ev.target.closest?.('tr[data-act="hist-open"]');
    if (row && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        row.click();
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter' && ev.target.id === 'req-text') {
        ev.preventDefault();
        $('[data-form="newjob"]')?.requestSubmit();
    }
});
document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el.id === 'req-text') {
        S.draft.text = el.value;
        updatePreview();
    }
    if (el.name === 'requester' && el.closest('[data-form="newjob"]'))
        S.draft.requester = el.value;
    if (el.id === 'contact-search') {
        S.contactQuery = el.value;
        const pos = el.selectionStart;
        render();
        const n = $('#contact-search');
        n?.focus();
        n?.setSelectionRange(pos, pos);
    }
    if (el.id === 'hist-search' || el.id === 'side-search') {
        S.histQuery = el.value;
        if (el.id === 'side-search' && S.route.name !== 'history') {
            go('#/history');
        }
        const id = el.id;
        const pos = el.selectionStart;
        render();
        const n = $(`#${id}`);
        n?.focus();
        n?.setSelectionRange(pos, pos);
    }
});
document.addEventListener('change', async (ev) => {
    const el = ev.target;
    if (el.name === 'channel' && el.closest('[data-form="newjob"]'))
        S.draft.channel = el.value;
    if (el.dataset.act === 'ack') {
        const job = S.job;
        if (!job)
            return;
        await run(async () => { await actionCall(el.dataset.a || '', 'ack', { code: el.dataset.code || '', value: el.checked }, job.id); renderDialog(); });
    }
    const files = el.files;
    if (el.dataset.act === 'attach' && files?.length) {
        await run(async () => {
            for (const f of Array.from(files))
                S.draft.attachments.push({ name: f.name, text: await readFile(f) });
            render();
        });
    }
    if (el.dataset.act === 'reqfile' && el.files?.[0]) {
        const f = el.files[0];
        await run(async () => { S.draft.text = await readFile(f); S.draft.sourceFile = f.name; if (/notulen|minutes|rapat/i.test(f.name))
            S.draft.channel = 'Notulen rapat'; render(); });
    }
    if (el.dataset.act === 'import' && el.files?.[0]) {
        const f = el.files[0];
        await run(async () => {
            try {
                const out = await api('/api/dataset/import', { method: 'POST', body: { fileName: f.name, text: await readFile(f) } });
                S.boot = { ...out, token: S.token };
                const r = out.report;
                toast(`Impor berhasil: ${r.contacts} kontak, ${r.holidays == null ? 'tanpa kalender libur' : `${r.holidays} hari libur`}, aturan ${r.rules === 'imported' ? 'dari berkas' : 'bawaan'}${r.organization ? `, organisasi ${r.organization}` : ''}.${r.warnings.length ? ` ${r.warnings.length} peringatan: ${r.warnings.slice(0, 2).join('; ')}` : ''}`);
                render();
            }
            catch (e) {
                throw new Error(`Impor gagal: ${errorMessage(e)}`);
            }
        });
    }
});
document.addEventListener('submit', async (ev) => {
    const form = ev.target;
    const kind = form.dataset.form;
    if (!kind)
        return;
    ev.preventDefault();
    const fd = new FormData(form);
    const v = (k) => String(fd.get(k) ?? '').trim();
    if (kind === 'answer' && !v('value')) {
        toast('Pilih atau isi jawabannya dulu.', 'err');
        return;
    }
    if (kind === 'answer')
        await run(async () => { await actionCall(form.dataset.a || '', 'answer', { questionId: form.dataset.q || '', value: v('value') }); render(); });
    if (kind === 'newcontact') {
        await run(async () => {
            await actionCall(form.dataset.a || '', 'answer', { questionId: form.dataset.q || '', newContact: { name: v('name'), email: v('email'), timezone: v('timezone'), role: v('role'), kind: v('kind') } });
            S.newContactFor = null;
            render();
        }, 'Kontak disimpan ke data organisasi.');
    }
    if (kind === 'edit') {
        const a = form.dataset.a || '';
        const patch = {};
        for (const [k, val] of fd.entries())
            if (!['toIds', 'participantIds'].includes(k))
                patch[k] = String(val);
        if (form.querySelector('[name="toIds"]'))
            patch.toIds = fd.getAll('toIds').map(String);
        if (form.querySelector('[name="participantIds"]'))
            patch.participantIds = fd.getAll('participantIds').map(String);
        await run(async () => { await actionCall(a, 'edit', { patch }); S.editing = null; render(); }, `Versi baru ${a} tersimpan. Persetujuan sebelumnya tidak berlaku.`);
    }
    if (kind === 'newjob') {
        const text = $('#req-text').value;
        S.draft.text = text;
        S.draft.requester = v('requester');
        S.draft.channel = v('channel');
        await run(async () => {
            const out = await api('/api/jobs', { method: 'POST', body: { text, requester: S.draft.requester, channel: S.draft.channel, attachments: S.draft.attachments, planner: S.draft.planner } });
            S.draft = { mode: 'text', text: '', requester: '', channel: 'Chat tim', attachments: [], planner: S.draft.planner, sourceFile: '' };
            S.job = out.job;
            await loadBoot();
            go(`#/inbox/${out.job.id}`);
        });
    }
    if (kind === 'settings') {
        await run(async () => {
            const out = await api('/api/settings', { method: 'PUT', body: {
                    orgName: v('orgName'), orgDomains: v('orgDomains'), operatorName: v('operatorName'), operatorRole: v('operatorRole'),
                    defaultTimezone: v('defaultTimezone'), refDate: { mode: v('refMode'), fixed: v('refFixed') || null }, planner: v('planner') || 'rules',
                } });
            S.boot = { ...out, token: S.token };
            render();
        }, 'Pengaturan disimpan.');
    }
    if (kind === 'holiday-one') {
        if (!v('date')) {
            toast('Pilih tanggalnya dulu.', 'err');
            return;
        }
        await run(async () => {
            const out = await api('/api/dataset/holidays', { method: 'POST', body: { date: v('date'), name: v('name') } });
            S.boot = { ...out, token: S.token };
            render();
        }, 'Hari libur ditambahkan.');
    }
    if (kind === 'holiday-list') {
        await run(async () => {
            const out = await api('/api/dataset/holidays', { method: 'POST', body: { text: v('text') } });
            const { added, skipped, ...payload } = out;
            S.boot = { ...payload, token: S.token };
            render();
            toast(`${added} tanggal ditambahkan.${skipped.length ? ` ${skipped.length} baris tidak terbaca: ${skipped.slice(0, 2).join('; ')}` : ''}`, skipped.length ? 'err' : 'ok');
        });
    }
    if (kind === 'contact') {
        const id = S.contactSel && S.contactSel !== 'new' ? S.contactSel : null;
        const contact = { name: v('name'), email: v('email'), role: v('role'), city: v('city'), timezone: v('timezone'), kind: v('kind'), aliases: v('aliases'), members: v('members') };
        await run(async () => {
            const out = await api(id ? `/api/dataset/contacts/${encodeURIComponent(id)}` : '/api/dataset/contacts', { method: id ? 'PUT' : 'POST', body: { contact } });
            const { contact: saved, warning, ...payload } = out;
            S.boot = { ...payload, token: S.token };
            S.contactSel = saved.id;
            render();
            toast(warning ? `Kontak disimpan, tetapi ${warning}.` : 'Kontak disimpan.', warning ? 'err' : 'ok');
        });
    }
});
$('#dlg').addEventListener('close', () => { S.dlg = null; });
/* ------------------------------------------------------------ start */
initControls();
/** Guide page: mark the section being read in the "Di halaman ini" list. */
function updateGuideToc() {
    const links = document.querySelectorAll('.gd-toc a[data-id]');
    if (!links.length)
        return;
    let current = links[0].dataset.id;
    for (const a of Array.from(links)) {
        const sec = document.getElementById(a.dataset.id || '');
        if (sec && sec.getBoundingClientRect().top < 140)
            current = a.dataset.id;
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4)
        current = links[links.length - 1].dataset.id;
    links.forEach((a) => { if (a.dataset.id === current)
        a.setAttribute('aria-current', 'page');
    else
        a.removeAttribute('aria-current'); });
}
window.addEventListener('scroll', updateGuideToc, { passive: true });
window.addEventListener('hashchange', () => { closeControl(false); onRoute(); });
setInterval(tick, 1000);
setInterval(() => { syncIfQueued().catch(() => { }); }, 1500);
(async () => {
    try {
        await loadBoot();
    }
    catch (e) {
        $('#view').innerHTML = `<div class="empty"><span class="empty-ico">${ico('alertCircle', 20)}</span><h2>Server Berezz tidak terjangkau</h2><p>Jalankan <code>npm start</code> di folder proyek, lalu muat ulang halaman ini. (${esc(errorMessage(e))})</p></div>`;
        return;
    }
    if (!location.hash && (!orgReady() || !boot().jobs.length))
        location.hash = '#/setup';
    await onRoute();
})();
const debugWindow = window;
debugWindow.Berezz = { get state() { return S; }, api, engine: E };
