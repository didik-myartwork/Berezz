/**
 * Berezz — shared case engine for the 20 team-made test cases (T01–T20).
 *
 * LABEL: these cases and the dataset are made by the Berezz team in the style of the
 * handbook's example tests. They are NOT the organiser's official dataset or tests.
 *
 *   Dataset : datasets/organisasi-uji/dataset.json (imported with D.importDataset)
 *   Cases   : tests/cases/cases.json (override with env BEREZZ_CASES=<path>)
 *   Engine  : app/engine.js (compiled from src/ by `npm run build`)
 *
 * Used by tests/cases.test.mjs (headless, node:test) and by any second runner that
 * replays the same steps elsewhere (e.g. against the HTTP server) and only needs
 * buildView() + evaluateChecks() + variantFailures().
 *
 * ---------------------------------------------------------------- case format
 * { id, title, handbook, referenceDate, input: { text, requester, channel,
 *   attachments: ["lampiran/x.md"], plan?, planner? }, variants?, steps, expected, checks }
 *
 * Every case gets a fresh session pinned to `referenceDate` (the "today" Berezz resolves
 * "besok", "Jumat", "Senin depan" against). A virtual clock starts at 09:00 WIB on that
 * date; only `undo`/`settle` advance it.
 *
 * ---------------------------------------------------------------------- steps
 * { do: "answer", action, kind?, match? | value? | option? | unknown?, optional? }
 *     Answers action.questions[0]. `kind` asserts the question kind (recipient, content,
 *     subject, source, date, timezone, time, slot). With `optional: true` the step is
 *     skipped when that kind is not being asked. `match` picks the first option whose
 *     label/detail contains the text (case-insensitive); `value` sends a literal value;
 *     `option` picks by index among the real options (the "Belum bisa dipastikan" option
 *     excluded); `unknown` answers "Belum bisa dipastikan" (E.UNKNOWN).
 * { do: "ack", action, code }              E.acknowledge (extra confirmation checkbox)
 * { do: "approve", action, version? }      E.approveAction with the version on screen
 *                                          (defaults to the current version)
 * { do: "enqueue", action }                E.enqueueApproved: the only door to the tools
 * { do: "edit", action, patch }            E.editAction
 * { do: "cancel", action }                 E.cancelAction
 * { do: "undo", action, afterSeconds }     advance the clock, then E.undoAction
 * { do: "settle", afterSeconds }           advance the clock, then E.settleQueue
 * { do: "check", checks: [...] }           assert checks at this point of the flow
 * Any step may carry `expectError: true | "substring"`: the step must throw (and the
 * message must contain the substring). Step errors are kept in `errors[stepIndex]`
 * (null when the step succeeded, "skipped" is not an error).
 *
 * --------------------------------------------------------------------- checks
 * Path checks: { path, <operator>, note? }. Paths use dots and [n] over this view:
 *   ok, error, errorCode, input, actions[], byId.<A1>, actionTypes[], statuses[],
 *   globalFindings[], globalFindingCodes[], audit[], auditTypes[], auditByType.<type>[],
 *   toolCalls[] (audit tool_result entries), toolCallActionIds[], allPeopleIds[],
 *   review, errors[], variantsResults[], defaultTimezone
 * Each action view: id, type, status, version, rounds, fields, source, result
 *   (+ result.payloadPeopleIds), approvedFingerprint, history, findings, findingCodes,
 *   findingMessages, question (= questions[0]), questionKind, optionLabels, optionValues,
 *   optionTexts ("<label> <tag>"), peopleIds (to / participants / owner), requiredAckCodes,
 *   proposal (first slot proposal in the findings).
 * Operators: equals (deep), notEquals, contains (substring, or array element deep-equal /
 *   object subset), notContains, containsAll, length, exists (true/false), matches (regex;
 *   a leading "(?i)" makes it case-insensitive), someMatches (some array element matches
 *   regex), equalsPath (deep-equal to another path).
 * Typed checks:
 *   { type: "noToolCall" }                no connector call and nothing queued/delivered
 *   { type: "toolCallsOnlyAfterApproval"} every queued/tool_result entry follows an
 *                                         approve entry of the same action, and the
 *                                         delivered fingerprint equals the approved one
 *   { type: "sourceQuotesInInput" }       every live action quotes the request verbatim
 *   { type: "auditOrder", types: [...] }  audit types appear in this order
 *   { type: "auditWellFormed" }           every entry has seq, at, actor, toolMode simulasi
 *   { type: "slotRespectsRules", action } the proposed slot is a working day, not a
 *                                         holiday, inside office hours and outside Friday
 *                                         prayer, in the meeting zone AND in the local zone
 *                                         of every participant
 *   { type: "fieldsRespectRules", action } same rules applied to the meeting's own fields
 *   { anyOf: [checks] }                   at least one sub-check passes
 *
 * Global invariant checked after every case: toolCallsOnlyAfterApproval.
 * Variants (`variants: [{ text, errorCode }]`): extra inputs run on fresh sessions; each
 * must be rejected with that error code, create no action and call no tool.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = join(ROOT, 'datasets', 'organisasi-uji');
export const CASES_FILE = process.env.BEREZZ_CASES || join(ROOT, 'tests', 'cases', 'cases.json');

const D = await import(join(ROOT, 'app', 'dataset.js'));
export const E = await import(join(ROOT, 'app', 'engine.js'));

/* ------------------------------------------------------------------ loading */

/** Import the test organisation exactly as the app would. */
export function loadDataset() {
  const text = readFileSync(join(DATA_DIR, 'dataset.json'), 'utf8');
  const json = JSON.parse(text);
  const { dataset, report } = D.importDataset(D.emptyDataset(), { fileName: 'dataset.json', text });
  return { dataset, organization: json.organization, report, label: json._label, json };
}

/** Full suite file ({ _label, cases }). */
export function loadSuite(file = CASES_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The case list. */
export function loadCases(file = CASES_FILE) {
  return loadSuite(file).cases;
}

/** Settings for one case: organisation name/domains and the case's pinned reference date. */
export function buildSettings(caseDef, organization) {
  const settings = D.defaultSettings();
  if (organization) {
    settings.orgName = organization.name || '';
    settings.orgDomains = [...(organization.domains || [])];
  }
  if (caseDef?.referenceDate) settings.refDate = { mode: 'fixed', fixed: caseDef.referenceDate };
  return settings;
}

/** Attachments of a case as [{ name, text }] (paths are relative to the dataset folder). */
export function readAttachments(caseDef) {
  return (caseDef.input.attachments || []).map((p) => ({ name: p.split('/').pop(), text: readFileSync(join(DATA_DIR, p), 'utf8') }));
}

/** Virtual clock start for a case: 09:00 WIB on the reference date. */
export function clockStartMs(caseDef) {
  return Date.parse(`${caseDef.referenceDate}T09:00:00+07:00`);
}

/* ------------------------------------------------------------------ helpers */

const TZ_OFFSET = { WIB: 420, WITA: 480, WIT: 540 };
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const weekday = (d) => new Date(`${d}T00:00:00Z`).getUTCDay();
const convert = (min, from, to) => min - TZ_OFFSET[from] + TZ_OFFSET[to];
const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;

function deepEqual(a, b) {
  try { assert.deepStrictEqual(a, b); return true; } catch { return false; }
}
function subsetEqual(sub, obj) {
  if (sub === null || typeof sub !== 'object') return deepEqual(sub, obj);
  if (obj === null || typeof obj !== 'object') return false;
  return Object.keys(sub).every((k) => subsetEqual(sub[k], obj[k]));
}
function regex(p) {
  const s = String(p);
  return s.startsWith('(?i)') ? new RegExp(s.slice(4), 'i') : new RegExp(s);
}
export function get(obj, path) {
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
const short = (v) => {
  const s = JSON.stringify(v);
  return s === undefined ? 'undefined' : s.length > 220 ? `${s.slice(0, 220)}…` : s;
};

function peopleOf(type, fields) {
  if (!fields) return [];
  if (type === 'email') return fields.to || [];
  if (type === 'meeting') return fields.participants || [];
  return fields.owner ? [fields.owner] : [];
}

/* --------------------------------------------------------------------- view */

function actionView(a) {
  const q = a.questions?.[0] || null;
  const findings = a.findings || [];
  return {
    id: a.id,
    type: a.type,
    status: a.status,
    version: a.version,
    rounds: a.rounds,
    fields: a.fields || {},
    source: a.source,
    result: a.result ? { ...a.result, payloadPeopleIds: peopleOf(a.type, a.result.payload).map((p) => p.id) } : null,
    approvedFingerprint: a.approvedFingerprint ?? null,
    history: a.history || [],
    findings,
    findingCodes: findings.map((f) => f.code),
    findingMessages: findings.map((f) => f.message),
    question: q,
    questionKind: q ? q.kind : null,
    optionLabels: q ? q.options.map((o) => o.label) : [],
    optionValues: q ? q.options.map((o) => o.value) : [],
    optionTexts: q ? q.options.map((o) => `${o.label}${o.tag ? ` ${o.tag}` : ''}`) : [],
    peopleIds: peopleOf(a.type, a.fields).map((p) => p.id),
    // Same rule as E.requiredAcks: every "confirm" finding needs an extra checkbox.
    requiredAckCodes: findings.filter((f) => f.severity === 'confirm').map((f) => f.code),
    proposal: findings.find((f) => f.proposal)?.proposal || null,
  };
}

/**
 * The check view. `session` may be a live engine session or plain JSON with
 * { rawInput, actions, findingsGlobal, audit, review, settings? } — no dataset or clock needed.
 * `extras`: { ok, error, errors, variantsResults, defaultTimezone }.
 */
export function buildView(session, extras = {}) {
  const rawActions = session.actions || [];
  const audit = session.audit || [];
  const findingsGlobal = session.findingsGlobal || [];
  const actions = rawActions.map(actionView);
  const byId = Object.fromEntries(actions.map((a) => [a.id, a]));
  const auditByType = {};
  for (const e of audit) (auditByType[e.type] ||= []).push(e);
  const toolCalls = audit.filter((e) => e.type === 'tool_result');
  const error = extras.error ?? null;
  return {
    ok: extras.ok ?? (!error && actions.length > 0),
    error,
    errorCode: error?.code ?? null,
    input: session.rawInput ?? '',
    actions,
    byId,
    actionTypes: actions.map((a) => a.type),
    statuses: actions.map((a) => a.status),
    globalFindings: findingsGlobal,
    globalFindingCodes: findingsGlobal.map((f) => f.code),
    audit,
    auditTypes: audit.map((e) => e.type),
    auditByType,
    toolCalls,
    toolCallActionIds: toolCalls.map((e) => e.detail?.actionId),
    allPeopleIds: actions.flatMap((a) => a.peopleIds),
    review: session.review ?? null,
    errors: extras.errors || [],
    variantsResults: extras.variantsResults || [],
    defaultTimezone: extras.defaultTimezone || session.settings?.defaultTimezone || 'WIB',
  };
}

/* ------------------------------------------------------------------- rules */

/** Problems with a meeting slot against the organisation's SOP, in every relevant zone. */
function slotProblems(slot, participants, dataset) {
  const out = [];
  const rules = dataset.rules;
  if (!slot || !slot.date || !slot.start) return ['slot tidak lengkap (tanggal/jam kosong)'];
  const tz = slot.timezone;
  if (!TZ_OFFSET[tz]) return [`zona slot tidak diketahui: ${tz}`];
  const s = toMin(slot.start);
  const e = toMin(slot.end) ?? s + rules.meetingDefaultMinutes;
  const hol = (dataset.holidays || []).find((h) => h.date === slot.date);
  if (hol) out.push(`${slot.date} hari libur (${hol.name})`);
  const wd = weekday(slot.date);
  if (!rules.officeHours.weekdays.includes(wd)) out.push(`${slot.date} bukan hari kerja`);
  const zones = [...new Set([tz, ...participants.map((p) => p.timezone).filter(Boolean)])];
  const open = toMin(rules.officeHours.start);
  const close = toMin(rules.officeHours.end);
  const pS = toMin(rules.fridayPrayer.start);
  const pE = toMin(rules.fridayPrayer.end);
  for (const z of zones) {
    const ls = convert(s, tz, z);
    const le = convert(e, tz, z);
    if (ls < open || le > close) out.push(`${slot.start}–${slot.end} ${tz} = ${fmt(ls)}–${fmt(le)} ${z}, di luar jam kerja ${rules.officeHours.start}–${rules.officeHours.end}`);
    if (wd === 5 && ls < pE && le > pS) out.push(`${fmt(ls)}–${fmt(le)} ${z} bertabrakan dengan salat Jumat ${rules.fridayPrayer.start}–${rules.fridayPrayer.end}`);
  }
  return out;
}

/* ------------------------------------------------------------------ checks */

let cachedDataset = null;
const defaultDataset = () => (cachedDataset ||= loadDataset().dataset);

function evalCheck(c, view, dataset) {
  if (c.anyOf) {
    const results = c.anyOf.map((x) => evalCheck(x, view, dataset));
    return results.some((r) => r === null) ? null : `anyOf gagal: ${results.join(' | ')}`;
  }
  if (c.type) return evalTyped(c, view, dataset);
  const v = get(view, c.path);
  const p = c.path;
  if ('equals' in c) return deepEqual(v, c.equals) ? null : `${p}: diharapkan ${short(c.equals)}, didapat ${short(v)}`;
  if ('notEquals' in c) return !deepEqual(v, c.notEquals) ? null : `${p}: tidak boleh ${short(c.notEquals)}`;
  if ('equalsPath' in c) { const w = get(view, c.equalsPath); return v !== undefined && deepEqual(v, w) ? null : `${p} (${short(v)}) ≠ ${c.equalsPath} (${short(w)})`; }
  if ('length' in c) return Array.isArray(v) && v.length === c.length ? null : `${p}: panjang diharapkan ${c.length}, didapat ${Array.isArray(v) ? v.length : short(v)}${Array.isArray(v) && v.length ? ` ${short(v.map((x) => x?.id ?? x))}` : ''}`;
  if ('exists' in c) return (v !== undefined && v !== null) === c.exists ? null : `${p}: exists=${c.exists}, didapat ${short(v)}`;
  const has = (x) => (typeof v === 'string' ? typeof x === 'string' && v.includes(x) : Array.isArray(v) && v.some((y) => (typeof x === 'object' ? subsetEqual(x, y) : deepEqual(x, y))));
  if ('contains' in c) return has(c.contains) ? null : `${p}: diharapkan memuat ${short(c.contains)}, didapat ${short(v)}`;
  if ('notContains' in c) return (v === undefined || v === null || !has(c.notContains)) ? null : `${p}: tidak boleh memuat ${short(c.notContains)}, didapat ${short(v)}`;
  if ('containsAll' in c) { const miss = c.containsAll.filter((x) => !has(x)); return miss.length ? `${p}: tidak memuat ${short(miss)}; didapat ${short(v)}` : null; }
  if ('matches' in c) return typeof v === 'string' && regex(c.matches).test(v) ? null : `${p}: tidak cocok dengan /${c.matches}/, didapat ${short(v)}`;
  if ('someMatches' in c) return Array.isArray(v) && v.some((x) => regex(c.someMatches).test(String(x))) ? null : `${p}: tidak ada elemen yang cocok dengan /${c.someMatches}/; didapat ${short(v)}`;
  return `cek tidak dikenal: ${short(c)}`;
}

function evalTyped(c, view, dataset) {
  switch (c.type) {
    case 'noToolCall': {
      const bad = view.actions.filter((a) => ['queued', 'simulated'].includes(a.status) || a.result);
      if (view.toolCalls.length || bad.length) return `ada panggilan tool/antrean: ${short(view.toolCallActionIds)} ${short(bad.map((a) => `${a.id}:${a.status}`))}`;
      return null;
    }
    case 'toolCallsOnlyAfterApproval': {
      const problems = [];
      view.audit.forEach((e, i) => {
        if (!['queued', 'tool_result'].includes(e.type)) return;
        const id = e.detail?.actionId;
        const approvals = view.audit.slice(0, i).filter((x) => x.type === 'approve' && x.detail?.actionId === id);
        if (!approvals.length) problems.push(`${e.type} untuk ${id} tanpa approve sebelumnya`);
      });
      for (const a of view.actions) {
        if (!a.result) continue;
        const last = view.audit.filter((x) => x.type === 'approve' && x.detail?.actionId === a.id).pop();
        if (a.result.fingerprint !== last?.detail?.fingerprint) problems.push(`${a.id}: sidik jari hasil tidak sama dengan persetujuan terakhir`);
      }
      return problems.length ? problems.join('; ') : null;
    }
    case 'sourceQuotesInInput': {
      const bad = view.actions.filter((a) => a.status !== 'cancelled' && (!a.source?.quote || !view.input.includes(a.source.quote)));
      return bad.length ? `kutipan sumber tidak ada di input: ${short(bad.map((a) => a.id))}` : null;
    }
    case 'auditOrder': {
      let i = 0;
      for (const e of view.audit) if (e.type === c.types[i]) i++;
      return i === c.types.length ? null : `urutan audit tidak lengkap; berhenti di "${c.types[i]}". Didapat ${short(view.auditTypes)}`;
    }
    case 'auditWellFormed': {
      const bad = view.audit.filter((e) => !e.seq || !e.at || !e.actor || e.toolMode !== 'simulasi' || Number.isNaN(Date.parse(e.at)));
      return bad.length ? `entri audit tidak lengkap: ${short(bad.map((e) => e.seq))}` : null;
    }
    case 'slotRespectsRules': {
      const a = view.byId[c.action];
      if (!a) return `${c.action} tidak ada`;
      if (!a.proposal) return `${c.action}: tidak ada usulan slot (temuan: ${short(a.findingCodes)})`;
      const probs = slotProblems(a.proposal, a.fields.participants || [], dataset);
      return probs.length ? `${c.action}: usulan ${short(a.proposal)} melanggar aturan: ${probs.join('; ')}` : null;
    }
    case 'fieldsRespectRules': {
      const a = view.byId[c.action];
      if (!a) return `${c.action} tidak ada`;
      const F = a.fields;
      const probs = slotProblems({ date: F.date, start: F.start, end: F.end, timezone: F.timezone || view.defaultTimezone }, F.participants || [], dataset);
      return probs.length ? `${c.action}: ${F.date} ${F.start}–${F.end} ${F.timezone} melanggar aturan: ${probs.join('; ')}` : null;
    }
    default:
      return `cek bertipe tidak dikenal: ${c.type}`;
  }
}

/**
 * Evaluate checks against a view. Returns failure strings (empty = pass).
 * `opts.dataset` supplies rules/holidays for the slot checks (defaults to the test dataset).
 */
export function evaluateChecks(view, checks = [], opts = {}) {
  const dataset = opts.dataset || defaultDataset();
  const out = [];
  for (const c of checks) {
    const err = evalCheck(c, view, dataset);
    if (err) out.push(`${opts.prefix || ''}${err}${c.note ? ` — ${c.note}` : ''}`);
  }
  return out;
}

/** Global invariant applied to every case. */
export function invariantFailures(view, opts = {}) {
  return evaluateChecks(view, [{ type: 'toolCallsOnlyAfterApproval' }], { ...opts, prefix: 'invarian: ' });
}

/**
 * Variant results: [{ text, ok, error, actions, audit }] (or a view per variant).
 * Each must be rejected with the case's expected error code, with no action and no tool call.
 */
export function variantFailures(caseDef, variantsResults = []) {
  const out = [];
  (caseDef.variants || []).forEach((v, i) => {
    const r = variantsResults[i];
    const label = `varian ${short(v.text)}`;
    if (!r) { out.push(`${label}: tidak dijalankan`); return; }
    const vv = r.actions && r.byId ? r : buildView({ rawInput: v.text, actions: r.actions || [], audit: r.audit || [], findingsGlobal: [] }, { ok: r.ok, error: r.error });
    if (vv.ok !== false || vv.errorCode !== v.errorCode) out.push(`${label}: diharapkan ${v.errorCode}, didapat ok=${vv.ok} ${vv.errorCode}`);
    if (vv.actions.length) out.push(`${label}: membuat ${vv.actions.length} aksi`);
    out.push(...evaluateChecks(vv, [{ type: 'noToolCall' }], { prefix: `${label}: ` }));
  });
  return out;
}

/* -------------------------------------------------------------- headless run */

function startRun(caseDef, text) {
  const { dataset, organization } = loadDataset();
  const settings = buildSettings(caseDef, organization);
  const run = { dataset, settings, now: clockStartMs(caseDef), errors: [], failures: [] };
  run.session = E.createSession(dataset, settings, { systemDate: caseDef.referenceDate, clock: () => new Date(run.now).toISOString() });
  run.result = E.intake(run.session, {
    text,
    attachments: readAttachments(caseDef),
    plan: caseDef.input.plan || null,
    planner: caseDef.input.plan ? { name: caseDef.input.planner || 'Planner model (uji)' } : null,
    actor: caseDef.input.requester || 'pengguna',
  });
  return run;
}

const viewOf = (run) => buildView(run.session, { ok: run.result.ok, error: run.result.error || null, errors: run.errors, defaultTimezone: run.settings.defaultTimezone });

/** Execute one step against a live engine session (semantics documented above). */
function applyStep(run, step) {
  const { session } = run;
  const id = step.action;
  switch (step.do) {
    case 'answer': {
      const a = session.actions.find((x) => x.id === id);
      if (!a) throw new Error(`[runner] aksi ${id} tidak ada`);
      const q = a.questions[0];
      if (step.kind && (!q || q.kind !== step.kind)) {
        if (step.optional) return 'skipped';
        throw new Error(`[runner] ${id}: diharapkan pertanyaan "${step.kind}", yang ditanyakan ${q ? `"${q.kind}" (${q.text})` : 'tidak ada'} (status ${a.status})`);
      }
      if (!q) throw new Error(`[runner] ${id}: tidak ada pertanyaan (status ${a.status})`);
      return E.answerClarification(session, id, q.id, answerValue(q, step, id));
    }
    case 'ack': return E.acknowledge(session, id, step.code);
    case 'approve': {
      const a = session.actions.find((x) => x.id === id);
      return E.approveAction(session, id, { version: step.version ?? a?.version });
    }
    case 'enqueue': return E.enqueueApproved(session, id, run.now);
    case 'edit': return E.editAction(session, id, step.patch);
    case 'cancel': return E.cancelAction(session, id);
    case 'undo': run.now += (step.afterSeconds || 0) * 1000; return E.undoAction(session, id, run.now);
    case 'settle': run.now += (step.afterSeconds || 0) * 1000; return E.settleQueue(session, run.now);
    case 'check':
      run.failures.push(...evaluateChecks(viewOf(run), step.checks, { dataset: run.dataset, prefix: `langkah ${run.stepIndex} (check): ` }));
      return null;
    default: throw new Error(`[runner] langkah tidak dikenal: ${step.do}`);
  }
}

/** Resolve the value an `answer` step sends for question `q` (shared with other runners). */
export function answerValue(q, step, id = '') {
  if (step.unknown) return E.UNKNOWN;
  if ('value' in step) return step.value;
  if ('option' in step) {
    const opt = q.options.filter((o) => o.value !== E.UNKNOWN)[step.option];
    if (!opt) throw new Error(`[runner] ${id}: opsi #${step.option} tidak ada di ${short(q.options.map((o) => o.label))}`);
    return opt.value;
  }
  const m = String(step.match).toLowerCase();
  const opt = q.options.find((o) => `${o.label} ${o.detail || ''}`.toLowerCase().includes(m));
  if (!opt) throw new Error(`[runner] ${id}: opsi "${step.match}" tidak ada di ${short(q.options.map((o) => o.label))}`);
  return opt.value;
}

/** Compare a step outcome with its `expectError`. Returns a failure string or null. */
export function stepOutcomeFailure(step, index, error) {
  const label = `langkah ${index} (${step.do}${step.action ? ` ${step.action}` : ''})`;
  if (step.expectError) {
    if (!error) return `${label}: seharusnya ditolak, tetapi berhasil`;
    if (typeof step.expectError === 'string' && !String(error.message ?? error).includes(step.expectError)) return `${label}: pesan galat "${error.message ?? error}" tidak memuat "${step.expectError}"`;
    return null;
  }
  return error ? `${label}: galat tak terduga: ${error.message ?? error}` : null;
}

/** Run one case against app/engine.js. */
export function runCaseHeadless(caseDef) {
  const run = startRun(caseDef, caseDef.input.text);
  (caseDef.steps || []).forEach((step, i) => {
    run.stepIndex = i;
    let error = null;
    try { applyStep(run, step); } catch (e) { error = e; }
    run.errors[i] = error ? error.message : null;
    const f = stepOutcomeFailure(step, i, error);
    if (f) run.failures.push(f);
  });
  const variantsResults = (caseDef.variants || []).map((v) => {
    const r = startRun(caseDef, v.text);
    return { text: v.text, ok: r.result.ok, error: r.result.error || null, actions: r.session.actions, audit: r.session.audit };
  });
  const view = buildView(run.session, { ok: run.result.ok, error: run.result.error || null, errors: run.errors, variantsResults, defaultTimezone: run.settings.defaultTimezone });
  const failures = [
    ...run.failures,
    ...evaluateChecks(view, caseDef.checks, { dataset: run.dataset, prefix: 'akhir: ' }),
    ...invariantFailures(view, { dataset: run.dataset }),
    ...variantFailures(caseDef, variantsResults),
  ];
  return { session: run.session, view, failures, stepErrors: run.errors };
}
