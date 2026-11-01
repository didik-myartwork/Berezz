import type {
  Action,
  ActionFields,
  ActionType,
  Attachment,
  ClarificationQuestion,
  Contact,
  ContactRef,
  Dataset,
  Finding,
  ProposedAction,
  ReviewFinding,
  ReviewReport,
  Session,
  Settings,
  Timezone,
} from './types.js';
import { contactRef } from './dataset.js';

/**
 * Berezz engine — deterministic, auditable pipeline for ONE job.
 *
 *   intake → planner (rules or a proposed model plan, grounded here) → validator
 *   → clarifier → reviewer (second, independent pass) → approval gate → queue
 *   (60 s undo) → simulated connector → audit
 *
 * Constraints enforced in code, not in prose:
 *  - No planner holds an execution tool. `enqueueApproved()` is the only door to the
 *    connectors and refuses anything not `approved` or whose fingerprint changed.
 *  - Recipients, dates and times are always derived from the quoted source and the
 *    organisation's own data. A model plan may only contribute drafting text.
 *  - A name that is not in the contact data is asked about, never guessed.
 *  - Text inside attachments is data. Lines addressing the agent are flagged and
 *    never become actions.
 */

/* ------------------------------------------------------------------ utils */

const WEEKDAYS: Record<string, number> = {
  minggu: 0, ahad: 0, sunday: 0,
  senin: 1, monday: 1,
  selasa: 2, tuesday: 2,
  rabu: 3, wednesday: 3,
  kamis: 4, thursday: 4,
  jumat: 5, "jum'at": 5, friday: 5,
  sabtu: 6, saturday: 6,
};

const MONTHS: Record<string, number> = {
  januari: 1, january: 1, jan: 1, februari: 2, february: 2, feb: 2, maret: 3, march: 3, mar: 3,
  april: 4, apr: 4, mei: 5, may: 5, juni: 6, june: 6, jun: 6, juli: 7, july: 7, jul: 7,
  agustus: 8, august: 8, agu: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, october: 10, okt: 10, oct: 10,
  november: 11, nov: 11, desember: 12, december: 12, des: 12, dec: 12,
};
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const NUMBER_WORDS: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
  sebelas: 11, 'dua belas': 12, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

export function pad2(n) { return String(n).padStart(2, '0'); }
export function isoDate(d) { return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
export function parseISO(dateStr) { return new Date(`${dateStr}T00:00:00Z`); }
export function addDays(dateStr, n) {
  const d = parseISO(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
export function weekdayOf(dateStr) { return parseISO(dateStr).getUTCDay(); }
export function minutesToHHMM(m) { return `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`; }
export function hhmmToMinutes(s) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function convertTimezone(minutes, fromTz, toTz, tzTable) {
  const a = tzTable[fromTz], b = tzTable[toTz];
  if (!a || !b || minutes == null) return null;
  const out = minutes - a.offsetMinutes + b.offsetMinutes;
  return ((out % 1440) + 1440) % 1440;
}

export const DATE_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
export const DATE_ID_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const MONTH_ID = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const MONTH_ID_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function humanDate(dateStr) {
  const d = parseISO(dateStr);
  return `${DATE_ID[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_ID[d.getUTCMonth() + 1]} ${d.getUTCFullYear()}`;
}
export function shortDate(dateStr) {
  const d = parseISO(dateStr);
  return `${DATE_ID_SHORT[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_ID_SHORT[d.getUTCMonth() + 1]}`;
}

export function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * FNV-1a 64-bit content fingerprint. Binds an approval to one exact version of an
 * action. Non-cryptographic; a production deployment should use HMAC-SHA256.
 */
export function fingerprint(value) {
  const str = stableStringify(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return `fp1_${hash.toString(16).padStart(16, '0')}`;
}

const fpOf = (a: Action) => fingerprint({ type: a.type, fields: a.fields, version: a.version });

/** Today's date in the sender's zone, unless the settings pin a fixed reference date. */
export function referenceDate(settings: Settings, now = new Date(), tzTable?) {
  if (settings.refDate?.mode === 'fixed' && /^\d{4}-\d{2}-\d{2}$/.test(settings.refDate.fixed || '')) return settings.refDate.fixed;
  const offset = tzTable?.[settings.defaultTimezone]?.offsetMinutes ?? 420;
  return isoDate(new Date(now.getTime() + offset * 60000));
}

/* --------------------------------------------------------------- session */

export function createSession(dataset: Dataset, settings: Settings, opts: { systemDate?: string; clock?: () => string } = {}): Session {
  return {
    dataset,
    settings,
    systemDate: opts.systemDate || referenceDate(settings, new Date(), dataset.timezones),
    rawInput: '',
    attachments: [],
    actions: [],
    findingsGlobal: [],
    audit: [],
    planVersion: 0,
    review: null,
    planner: { mode: 'rules', name: 'Planner aturan Berezz' },
    metrics: { pipelineMs: 0, actionsPlanned: 0, questionsAsked: 0, blocked: 0, simulated: 0 },
    clock: opts.clock || (() => new Date().toISOString()),
  };
}

export function log(session: Session, type: string, detail, actor = 'sistem') {
  session.audit.push({ seq: session.audit.length + 1, at: session.clock(), type, actor, detail, toolMode: 'simulasi' });
}

/* ------------------------------------------------------------ text tools */

const CONNECTOR_LEAD = /^(?:dan|lalu|terus|trus|kemudian|serta|and|then|also|tolong|mohon|please|plus)\b[\s,]*/i;

function rawClauses(text: string) {
  const out = [];
  const sep = /[,;]\s+|[.!?]\s+|\n+|\s+(?:dan|and|lalu|terus|trus|kemudian|serta|then)\s+/gi;
  let last = 0;
  let m;
  while ((m = sep.exec(text)) !== null) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), start: last });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), start: last });
  return out.map((c) => {
    let body = c.text;
    let start = c.start;
    for (;;) {
      const lead = CONNECTOR_LEAD.exec(body);
      if (!lead || !lead[0].length) break;
      body = body.slice(lead[0].length);
      start += lead[0].length;
    }
    const trimmed = body.replace(/[\s.!?]+$/, '');
    const lpad = trimmed.length - trimmed.trimStart().length;
    return { text: trimmed.trim(), start: start + lpad };
  }).filter((c) => c.text.replace(/[^\p{L}\p{N}]/gu, '').length > 2);
}

/**
 * Split a request into clauses. A fragment with no action verb is glued to the clause
 * before it ("rapat dengan Budi dan Rina besok") so its people and dates are not lost.
 */
export function splitClauses(text: string) {
  const merged = [];
  let pending = null;
  for (const c of rawClauses(text)) {
    const prev = merged[merged.length - 1];
    const hasIntent = detectIntent(c.text);
    if (!hasIntent && prev) {
      prev.text = text.slice(prev.start, c.start + c.text.length);
    } else if (!hasIntent) {
      pending = pending || { ...c };
    } else if (pending) {
      merged.push({ start: pending.start, text: text.slice(pending.start, c.start + c.text.length) });
      pending = null;
    } else merged.push({ ...c });
  }
  if (pending) merged.push(pending);
  return merged;
}

/* ------------------------------------------------------ injection shield */

// Patterns that address the agent itself. These count in the request and in attachments.
const AGENT_PATTERNS = [
  { re: /(^|\n)\s*(ai|asisten|assistant|bot|agent|sistem|system)\s*:/i, code: 'ROLE_HEADER', label: 'baris yang menyapa agent ("AI:")' },
  { re: /abaikan\s+(semua\s+)?(instruksi|perintah|aturan)/i, code: 'IGNORE_INSTRUCTIONS', label: '"abaikan instruksi"' },
  { re: /ignore\s+(all\s+|any\s+)?(previous\s+|prior\s+)?(instructions|rules)/i, code: 'IGNORE_INSTRUCTIONS', label: '"ignore instructions"' },
  { re: /kamu\s+(adalah|sekarang)\s+(admin|administrator|sistem)/i, code: 'ROLE_ESCALATION', label: 'upaya menaikkan peran agent' },
  { re: /you\s+are\s+now\s+(an?\s+)?(admin|administrator|system)/i, code: 'ROLE_ESCALATION', label: 'upaya menaikkan peran agent' },
  { re: /ubah\s+(kebijakan|aturan)\s+(agent|ai|sistem)/i, code: 'POLICY_CHANGE', label: 'permintaan mengubah kebijakan agent' },
];
// Patterns that are only suspicious inside documents (in the request they are ordinary asks).
const DOC_PATTERNS = [
  { re: /(teruskan|forward)\s+(file|dokumen|ini|semua|notulen|berkas)/i, code: 'FORWARD_REQUEST', label: 'permintaan meneruskan berkas' },
  { re: /kirim\s+(data|gaji|semua|password|kata sandi)\b.*\bke\s+semua/i, code: 'EXFILTRATION', label: 'permintaan menyebarkan data' },
  { re: /hapus\s+(arsip|data|file|berkas)/i, code: 'DELETE_REQUEST', label: 'permintaan menghapus data' },
];

export function scanInjection(text: string, sourceLabel: string, sourceId: string, inDocument: boolean): Finding[] {
  const hits: Finding[] = [];
  const lines = String(text || '').split('\n');
  let offset = 0;
  lines.forEach((line, i) => {
    const agent = AGENT_PATTERNS.filter((p) => p.re.test(line));
    const doc = DOC_PATTERNS.filter((p) => p.re.test(line));
    const matched = inDocument ? [...agent, ...doc] : (agent.length ? [...agent, ...doc] : []);
    if (matched.length) {
      hits.push({
        code: 'INJECTION_DETECTED',
        severity: 'info',
        patterns: matched.map((m) => m.code),
        labels: matched.map((m) => m.label),
        source: sourceLabel,
        sourceId,
        line: i + 1,
        offset,
        quote: line.trim(),
        message: `Instruksi tersisip diabaikan (${matched.map((m) => m.label).join(', ')}) pada ${sourceLabel} baris ${i + 1}. Teks ini diperlakukan sebagai data, bukan perintah.`,
      });
    }
    offset += line.length + 1;
  });
  return hits;
}

/* ---------------------------------------------------------- intent & time */

const INTENT_RE: Array<[ActionType, RegExp]> = [
  ['task', /\b(tugas|task|to-?do|kerjakan|kerjain|revisi|assign|tugaskan|siapkan|siapin|selesaikan|selesain|beresin|bereskan|susun|susunin|prepare|finish)\b/],
  ['meeting', /\b(jadwalkan|jadwalin|jadwal|rapat|meeting|schedule|book|undang|invite|follow[\s-]?up|ketemu|temu|meet)\b/],
  ['email', /\b(kirim|kirimkan|kirimin|send|kabari|kabarin|kabarkan|informasikan|inform|email|e-mail|surel|balas|bales|reply|notify|ingatkan|ingetin|remind|teruskan|forward)\b/],
];
// Nouns that contain an intent word but are not a request ("notulen rapat", "ruang rapat").
const NOT_INTENT = /\b(notulen|catatan|hasil|ruang|materi|minutes of the|agenda|bahan)\s+(rapat|meeting)\b|\b(rapat|meeting)\s+(notes|minutes)\b|\bjadwal\s+(pengiriman|kirim|produksi|shift)\b/g;
// Reported content: everything after "bahwa" / "that" is what to say, not what to do.
const CONTENT_TAIL = /\s(?:bahwa|kalau|that)\s+(.+)$/i;

export function contentTail(text: string) {
  const m = CONTENT_TAIL.exec(text);
  return m ? { content: m[1].trim(), index: m.index } : null;
}

/** The action type of a clause is decided by the FIRST action verb it contains. */
export function detectIntent(text: string): ActionType | null {
  let t = text.toLowerCase().replace(NOT_INTENT, (m) => ' '.repeat(m.length));
  const tail = contentTail(t);
  if (tail) t = t.slice(0, tail.index);
  let best: { type: ActionType; at: number } | null = null;
  for (const [type, re] of INTENT_RE) {
    const m = re.exec(t);
    if (m && (!best || m.index < best.at)) best = { type, at: m.index };
  }
  return best ? best.type : null;
}

function parseTimeOfDay(text: string) {
  const t = text.toLowerCase();
  let m = /\b(?:jam|pukul|at|pk\.?)\s*(\d{1,2})[:.](\d{2})\b/.exec(t) || /\b(\d{1,2})[:.](\d{2})\s*(?:wib|wita|wit)\b/.exec(t);
  if (m) return { minutes: Number(m[1]) * 60 + Number(m[2]), assumed: false, phrase: m[0] };
  m = /\b(?:jam|pukul|at)\s*(\d{1,2}|satu|dua belas|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(\s*(?:am|pm))?/.exec(t);
  if (m) {
    let h = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    const after = t.slice(m.index, m.index + m[0].length + 12);
    if ((/\b(sore|malam|pm)\b/.test(after) || /pm/.test(m[2] || '')) && h < 12) h += 12;
    if (/\bsiang\b/.test(after) && h <= 5) h += 12;
    return { minutes: h * 60, assumed: !/^\d+$/.test(m[1]) || h <= 12, phrase: m[0].trim() };
  }
  const words: Array<[RegExp, number, string]> = [
    [/\b(tengah hari|midday|noon)\b/, 12 * 60, 'tengah hari'],
    [/\bsiang\b/, 12 * 60, 'siang'],
    [/\b(pagi|morning)\b/, 9 * 60, 'pagi'],
    [/\b(sore|afternoon)\b/, 15 * 60, 'sore'],
  ];
  for (const [re, minutes, phrase] of words) if (re.test(t)) return { minutes, assumed: true, phrase };
  return null;
}

function parseDate(text: string, systemDate: string) {
  const t = text.toLowerCase();
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso) return { date: iso[0], confidence: 'explicit', phrase: iso[0] };

  const dm = new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?\\b`).exec(t);
  if (dm) {
    const year = dm[3] ? Number(dm[3]) : Number(systemDate.slice(0, 4));
    let date = `${year}-${pad2(MONTHS[dm[2]])}-${pad2(Number(dm[1]))}`;
    if (!dm[3] && date < systemDate) date = `${year + 1}-${pad2(MONTHS[dm[2]])}-${pad2(Number(dm[1]))}`;
    return { date, confidence: dm[3] ? 'explicit' : 'derived', phrase: dm[0] };
  }
  const slash = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t);
  if (slash) return { date: `${slash[3]}-${pad2(Number(slash[2]))}-${pad2(Number(slash[1]))}`, confidence: 'explicit', phrase: slash[0] };

  if (/\b(hari ini|today)\b/.test(t)) return { date: systemDate, confidence: 'derived', phrase: /today/.test(t) ? 'today' : 'hari ini' };
  if (/\b(besok|tomorrow)\b/.test(t)) return { date: addDays(systemDate, 1), confidence: 'derived', phrase: /tomorrow/.test(t) ? 'tomorrow' : 'besok' };
  if (/\blusa\b/.test(t)) return { date: addDays(systemDate, 2), confidence: 'derived', phrase: 'lusa' };

  const vague = /\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(depan|berikutnya)\b/.exec(t)
    || /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t);
  if (vague) {
    const name = vague[1] === 'next' ? vague[2] : vague[1];
    return { date: null, confidence: 'ambiguous', phrase: vague[0], weekday: WEEKDAYS[name] ?? WEEKDAYS[vague[2]] };
  }
  const vagueWeek = /\b(minggu|pekan)\s+(ini|depan|berikutnya)\b|\b(this|next)\s+week\b|\bakhir\s+(minggu|pekan|bulan)\b/.exec(t);
  if (vagueWeek) return { date: null, confidence: 'ambiguous', phrase: vagueWeek[0] };

  const wd = /\b(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.exec(t);
  if (wd) {
    const target = WEEKDAYS[wd[1]];
    let delta = (target - weekdayOf(systemDate) + 7) % 7;
    if (delta === 0) delta = 7;
    return { date: addDays(systemDate, delta), confidence: 'derived', phrase: wd[1], weekday: target };
  }
  const dayOnly = /\btanggal\s+(\d{1,2})\b/.exec(t);
  if (dayOnly) return { date: null, confidence: 'ambiguous', phrase: dayOnly[0] };
  return null;
}

function detectTimezone(text: string): Timezone | null {
  const m = /\b(WIB|WITA|WIT)\b/i.exec(text);
  return m ? (m[1].toUpperCase() as Timezone) : null;
}

function parseLocation(text: string) {
  const t = text.toLowerCase();
  if (/\b(online|daring|zoom|google meet|gmeet|teams|virtual)\b/.test(t)) return 'Daring';
  const m = /\bdi\s+((?:ruang|kantor|lantai|gedung|meeting room|ruangan)\s+[\p{L}\p{N} ]{1,30})/iu.exec(text);
  return m ? m[1].trim() : null;
}

/* --------------------------------------------------------------- people */

const HONORIFIC = 'pak|bu|bapak|ibu|mbak|mba|mas|kak|bang|mr\\.?|mrs\\.?|ms\\.?';
const PREP = 'ke|kepada|untuk|dengan|sama|bareng|buat|to|with|for|cc';
// Verbs that are directly followed by the person they address ("minta Rina siapkan …").
const ADDRESS_VERB = 'minta|suruh|ingatkan|ingetin|kabari|kabarin|hubungi|telepon|ask|tell|remind|invite|undang';
const ROLE_WORDS = ['vendor', 'klien', 'client', 'semua staf', 'seluruh staf', 'all staff', 'direksi', 'supplier', 'pemasok', 'customer', 'pelanggan', 'tim'];
const NOT_A_NAME = new Set([
  ...Object.keys(WEEKDAYS), ...Object.keys(MONTHS), 'besok', 'lusa', 'hari', 'jam', 'pukul', 'minggu', 'pekan', 'tanggal', 'saya', 'kami', 'kita', 'anda',
  'semua', 'tolong', 'mohon', 'rapat', 'meeting', 'notulen', 'tugas', 'email', 'bahas', 'membahas', 'today', 'tomorrow', 'next', 'the', 'this', 'wib', 'wita', 'wit',
]);

const lower = (s) => String(s || '').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (hay: string, needle: string) => new RegExp(`(^|[^\\p{L}])${escapeRe(lower(needle))}([^\\p{L}]|$)`, 'u').test(lower(hay));

/** Names written in the clause: "ke Pak Budi", "dengan tim Makassar", "untuk Rina", "Bu Sari". */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  const re = new RegExp(`(?:^|[^\\p{L}])(?:(?:${PREP}|${ADDRESS_VERB})\\s+)(?:((?:${HONORIFIC}))\\s+)?((?:tim|team)\\s+[\\p{L}]+|[\\p{L}][\\p{L}'-]*(?:\\s+[\\p{L}][\\p{L}'-]*)?)`, 'giu');
  let m;
  while ((m = re.exec(text)) !== null) {
    const honor = m[1];
    const words = m[2].split(/\s+/);
    const isTeam = /^(tim|team)$/i.test(words[0]);
    const kept = [];
    if (!isTeam && ROLE_WORDS.includes(lower(words[0]))) { out.add(lower(words[0])); re.lastIndex = m.index + 1; continue; }
    for (const w of words) {
      if (!isTeam && !kept.length && !/^\p{Lu}/u.test(w) && !honor) break;
      if (kept.length && (!/^\p{Lu}/u.test(w) || NOT_A_NAME.has(lower(w)))) break;
      if (NOT_A_NAME.has(lower(w))) break;
      kept.push(w);
    }
    if (kept.length && !(kept.length === 1 && isTeam)) out.add(`${honor && !isTeam ? `${capitalize(lower(honor))} ` : ''}${kept.join(' ')}`);
    re.lastIndex = m.index + 1;
  }
  const hon = new RegExp(`(?:^|[^\\p{L}])(?:${HONORIFIC})\\s+(\\p{Lu}[\\p{L}'-]+)`, 'giu');
  while ((m = hon.exec(text)) !== null) {
    const h = /^(\S+)/.exec(m[0].replace(/^[^\p{L}]/u, ''))[1];
    if (!NOT_A_NAME.has(lower(m[1]))) out.add(`${capitalize(lower(h))} ${m[1]}`);
  }
  // Role words ("vendor", "klien") count only when addressed: "ke vendor", "kabari vendor", "balas email vendor".
  const lead = new RegExp(`(?:${PREP}|${ADDRESS_VERB}|email|balas|bales|reply|hubungi|surati)\\s+(?:email\\s+|pesan\\s+)?(?:(?:${HONORIFIC})\\s+)?$`, 'i');
  for (const r of ROLE_WORDS) {
    if (r === 'tim') continue;
    const re = new RegExp(`(^|[^\\p{L}])(${escapeRe(r)})(?=[^\\p{L}]|$)`, 'giu');
    let rm;
    while ((rm = re.exec(text)) !== null) {
      if (lead.test(text.slice(Math.max(0, rm.index - 40), rm.index + rm[1].length))) { out.add(r); break; }
    }
  }
  // Drop single words already covered by a longer mention ("Budi" inside "Budi Santoso").
  const list = [...out];
  return list.filter((a) => !list.some((b) => b !== a && b.length > a.length && lower(b).split(/\s+/).join(' ').endsWith(lower(a).split(/\s+/).slice(-1)[0]) && lower(b).includes(lower(a))));
}

const stripHonorific = (s: string) => s.replace(new RegExp(`^(?:${HONORIFIC})\\s+`, 'i'), '');

function candidatesFor(mention: string, contacts: Contact[]): Contact[] {
  const full = lower(mention).trim();
  const exactFull = contacts.filter((c) => (c.aliases || []).some((a) => lower(a) === full));
  if (exactFull.length) return exactFull;
  const m = lower(stripHonorific(mention)).trim();
  const first = m.split(/\s+/)[0];
  const exact = contacts.filter((c) => lower(c.name) === m || (c.aliases || []).some((a) => lower(a) === m || lower(a).replace(new RegExp(`^(${HONORIFIC})\\s+`), '') === m));
  if (exact.length) return exact;
  const prefix = contacts.filter((c) => lower(c.name).startsWith(`${m} `));
  if (prefix.length) return prefix;
  if (m.includes(' ')) {
    const byFirst = contacts.filter((c) => lower(c.name).split(/\s+/)[0] === first);
    if (byFirst.length === 1) return byFirst;
  }
  return [];
}

/** Loose matches offered as options when a name is not in the data. */
function fuzzyCandidates(mention: string, contacts: Contact[]): Contact[] {
  const m = lower(mention);
  const tokens = m.split(/\s+/).filter((x) => x.length > 2);
  return contacts.filter((c) => tokens.some((t) => lower(c.name).includes(t) || (c.aliases || []).some((a) => lower(a).includes(t)))).slice(0, 5);
}

function resolvePeople(text: string, dataset: Dataset) {
  const mentions = extractMentions(text);
  const resolved: Contact[] = [];
  const ambiguous: Array<{ alias: string; contacts: Contact[] }> = [];
  const unknown: string[] = [];
  for (const mention of mentions) {
    const cands = candidatesFor(mention, dataset.contacts);
    if (cands.length === 1) { if (!resolved.includes(cands[0])) resolved.push(cands[0]); }
    else if (cands.length > 1) ambiguous.push({ alias: mention, contacts: cands });
    else unknown.push(mention);
  }
  // Multi-word aliases written without a preposition (e.g. "tim makassar" in free text).
  for (const c of dataset.contacts) {
    if (resolved.includes(c) || ambiguous.some((a) => a.contacts.includes(c))) continue;
    const team = /^(tim|team)\s+(.+)$/i.exec(c.name);
    const names = [c.name, ...(c.aliases || []), ...(team ? [`${team[2]} team`] : [])].filter((n) => n.includes(' ') && !ROLE_WORDS.includes(lower(n)));
    if (names.some((n) => hasWord(text, n))) {
      resolved.push(c);
      const idx = unknown.findIndex((u) => names.some((n) => lower(n).includes(lower(u))));
      if (idx >= 0) unknown.splice(idx, 1);
    }
  }
  return { resolved, ambiguous, unknown };
}

/* ----------------------------------------------------------- drafting */

const INTENT_VERB = /^(?:tolong\s+|mohon\s+|please\s+)?(?:buat(?:kan)?\s+)?(kirim(?:kan|in)?|send|kabari|kabarin|kabarkan|informasikan|inform|email|balas|bales|reply|notify|ingatkan|ingetin|remind|teruskan|forward|jadwalkan|jadwalin|schedule|book|undang|invite|atur|minta|suruh)\b\s*/i;
const TOPIC_CUT = new RegExp(`\\s+(?:${PREP}|sebelum|paling lambat|deadline|tenggat|tanggal|hari|jam|pukul|besok|lusa|${Object.keys(WEEKDAYS).join('|')})\\b.*$`, 'i');

const FILLER = /\b(?:juga|ya|yah|dong|deh|aja|saja|nanti|segera|too|also|asap)\b/gi;

function cleanTopic(s: string) {
  return s.replace(FILLER, ' ').replace(/^(?:\s*(?:soal|tentang|terkait|mengenai|perihal|about|re|a|an|the|sebuah)\s+)+/i, '').replace(/\s{2,}/g, ' ').replace(/[\s,.;:]+$/, '').trim();
}

function capitalize(s: string) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function stripMentions(s: string, mentions: string[]) {
  let out = s;
  for (const m of mentions) out = out.replace(new RegExp(`(?:(?:${PREP})\\s+)?(?:(?:${HONORIFIC})\\s+)?${escapeRe(stripHonorific(m))}`, 'gi'), ' ');
  return out.replace(/\s{2,}/g, ' ').trim();
}

function topicOf(clause: string, mentions: string[]) {
  const about = /\b(?:bahas|membahas|untuk membahas|soal|tentang|terkait|mengenai|perihal|about|to discuss|discuss)\s+(.+)$/i.exec(clause);
  if (about) return cleanTopic(about[1].replace(TOPIC_CUT, '')) || null;
  let s = clause.replace(INTENT_VERB, '');
  s = stripMentions(s, mentions).replace(TOPIC_CUT, '');
  s = s.replace(/^(?:ke|kepada|to)\s+/i, '');
  return cleanTopic(s) || null;
}

function taskTitle(clause: string, mentions: string[]) {
  const afterTask = /\b(?:tugas|task|to-?do)\s+(.+)$/i.exec(clause);
  let s = afterTask ? afterTask[1] : clause.replace(/^(?:tolong\s+|mohon\s+)?(?:minta|suruh|ask|tell)\s+/i, '');
  s = stripMentions(s, mentions).replace(TOPIC_CUT, '');
  s = s.replace(/^(?:untuk|for)\s+/i, '').replace(/\bsiapin\b/i, 'siapkan').replace(/\bkerjain\b/i, 'kerjakan').replace(/\bselesain\b/i, 'selesaikan').replace(/\bberesin\b/i, 'bereskan');
  return capitalize(cleanTopic(s)) || null;
}

function attachmentSummary(doc: Attachment) {
  const lines = doc.text.split('\n').map((l) => l.trim()).filter(Boolean);
  const title = (lines.find((l) => /^#/.test(l)) || doc.name).replace(/^#+\s*/, '');
  const bullets = lines
    .filter((l) => !/^#/.test(l))
    .filter((l) => !scanInjection(l, '', '', true).length)
    .slice(0, 4)
    .map((l) => l.replace(/^(?:\d+[.)]|[-*•])\s*/, ''));
  return { title, bullets };
}

function contextLine(attachments: Attachment[], keys: string[]) {
  const ks = keys.filter(Boolean).map(lower);
  if (!ks.length) return null;
  for (const doc of attachments) {
    const lines = doc.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*#/.test(line) || !/[a-z]/i.test(line)) continue;
      if (scanInjection(line, '', '', true).length) continue;
      if (ks.some((k) => hasWord(line, k))) return { docId: doc.id, docName: doc.name, line: line.trim().replace(/^(?:\d+[.)]|[-*•])\s*/, ''), lineNo: i + 1 };
    }
  }
  return null;
}

/* ---------------------------------------------------------------- planner */

function newAction(id: string, type: ActionType, clause): Action {
  return {
    id,
    type,
    status: 'pending_approval',
    version: 1,
    rounds: 0,
    fields: {},
    source: { quote: clause.text, start: clause.start, end: clause.start + clause.text.length, documentId: null },
    findings: [],
    questions: [],
    history: [],
    approvedFingerprint: null,
    approvedAt: null,
    approvedBy: null,
    result: null,
    acks: {},
    confirmedContactIds: [],
    roundsByKind: {},
    plannedBy: 'rules',
  } as Action;
}

function planClause(clause, session: Session, index: number, forcedType: ActionType | null = null): Action | null {
  const type = forcedType || detectIntent(clause.text);
  if (!type) return null;
  const { dataset, settings } = session;
  const tail = type === 'email' ? contentTail(clause.text) : null;
  const head = tail ? clause.text.slice(0, tail.index) : clause.text;
  const people = resolvePeople(head, dataset);
  const refs = people.resolved.map((c) => contactRef(c, settings));
  const mentions = extractMentions(head);
  const date = parseDate(clause.text, session.systemDate);
  const time = parseTimeOfDay(clause.text);
  const tz = detectTimezone(clause.text);
  const a = newAction(`A${index}`, type, clause);
  a.ambiguousRecipients = people.ambiguous.length ? people.ambiguous.map((x) => ({ alias: x.alias, contacts: x.contacts.map((c) => contactRef(c, settings)) })) : null;
  a.unknownMentions = people.unknown.length ? people.unknown : null;
  const en = /\b(please|send|the|with|and|book|schedule|meeting|remind)\b/i.test(clause.text) && !/\b(tolong|kirim|dengan|dan|jadwal)\b/i.test(clause.text);

  if (type === 'email') {
    const wantsDoc = /\b(notulen|minutes|catatan rapat|lampiran|terlampir|dokumen|file|berkas|attachment|ringkas\w*|rangkum\w*|summary)\b/i.test(head);
    const doc = wantsDoc && !tail ? session.attachments[0] || null : null;
    const topic = tail ? null : topicOf(head, mentions);
    const ctx = doc ? null : contextLine(session.attachments, [...people.resolved.flatMap((c) => [c.name, ...(c.aliases || [])]), ...people.unknown]);
    const greet = refs.length === 1 ? refs[0].name.split(' ')[0] : (en ? 'all' : 'Bapak/Ibu');
    let subject: string;
    let body: string | null;
    let draftFrom: string | null = null;
    if (tail) {
      const said = capitalize(tail.content.replace(/[.!\s]+$/, ''));
      subject = said.length > 64 ? `${said.slice(0, 63).replace(/\s+\S*$/, '')}…` : said;
      body = [
        en ? `Hi ${greet},` : `Halo ${greet},`, '',
        en ? `Just letting you know that ${tail.content.replace(/[.!\s]+$/, '')}.` : `Kami ingin mengabarkan bahwa ${tail.content.replace(/[.!\s]+$/, '')}.`, '',
        en ? 'Regards,' : 'Salam,', settings.operatorName || '',
      ].join('\n').trim();
      draftFrom = 'kalimat di permintaan';
    } else if (doc) {
      const sum = attachmentSummary(doc);
      subject = sum.title;
      body = [
        en ? `Hi ${greet},` : `Halo ${greet},`, '',
        en ? `Please find the summary of ${doc.name}:` : `Berikut ringkasan ${doc.name}:`,
        ...sum.bullets.map((b) => `- ${b}`), '',
        en ? 'The full file is attached. Thank you.' : 'Berkas lengkap terlampir. Terima kasih.',
      ].join('\n');
      draftFrom = `isi lampiran ${doc.name}`;
      a.source.documentId = doc.id;
    } else if (ctx) {
      const raw = capitalize(topic || cleanTopic(ctx.line));
      subject = raw.length > 64 ? `${raw.slice(0, 63).replace(/\s+\S*$/, '')}…` : raw;
      body = [
        en ? `Hi ${greet},` : `Halo ${greet},`, '',
        en ? `Following up on: "${ctx.line}".` : `Menindaklanjuti catatan: "${ctx.line}".`,
        en ? 'We will share an update as soon as it is confirmed.' : 'Kami akan mengabarkan perkembangannya segera setelah ada kepastian.', '',
        en ? 'Regards,' : 'Salam,', settings.operatorName || '',
      ].join('\n').trim();
      draftFrom = `${ctx.docName} baris ${ctx.lineNo}`;
    } else if (topic) {
      subject = capitalize(topic).slice(0, 80);
      body = null;
    } else {
      subject = '';
      body = null;
    }
    a.fields = { to: refs, cc: [], subject, body: body ?? '', language: en ? 'en' : 'id', draftFrom, sourceDocumentId: doc ? doc.id : (ctx ? ctx.docId : null) };
  }

  if (type === 'meeting') {
    const topic = topicOf(clause.text, mentions);
    const names = refs.map((r) => (r.members ? r.name : r.name.split(' ')[0])).concat(people.unknown.map(stripHonorific)).join(', ');
    const kind = /follow[\s-]?up/i.test(clause.text) ? 'Follow-up' : 'Rapat';
    a.fields = {
      title: topic && !/^(rapat|meeting|follow[\s-]?up)$/i.test(topic) ? `${kind}: ${topic}` : `${kind}${names ? ` dengan ${names}` : ''}`,
      participants: refs,
      date: date ? date.date : null,
      datePhrase: date ? date.phrase : null,
      dateConfidence: date ? date.confidence : null,
      dateWeekday: date && date.weekday != null ? date.weekday : null,
      start: time ? minutesToHHMM(time.minutes) : null,
      end: time ? minutesToHHMM(time.minutes + dataset.rules.meetingDefaultMinutes) : null,
      timePhrase: time ? time.phrase : null,
      timeAssumed: time ? time.assumed : false,
      timezone: tz,
      location: parseLocation(clause.text),
      conversions: [],
    };
  }

  if (type === 'task') {
    const owner = refs[0] || null;
    a.fields = {
      title: taskTitle(clause.text, mentions) || 'Tugas',
      owner,
      due: date ? date.date : null,
      duePhrase: date ? date.phrase : null,
      dueConfidence: date ? date.confidence : null,
      dateWeekday: date && date.weekday != null ? date.weekday : null,
      timezone: owner?.timezone || null,
    };
  }
  return a;
}

/* -------------------------------------------------------------- validator */

function finding(code: string, severity, message: string, extra: Partial<Finding> = {}): Finding {
  return { code, severity, message, ...extra };
}

function isHoliday(dateStr: string, dataset: Dataset) {
  return (dataset.holidays || []).find((h) => h.date === dateStr) || null;
}

/**
 * Check one slot against the rules in the meeting's zone AND in the local zone of every
 * participant (office hours and Friday prayer are local). Returns the first violation.
 */
export function slotViolation(dateStr: string, s: number, e: number, tz: Timezone, zones: Timezone[], dataset: Dataset) {
  const rules = dataset.rules;
  const open = hhmmToMinutes(rules.officeHours.start), close = hhmmToMinutes(rules.officeHours.end);
  const ps = hhmmToMinutes(rules.fridayPrayer.start), pe = hhmmToMinutes(rules.fridayPrayer.end);
  const wd = weekdayOf(dateStr);
  const hol = isHoliday(dateStr, dataset);
  if (hol) return { code: 'HOLIDAY_CONFLICT', zone: tz, holiday: hol };
  if (!rules.officeHours.weekdays.includes(wd)) return { code: 'NOT_A_WORKDAY', zone: tz };
  for (const z of [tz, ...zones.filter((x) => x !== tz)]) {
    const sz = convertTimezone(s, tz, z, dataset.timezones);
    const ez = sz + (e - s);
    if (sz < open || ez > close) return { code: 'OUTSIDE_OFFICE_HOURS', zone: z, start: sz, end: ez };
    if (wd === 5 && sz < pe && ez > ps) return { code: 'FRIDAY_PRAYER_CONFLICT', zone: z, start: sz, end: ez };
  }
  return null;
}

/** Nearest slot (15-minute grid) that satisfies the rules in every relevant zone. */
export function proposeSlot(dateStr, startMinutes, durationMinutes, timezone, dataset: Dataset, zones: Timezone[] = [], maxLookaheadDays = 10) {
  const original = slotViolation(dateStr, startMinutes, startMinutes + durationMinutes, timezone, zones, dataset);
  let d = dateStr;
  for (let day = 0; day < maxLookaheadDays; day++) {
    const grid = [];
    for (let c = 0; c + durationMinutes <= 1440; c += 15) grid.push(c);
    const ok = grid.filter((c) => !slotViolation(d, c, c + durationMinutes, timezone, zones, dataset));
    if (ok.length) {
      const want = startMinutes;
      ok.sort((x, y) => (Math.abs(x - want) - Math.abs(y - want)) || (y - x));
      const c = ok[0];
      const why = !original ? '' : original.code === 'FRIDAY_PRAYER_CONFLICT' ? `keluar dari jam salat Jumat${original.zone !== timezone ? ` (${original.zone})` : ''}`
        : original.code === 'OUTSIDE_OFFICE_HOURS' ? `ke dalam jam kerja ${original.zone !== timezone ? `peserta di ${original.zone}` : 'lokal'}`
        : original.code === 'HOLIDAY_CONFLICT' ? 'karena tanggal semula hari libur' : 'karena tanggal semula bukan hari kerja';
      return {
        date: d,
        start: minutesToHHMM(c),
        end: minutesToHHMM(c + durationMinutes),
        timezone,
        reason: `${day > 0 ? `Pindah ke ${shortDate(d)}` : 'Digeser'} ${why}.`.replace(/\s+\./, '.'),
      };
    }
    d = addDays(d, 1);
  }
  return null;
}

function membersOf(list: ContactRef[]) { return list.reduce((n, r) => n + (r.members || 1), 0); }

export function validateAction(action: Action, session: Session): Finding[] {
  const f: Finding[] = [];
  const { dataset, settings } = session;
  const rules = dataset.rules;
  const F = action.fields;

  for (const amb of action.ambiguousRecipients || []) {
    f.push(finding('AMBIGUOUS_RECIPIENT', 'blocking',
      `Ada ${amb.contacts.length} kontak yang cocok dengan "${amb.alias}": ${amb.contacts.map((c) => `${c.name} (${c.role || c.email})`).join(', ')}.`,
      { candidates: amb.contacts, mention: amb.alias, question: 'recipient' }));
  }
  for (const u of action.unknownMentions || []) {
    f.push(finding('UNKNOWN_CONTACT', 'blocking',
      dataset.contacts.length
        ? `"${u}" tidak ditemukan di data kontak. Berezz tidak menebak alamatnya.`
        : `"${u}" tidak bisa dicocokkan: data kontak organisasi masih kosong.`,
      { mention: u, candidates: fuzzyCandidates(u, dataset.contacts).map((c) => contactRef(c, settings)), question: 'recipient' }));
  }
  const unresolved = (action.ambiguousRecipients || []).length + (action.unknownMentions || []).length;

  const people: ContactRef[] = action.type === 'email' ? (F.to || []) : action.type === 'meeting' ? (F.participants || []) : (F.owner ? [F.owner] : []);
  const external = people.filter((p) => p.kind === 'external');
  if (external.length) {
    f.push(finding('EXTERNAL_RECIPIENT', 'confirm',
      `Penerima di luar organisasi: ${external.map((e) => `${e.name} <${e.email}>`).join(', ')}${settings.orgDomains.length ? '' : ' (domain organisasi belum diatur, jadi semua kontak dianggap eksternal)'}.`,
      { ackLabel: 'Penerima di luar organisasi sudah saya periksa' }));
  }
  if (action.type !== 'task' && (people.length > 2 || membersOf(people) > 3)) {
    f.push(finding('MULTIPLE_RECIPIENTS', 'confirm', `Aksi ini menjangkau ${membersOf(people)} orang (${people.map((p) => p.members ? `${p.name} · ${p.members} anggota` : p.name).join(', ')}).`,
      { ackLabel: 'Seluruh daftar penerima sudah saya periksa' }));
  }

  if (action.type === 'email') {
    if (!people.length && !unresolved) f.push(finding('MISSING_RECIPIENT', 'blocking', 'Penerima tidak disebutkan di permintaan.', { question: 'recipient' }));
    if (!String(F.body || '').trim()) {
      f.push(finding('MISSING_CONTENT', 'blocking', 'Isi pesan tidak disebutkan di permintaan dan tidak ada lampiran yang bisa dijadikan dasar. Berezz tidak mengarang isinya.', { question: 'content' }));
    } else if (F.draftFrom && !F.contentConfirmed) {
      f.push(finding('DRAFTED_CONTENT', 'info', `Isi email adalah draf yang disusun dari ${F.draftFrom}, bukan kutipan permintaan. Periksa sebelum menyetujui.`));
    }
    if (!String(F.subject || '').trim()) f.push(finding('MISSING_SUBJECT', 'blocking', 'Subjek email kosong.', { question: 'subject' }));
  }

  if (action.type === 'meeting') {
    if (!people.length && !unresolved) f.push(finding('MISSING_PARTICIPANTS', 'blocking', 'Peserta rapat tidak disebutkan.', { question: 'recipient' }));
    if (!F.date) {
      f.push(finding('MISSING_DATE', 'blocking', F.datePhrase ? `Tanggal "${F.datePhrase}" ambigu.` : 'Tanggal rapat belum disebutkan.', { question: 'date' }));
    } else if (F.dateConfidence === 'derived') {
      f.push(finding('DERIVED_DATE', 'info', `"${F.datePhrase}" diartikan ${humanDate(F.date)} dari tanggal acuan ${humanDate(session.systemDate)}.`));
    }
    if (!F.start) f.push(finding('MISSING_TIME', 'blocking', 'Jam rapat belum disebutkan.', { question: 'time' }));
    else if (F.timeAssumed && !F.timeConfirmed) f.push(finding('ASSUMED_TIME', 'info', `"${F.timePhrase}" diartikan pukul ${F.start}. Koreksi bila keliru.`));

    const tzs = [...new Set(people.map((p) => p.timezone).filter(Boolean))] as Timezone[];
    if (!F.timezone && F.start) {
      if (people.some((p) => !p.timezone)) {
        f.push(finding('MISSING_TIMEZONE', 'blocking', `Zona waktu ${people.filter((p) => !p.timezone).map((p) => p.name).join(', ')} tidak tercatat di data kontak.`, { question: 'timezone', options: ['WIB', 'WITA', 'WIT'] }));
      } else if (tzs.length > 1 || (tzs.length === 1 && tzs[0] !== settings.defaultTimezone)) {
        f.push(finding('AMBIGUOUS_TIMEZONE', 'blocking',
          `Jam ditulis tanpa zona waktu; pengirim di ${settings.defaultTimezone}, peserta di ${tzs.join('/')}.`,
          { question: 'timezone', options: [...new Set([settings.defaultTimezone, ...tzs])] }));
      }
    }
    const tz = F.timezone || (people.length && tzs.length === 1 && tzs[0] === settings.defaultTimezone ? settings.defaultTimezone : null);

    if (F.date && F.start && tz) {
      const sMin = hhmmToMinutes(F.start);
      const eMin = hhmmToMinutes(F.end) ?? sMin + rules.meetingDefaultMinutes;
      const zones = [...new Set(people.map((p) => p.timezone).filter(Boolean))] as Timezone[];
      const v = slotViolation(F.date, sMin, eMin, tz, zones, dataset);
      if (v) {
        const proposal = proposeSlot(F.date, sMin, eMin - sMin, tz, dataset, zones);
        const local = v.zone !== tz ? ` = ${minutesToHHMM(v.start).replace(':', '.')}–${minutesToHHMM(v.end).replace(':', '.')} ${v.zone} bagi ${people.filter((p) => p.timezone === v.zone).map((p) => p.name).join(', ')}` : '';
        const msg = v.code === 'HOLIDAY_CONFLICT' ? `${humanDate(F.date)} adalah hari libur (${v.holiday.name}; sumber: ${v.holiday.source}).`
          : v.code === 'NOT_A_WORKDAY' ? `${humanDate(F.date)} bukan hari kerja (sumber: ${rules.officeHours.source}).`
          : v.code === 'OUTSIDE_OFFICE_HOURS' ? `${t2(F.start)}–${t2(F.end)} ${tz}${local} di luar jam kerja ${t2(rules.officeHours.start)}–${t2(rules.officeHours.end)} waktu lokal (sumber: ${rules.officeHours.source}).`
          : `${t2(F.start)}–${t2(F.end)} ${tz}${local} bertabrakan dengan salat Jumat ${t2(rules.fridayPrayer.start)}–${t2(rules.fridayPrayer.end)} waktu lokal (sumber: ${rules.fridayPrayer.source}).`;
        f.push(finding(v.code === 'NOT_A_WORKDAY' ? 'OUTSIDE_OFFICE_HOURS' : v.code, 'blocking', msg, { question: 'slot', proposal, localNote: local ? local.replace(/^ = /, '') : null }));
      }
      if (dataset.holidays === null) {
        f.push(finding('HOLIDAY_DATA_MISSING', 'confirm', `Kalender libur organisasi belum tersedia, jadi status libur ${shortDate(F.date)} tidak diketahui.`, { ackLabel: `${shortDate(F.date)} sudah saya pastikan bukan hari libur` }));
      }
    }
  }

  if (action.type === 'task') {
    if (!F.owner && !unresolved) f.push(finding('MISSING_OWNER', 'blocking', 'Pemilik tugas tidak disebutkan.', { question: 'recipient' }));
    if (!F.due) {
      f.push(finding('MISSING_DEADLINE', 'blocking', F.duePhrase ? `Tenggat "${F.duePhrase}" ambigu.` : 'Tenggat tidak disebutkan.', { question: 'date' }));
    } else {
      if (F.dueConfidence === 'derived') f.push(finding('DERIVED_DATE', 'info', `"${F.duePhrase}" diartikan ${humanDate(F.due)} dari tanggal acuan ${humanDate(session.systemDate)}.`));
      const hol = isHoliday(F.due, dataset);
      if (hol) f.push(finding('HOLIDAY_CONFLICT', 'confirm', `Tenggat ${shortDate(F.due)} jatuh pada hari libur (${hol.name}; sumber: ${hol.source}).`, { ackLabel: 'Tenggat di hari libur memang disengaja' }));
      else if (dataset.holidays === null) f.push(finding('HOLIDAY_DATA_MISSING', 'confirm', `Kalender libur organisasi belum tersedia, jadi status libur ${shortDate(F.due)} tidak diketahui.`, { ackLabel: `${shortDate(F.due)} sudah saya pastikan bukan hari libur` }));
    }
  }
  return f;
}

/* ------------------------------------------------------- source conflicts */

function detectSourceConflicts(action: Action, session: Session): Finding[] {
  const out: Finding[] = [];
  if (action.type === 'email') return out;
  const date = action.type === 'meeting' ? action.fields.date : action.fields.due;
  if (!date || action.fields.resolvedFrom) return out;
  const names = (action.type === 'meeting' ? action.fields.participants || [] : [action.fields.owner].filter(Boolean)).map((p) => p.name.split(' ')[0]);
  if (!names.length) return out;
  for (const doc of session.attachments) {
    for (const line of doc.text.split('\n')) {
      if (!names.some((n) => hasWord(line, n))) continue;
      if (scanInjection(line, '', '', true).length) continue;
      if (detectIntent(line) !== action.type && !(action.type === 'task' && /revisi|proposal|tenggat|deadline/i.test(line))) continue;
      const d = parseDate(line, session.systemDate);
      if (!d || !d.date || d.date === date) continue;
      out.push(finding('SOURCE_CONFLICT', 'blocking',
        `Permintaan menyebut ${shortDate(date)}, sedangkan ${doc.name} menyebut ${shortDate(d.date)}.`,
        { question: 'source', conflict: { chat: date, doc: d.date, docId: doc.id, docName: doc.name, quote: line.trim() } }));
    }
  }
  return out;
}

/* ------------------------------------------------------------- questions */

const QUESTION_ORDER = ['recipient', 'content', 'subject', 'source', 'date', 'timezone', 'time', 'slot'];
const UNKNOWN_ANSWER = '__belum_pasti__';

const t2 = (s: string) => String(s).replace(':', '.');

function contactOptions(list: ContactRef[]) {
  return list.map((c) => ({ value: c.id, label: c.name, detail: [c.role, c.city].filter(Boolean).join(' · ') || c.email, tag: c.timezone || 'zona ?' }));
}

function buildQuestions(action: Action, session: Session): ClarificationQuestion[] {
  const { dataset, settings } = session;
  const blocking = action.findings.filter((f) => f.severity === 'blocking' && f.question)
    .sort((a, b) => QUESTION_ORDER.indexOf(a.question) - QUESTION_ORDER.indexOf(b.question));
  const f = blocking[0];
  if (!f) return [];
  const q: ClarificationQuestion = { id: `${action.id}-q-${f.question}-${action.version}`, kind: f.question, finding: f.code, text: '', options: [] };

  if (f.question === 'recipient') {
    if (f.code === 'AMBIGUOUS_RECIPIENT') {
      q.text = `${f.mention} yang mana?`;
      q.hint = `${f.candidates.length} kontak cocok`;
      q.options = contactOptions(f.candidates);
      q.mention = f.mention;
    } else if (f.code === 'UNKNOWN_CONTACT') {
      q.text = `Siapa "${f.mention}"?`;
      q.hint = 'Tidak ada di data kontak';
      q.options = contactOptions(f.candidates || []);
      q.mention = f.mention;
      q.allowNewContact = true;
    } else {
      q.text = action.type === 'task' ? 'Siapa pemilik tugas ini?' : action.type === 'meeting' ? 'Siapa pesertanya?' : 'Kepada siapa?';
      q.hint = dataset.contacts.length ? 'Tidak disebutkan di permintaan' : 'Data kontak masih kosong';
      q.options = contactOptions(dataset.contacts.slice(0, 6).map((c) => contactRef(c, settings)));
      q.allowNewContact = true;
    }
  } else if (f.question === 'content') {
    q.text = 'Apa isi pesannya?';
    q.hint = 'Tidak disebutkan di permintaan';
    q.input = 'text';
  } else if (f.question === 'subject') {
    q.text = 'Apa subjek email ini?';
    q.input = 'line';
  } else if (f.question === 'timezone') {
    const start = action.fields.start;
    const list = (f.options || ['WIB', 'WITA', 'WIT']) as Timezone[];
    q.text = action.fields.timePhrase ? `"${action.fields.timePhrase}" jam lokal mana?` : `Jam ${start} itu jam lokal mana?`;
    q.options = list.map((tz) => {
      const others = (['WIB', 'WITA', 'WIT'] as Timezone[]).filter((o) => o !== tz && list.includes(o));
      const conv = others.map((o) => `${minutesToHHMM(convertTimezone(hhmmToMinutes(start), tz, o, dataset.timezones))} ${o}`).join(' · ');
      return { value: tz, label: `${start.replace(':', '.')} ${tz}`, detail: tz === settings.defaultTimezone ? 'zona pengirim' : 'zona peserta', tag: conv ? `= ${conv.replace(/:/g, '.')}` : '' };
    });
  } else if (f.question === 'date') {
    const base = session.systemDate;
    const wd = action.fields.dateWeekday;
    let opts: string[] = [];
    if (typeof wd === 'number') {
      let delta = (wd - weekdayOf(base) + 7) % 7;
      if (delta === 0) delta = 7;
      opts = [addDays(base, delta), addDays(base, delta + 7)];
    }
    q.text = action.type === 'task' ? 'Kapan tenggatnya?' : 'Tanggal berapa?';
    q.hint = (action.fields.datePhrase || action.fields.duePhrase) ? `"${action.fields.datePhrase || action.fields.duePhrase}" · acuan ${shortDate(base)}` : `acuan ${shortDate(base)}`;
    q.options = opts.map((d) => ({ value: d, label: shortDate(d), detail: d }));
    q.input = 'date';
  } else if (f.question === 'time') {
    q.text = 'Jam berapa?';
    q.input = 'time';
  } else if (f.question === 'slot') {
    const rules = dataset.rules;
    q.text = 'Slot ini melanggar aturan. Pakai usulan?';
    const local = f.localNote ? ` · ${f.localNote}` : '';
    q.hint = f.code === 'FRIDAY_PRAYER_CONFLICT' ? `Bentrok salat Jumat ${t2(rules.fridayPrayer.start)}–${t2(rules.fridayPrayer.end)}${local}`
      : f.code === 'HOLIDAY_CONFLICT' ? 'Tanggal ini hari libur'
      : /bukan hari kerja/.test(f.message) ? 'Bukan hari kerja'
      : `Di luar jam kerja ${t2(rules.officeHours.start)}–${t2(rules.officeHours.end)}${local}`;
    if (f.proposal) {
      q.options = [{ value: `${f.proposal.date}|${f.proposal.start}`, label: `${shortDate(f.proposal.date)}, ${f.proposal.start.replace(':', '.')}–${f.proposal.end.replace(':', '.')} ${f.proposal.timezone}`, detail: f.proposal.reason }];
    }
  } else if (f.question === 'source') {
    q.text = `Permintaan dan ${f.conflict.docName} berbeda. Pakai yang mana?`;
    q.options = [
      { value: `chat|${f.conflict.chat}`, label: `Permintaan · ${shortDate(f.conflict.chat)}`, detail: action.source.quote.slice(0, 90) },
      { value: `doc|${f.conflict.doc}`, label: `${f.conflict.docName} · ${shortDate(f.conflict.doc)}`, detail: f.conflict.quote },
    ];
  }
  q.options.push({ value: UNKNOWN_ANSWER, label: 'Belum bisa dipastikan', detail: 'Dihitung satu putaran; setelah batas, aksi dieskalasi' });
  return [q];
}

function refresh(action: Action, session: Session) {
  action.findings = validateAction(action, session).concat(detectSourceConflicts(action, session));
  if (action.plannedBy === 'model') action.findings.push(finding('MODEL_DRAFT', 'info', `Judul/isi disusun oleh ${session.planner.name}. Penerima, tanggal, dan jam tetap diturunkan Berezz dari kutipan sumber.`));
  for (const extra of action.extraFindings || []) action.findings.push(extra);
  action.questions = buildQuestions(action, session);
  if (!['queued', 'simulated', 'undone', 'cancelled', 'escalated'].includes(action.status)) {
    const blocked = action.findings.some((f) => f.severity === 'blocking');
    action.status = blocked ? 'needs_clarification' : 'pending_approval';
    if (blocked && !action.questions.length) action.status = 'escalated';
  }
  action.fingerprint = fpOf(action);
}

/* --------------------------------------------------------------- reviewer */

/**
 * Second, independent pass. It does not trust the planner: it re-reads the original
 * request and checks the plan against it.
 */
export function reviewPlan(session: Session): ReviewReport {
  const text = session.rawInput;
  const findings: ReviewFinding[] = [];
  const injectionLines = session.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED' && f.sourceId === 'input');
  const live = session.actions.filter((a) => !['cancelled'].includes(a.status));

  const clauses = splitClauses(text).filter((c) => detectIntent(c.text) && !injectionLines.some((f) => c.start >= f.offset && c.start < f.offset + f.quote.length + 1));
  let missing = 0;
  for (const c of clauses) {
    const covered = live.some((a) => a.source.start < c.start + c.text.length && a.source.end > c.start);
    if (!covered) {
      missing++;
      findings.push({ code: 'MISSING_ACTION', severity: 'confirm', quote: c.text, message: `Permintaan "${c.text}" tidak punya aksi di rencana.` });
    }
  }
  let added = 0;
  for (const a of live) {
    if (!a.source.quote || !text.includes(a.source.quote)) {
      added++;
      findings.push({ code: 'ADDED_ACTION', severity: 'blocking', actionId: a.id, message: `${a.id} tidak punya kutipan di permintaan asli.` });
      continue;
    }
    if (injectionLines.some((f) => a.source.start >= f.offset && a.source.start <= f.offset + f.quote.length)) {
      findings.push({ code: 'ACTION_FROM_EMBEDDED_TEXT', severity: 'blocking', actionId: a.id, message: `${a.id} berasal dari baris instruksi tersisip.` });
    }
    const people: ContactRef[] = a.type === 'email' ? a.fields.to || [] : a.type === 'meeting' ? a.fields.participants || [] : [a.fields.owner].filter(Boolean);
    for (const p of people) {
      if ((a.confirmedContactIds || []).includes(p.id)) continue;
      const c = session.dataset.contacts.find((x) => x.id === p.id);
      const team = /^(tim|team)\s+(.+)$/i.exec(p.name);
      const names = [p.name, ...(team ? [`${team[2]} team`] : [p.name.split(' ')[0]]), ...(c?.aliases || [])];
      if (!names.some((n) => hasWord(a.source.quote, n))) {
        findings.push({ code: 'RECIPIENT_NOT_IN_SOURCE', severity: 'blocking', actionId: a.id, message: `${p.name} tidak disebut di kutipan ${a.id} dan belum dipilih manusia.` });
      }
    }
    const intent = detectIntent(a.source.quote);
    if (intent && intent !== a.type) findings.push({ code: 'TYPE_MISMATCH', severity: 'info', actionId: a.id, message: `${a.id} berjenis ${a.type}, tetapi kutipannya terbaca sebagai ${intent}.` });
  }
  const flagged = new Set(findings.filter((f) => f.actionId && f.severity === 'blocking').map((f) => f.actionId));
  const report: ReviewReport = {
    at: session.clock(),
    reviewer: 'Reviewer Berezz (aturan, independen dari planner)',
    checked: live.length,
    matched: live.length - flagged.size,
    missing,
    added,
    findings,
  };
  session.review = report;
  // Reviewer findings that block an action are attached to it, so the gate sees them.
  for (const a of session.actions) {
    a.extraFindings = findings.filter((f) => f.actionId === a.id && f.severity === 'blocking').map((f) => finding(f.code, 'blocking', `Reviewer: ${f.message}`));
  }
  return report;
}

/* --------------------------------------------------------------- pipeline */

export function intake(
  session: Session,
  { text, attachments = [], plan = null, planner = null, actor = 'sistem' }: {
    text: string;
    attachments?: Attachment[];
    plan?: ProposedAction[] | null;
    planner?: { name: string } | null;
    actor?: string;
  },
): { ok: boolean; error?: { code: string; message: string }; actions: Action[] } {
  const started = Date.now();
  session.rawInput = text || '';
  session.attachments = attachments.map((d, i) => ({ id: d.id || `doc-${i + 1}`, name: d.name || `lampiran-${i + 1}.txt`, text: String(d.text || '') }));
  session.actions = [];
  session.findingsGlobal = [];
  session.planVersion += 1;
  session.planner = plan ? { mode: 'model', name: planner?.name || 'Planner model' } : { mode: 'rules', name: 'Planner aturan Berezz' };
  const clean = (text || '').trim();

  log(session, 'intake', { chars: clean.length, requestText: clean, attachments: session.attachments.map((a) => a.name), planner: session.planner.name, referenceDate: session.systemDate }, actor);

  if (!clean) {
    log(session, 'error', { code: 'EMPTY_INPUT' });
    return { ok: false, error: { code: 'EMPTY_INPUT', message: 'Permintaan masih kosong. Tempel chat, notulen, atau transkrip terlebih dahulu.' }, actions: [] };
  }
  if (clean.replace(/[^\p{L}\p{N}]/gu, '').length < 4 || !/\p{L}{2,}/u.test(clean)) {
    log(session, 'error', { code: 'UNREADABLE_INPUT' });
    return { ok: false, error: { code: 'UNREADABLE_INPUT', message: 'Teks ini tidak terbaca sebagai permintaan kerja. Tidak ada aksi yang dibuat.' }, actions: [] };
  }

  session.findingsGlobal.push(...scanInjection(clean, 'permintaan', 'input', false));
  for (const doc of session.attachments) session.findingsGlobal.push(...scanInjection(doc.text, `lampiran ${doc.name}`, doc.id, true));
  const inj = session.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED');
  if (inj.length) log(session, 'injection_detected', inj.map((f) => ({ source: f.source, line: f.line, quote: f.quote })), 'validator');
  const injectedInput = inj.filter((f) => f.sourceId === 'input');
  const fromInjection = (start: number) => injectedInput.some((f) => start >= f.offset && start <= f.offset + f.quote.length);

  let actions: Action[] = [];
  if (plan) {
    plan.forEach((p, i) => {
      const quote = String(p.source_quote || '').trim();
      let start = quote ? clean.indexOf(quote) : -1;
      if (start < 0 && quote) start = clean.toLowerCase().indexOf(quote.toLowerCase());
      const type = (['email', 'meeting', 'task'] as ActionType[]).includes(p.type) ? p.type : null;
      if (start < 0 || !type) {
        const a = newAction(`A${i + 1}`, type || 'task', { text: quote, start: -1 });
        a.source = { quote: '', start: -1, end: -1, documentId: null };
        a.plannedBy = 'model';
        a.status = 'escalated';
        a.extraFindings = [finding('UNSOURCED_ACTION', 'blocking', `Rencana model memuat aksi tanpa kutipan sumber yang cocok${quote ? ` ("${quote.slice(0, 60)}" tidak ada di permintaan)` : ''}. Aksi ditolak sampai ada bukti.`)];
        actions.push(a);
        return;
      }
      const clauseText = clean.slice(start, start + quote.length);
      if (fromInjection(start)) return;
      const a = planClause({ text: clauseText, start }, session, i + 1, type);
      a.plannedBy = 'model';
      const limit = (s, n) => String(s || '').trim().slice(0, n);
      const own: Finding[] = [];
      // A date or time written by the model must also be in the quote; otherwise it is dropped.
      const unsourced = (txt: string) => {
        const d = parseDate(txt, session.systemDate);
        const tm = parseTimeOfDay(txt);
        const bad = [d?.phrase, tm && !tm.assumed ? tm.phrase : null].filter((x) => x && !lower(clauseText).includes(lower(x)));
        return bad.length ? bad : null;
      };
      const accept = (field: string, value: string) => {
        if (!value) return;
        const bad = unsourced(value);
        if (bad) {
          own.push(finding('MODEL_UNSOURCED_DETAIL', 'info', `Model menulis "${bad.join('", "')}" di ${field}, tetapi itu tidak ada di kutipan sumber; teks model untuk ${field} tidak dipakai.`));
          return;
        }
        a.fields[field] = value;
        if (field === 'body') a.fields.draftFrom = session.planner.name;
      };
      if (type !== 'email') accept('title', limit(p.title, 120));
      else { accept('subject', limit(p.subject, 120)); accept('body', limit(p.body, 4000)); }
      const ignored = (p.recipients || []).filter((n) => !hasWord(clauseText, String(n)) && !hasWord(clauseText, String(n).split(' ')[0]));
      if (ignored.length) own.push(finding('MODEL_RECIPIENT_IGNORED', 'info', `Model menyebut ${ignored.join(', ')}, tetapi nama itu tidak ada di kutipan; diabaikan.`));
      a.extraFindings = own;
      actions.push(a);
    });
  } else {
    const clauses = splitClauses(clean).filter((c) => !fromInjection(c.start));
    actions = clauses.map((c, i) => planClause(c, session, i + 1)).filter(Boolean);
  }
  if (!actions.length) {
    log(session, 'error', { code: 'NO_ACTION' });
    return { ok: false, error: { code: 'NO_ACTION', message: 'Tidak ada permintaan email, rapat, atau tugas yang dikenali. Sebutkan aksinya, misalnya "kirim … ke …" atau "jadwalkan rapat dengan …".' }, actions: [] };
  }
  actions.forEach((a, i) => { a.id = `A${i + 1}`; a.extraFindings = a.extraFindings || []; });
  const own = actions.map((a) => a.extraFindings);
  session.actions = actions;
  reviewPlan(session);
  actions.forEach((a, i) => { a.extraFindings = [...own[i], ...(a.extraFindings || [])]; refresh(a, session); });

  session.metrics.actionsPlanned = actions.length;
  session.metrics.blocked = actions.filter((a) => a.status === 'needs_clarification').length;
  session.metrics.questionsAsked = actions.reduce((n, a) => n + a.questions.length, 0);
  session.metrics.pipelineMs = Date.now() - started;

  log(session, 'plan', {
    planVersion: session.planVersion,
    planner: session.planner.name,
    actions: actions.map((a) => ({ id: a.id, type: a.type, status: a.status, findings: a.findings.map((x) => x.code) })),
    pipelineMs: session.metrics.pipelineMs,
  }, session.planner.mode === 'model' ? session.planner.name : 'planner');
  log(session, 'review', { reviewer: session.review.reviewer, checked: session.review.checked, matched: session.review.matched, missing: session.review.missing, added: session.review.added }, 'reviewer');
  return { ok: true, actions };
}

function rereview(session: Session) {
  const own = new Map(session.actions.map((a) => [a.id, (a.extraFindings || []).filter((f) => !String(f.message).startsWith('Reviewer:'))]));
  reviewPlan(session);
  for (const a of session.actions) {
    a.extraFindings = [...own.get(a.id), ...(a.extraFindings || [])];
    if (['needs_clarification', 'pending_approval', 'approved'].includes(a.status)) {
      const wasApproved = a.status === 'approved';
      refresh(a, session);
      if (wasApproved && a.approvedFingerprint === a.fingerprint && a.status === 'pending_approval') a.status = 'approved';
    }
  }
}

/* ------------------------------------------------------- clarification */

function findAction(session: Session, id: string) {
  const a = session.actions.find((x) => x.id === id);
  if (!a) throw new Error('Aksi tidak ditemukan');
  return a;
}

const OPEN = ['needs_clarification', 'pending_approval', 'approved'];

function invalidateApproval(a: Action) {
  a.approvedFingerprint = null;
  a.approvedAt = null;
  a.approvedBy = null;
}

export function answerClarification(session: Session, actionId: string, questionId: string, value: string, actor = 'pengguna') {
  const action = findAction(session, actionId);
  if (!OPEN.includes(action.status)) throw new Error('Aksi ini sudah tidak bisa diubah.');
  const question = action.questions.find((q) => q.id === questionId);
  if (!question) throw new Error('Pertanyaan sudah tidak berlaku; muat ulang job.');

  action.rounds += 1;
  const byKind = (action.roundsByKind = action.roundsByKind || {});
  const max = session.dataset.rules.maxClarificationRounds;

  if (value === UNKNOWN_ANSWER) {
    byKind[question.kind] = (byKind[question.kind] || 0) + 1;
    action.history.push({ at: session.clock(), kind: 'clarification', question: question.text, answer: 'belum bisa dipastikan', round: byKind[question.kind] });
    log(session, 'clarification_answered', { actionId, questionId, value: 'belum bisa dipastikan', round: byKind[question.kind] }, actor);
    if (byKind[question.kind] >= max) {
      action.status = 'escalated';
      invalidateApproval(action);
      log(session, 'escalate', { actionId, reason: `Belum jelas setelah ${max} putaran klarifikasi; perlu keputusan manusia` });
      return { ok: false, escalated: true, action };
    }
    action.questions = buildQuestions(action, session);
    return { ok: true, action };
  }

  const before = JSON.parse(JSON.stringify(action.fields));
  applyAnswer(action, question, value, session);
  action.version += 1;
  invalidateApproval(action);
  if (action.status === 'approved') action.status = 'pending_approval';
  action.history.push({ at: session.clock(), kind: 'clarification', question: question.text, answer: value, version: action.version, before, after: JSON.parse(JSON.stringify(action.fields)) });
  rereview(session);
  log(session, 'clarification_answered', { actionId, questionId, value, version: action.version, status: action.status }, actor);
  if (action.status === 'escalated') log(session, 'escalate', { actionId, reason: 'Masih ada temuan yang tidak bisa ditanyakan otomatis' });
  return { ok: true, action };
}

function applyAnswer(action: Action, question: ClarificationQuestion, value: string, session: Session) {
  const F = action.fields;
  if (question.kind === 'recipient') {
    const c = session.dataset.contacts.find((x) => x.id === value);
    if (!c) throw new Error('Kontak tidak ditemukan di data.');
    const ref = contactRef(c, session.settings);
    action.confirmedContactIds = [...new Set([...(action.confirmedContactIds || []), c.id])];
    if (question.mention) {
      action.ambiguousRecipients = (action.ambiguousRecipients || []).filter((x) => x.alias !== question.mention);
      action.unknownMentions = (action.unknownMentions || []).filter((x) => x !== question.mention);
    }
    if (action.type === 'task') { F.owner = ref; F.timezone = ref.timezone || null; } else {
      const key = action.type === 'email' ? 'to' : 'participants';
      const list = (F[key] as ContactRef[]) || [];
      if (!list.some((r) => r.id === ref.id)) F[key] = [...list, ref];
      if (action.type === 'email' && typeof F.body === 'string') F.body = F.body.replace(/^(Halo|Hi) (Bapak\/Ibu|all),/, (_, h) => `${h} ${ref.name.split(' ')[0]},`);
    }
  }
  if (question.kind === 'content') { F.body = String(value); F.contentConfirmed = true; F.draftFrom = null; }
  if (question.kind === 'subject') F.subject = String(value);
  if (question.kind === 'timezone') {
    F.timezone = value as Timezone;
    const start = hhmmToMinutes(F.start);
    F.conversions = (['WIB', 'WITA', 'WIT'] as Timezone[]).filter((tz) => tz !== value && (tz === session.settings.defaultTimezone || (F.participants || []).some((p) => p.timezone === tz)))
      .map((tz) => ({ from: { tz: value, time: F.start }, to: { tz, time: minutesToHHMM(convertTimezone(start, value, tz, session.dataset.timezones)) } }));
    F.timeConfirmed = true;
  }
  if (question.kind === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Tanggal harus berformat YYYY-MM-DD.');
    if (action.type === 'meeting') { F.date = value; F.dateConfidence = 'confirmed'; } else { F.due = value; F.dueConfidence = 'confirmed'; }
  }
  if (question.kind === 'time') {
    const m = hhmmToMinutes(value);
    if (m == null) throw new Error('Jam harus berformat HH:MM.');
    F.start = minutesToHHMM(m);
    F.end = minutesToHHMM(m + session.dataset.rules.meetingDefaultMinutes);
    F.timeAssumed = false;
  }
  if (question.kind === 'slot') {
    const [date, start] = String(value).split('|');
    const dur = (hhmmToMinutes(F.end) ?? 0) - (hhmmToMinutes(F.start) ?? 0) || session.dataset.rules.meetingDefaultMinutes;
    F.date = date;
    F.start = start;
    F.end = minutesToHHMM(hhmmToMinutes(start) + dur);
    F.dateConfidence = 'confirmed';
    F.autoAdjusted = true;
    if (!F.timezone) F.timezone = session.settings.defaultTimezone;
    const conv = (F.conversions as Array<{ to: { tz: Timezone } }>) || [];
    if (conv.length) {
      F.conversions = conv.map((c) => ({ from: { tz: F.timezone, time: start }, to: { tz: c.to.tz, time: minutesToHHMM(convertTimezone(hhmmToMinutes(start), F.timezone, c.to.tz, session.dataset.timezones)) } }));
    }
  }
  if (question.kind === 'source') {
    const [src, date] = String(value).split('|');
    if (action.type === 'meeting') F.date = date; else F.due = date;
    F.resolvedFrom = src;
  }
}

/* ------------------------------------------------------ edit + approval */

export function editAction(session: Session, actionId: string, patch: Partial<ActionFields> & { toIds?: string[]; participantIds?: string[]; ownerId?: string }, actor = 'pengguna'): Action {
  const action = findAction(session, actionId);
  // An undone action can be corrected and submitted again as a new version.
  if (action.status === 'undone') {
    action.history.push({ at: session.clock(), kind: 'reopen', undoneResult: action.result });
    action.result = null;
    action.status = 'pending_approval';
  }
  if (!OPEN.includes(action.status)) throw new Error('Aksi ini sudah tidak bisa disunting.');
  const before = JSON.parse(JSON.stringify(action.fields));
  const byId = (id) => {
    const c = session.dataset.contacts.find((x) => x.id === id);
    if (!c) throw new Error(`Kontak ${id} tidak ada di data.`);
    action.confirmedContactIds = [...new Set([...(action.confirmedContactIds || []), c.id])];
    return contactRef(c, session.settings);
  };
  const { toIds, participantIds, ownerId, ...rest } = patch;
  if (toIds) { action.fields.to = toIds.map(byId); action.unknownMentions = null; action.ambiguousRecipients = null; }
  if (participantIds) { action.fields.participants = participantIds.map(byId); action.unknownMentions = null; action.ambiguousRecipients = null; }
  if (ownerId !== undefined) { action.fields.owner = ownerId ? byId(ownerId) : null; action.unknownMentions = null; action.ambiguousRecipients = null; }
  for (const [k, v] of Object.entries(rest)) {
    if (['subject', 'body', 'title', 'location'].includes(k)) action.fields[k] = String(v ?? '');
    if (['date', 'due'].includes(k)) action.fields[k] = v ? String(v) : null;
    if (['start', 'end'].includes(k)) action.fields[k] = v ? minutesToHHMM(hhmmToMinutes(v)) : null;
    if (k === 'timezone') action.fields.timezone = (['WIB', 'WITA', 'WIT'].includes(String(v)) ? v : null) as Timezone;
  }
  if ('body' in rest) { action.fields.contentConfirmed = true; action.fields.draftFrom = null; }
  if ('date' in rest) action.fields.dateConfidence = 'confirmed';
  if ('due' in rest) action.fields.dueConfidence = 'confirmed';
  if ('start' in rest) { action.fields.timeAssumed = false; if (!('end' in rest) && action.fields.start) action.fields.end = minutesToHHMM(hhmmToMinutes(action.fields.start) + session.dataset.rules.meetingDefaultMinutes); }
  action.version += 1;
  invalidateApproval(action);
  action.acks = {};
  if (action.status === 'approved') action.status = 'pending_approval';
  action.history.push({ at: session.clock(), kind: 'edit', before, after: JSON.parse(JSON.stringify(action.fields)), version: action.version });
  rereview(session);
  log(session, 'edit', { actionId, version: action.version, fields: Object.keys(patch) }, actor);
  return action;
}

export function requiredAcks(action: Action) {
  return action.findings.filter((f) => f.severity === 'confirm').map((f) => ({ code: f.code, label: f.ackLabel || f.message }));
}

export function acknowledge(session: Session, actionId: string, code: string, actor = 'pengguna', value = true): Action {
  const action = findAction(session, actionId);
  if (!OPEN.includes(action.status)) throw new Error('Aksi ini sudah tidak bisa diubah.');
  action.acks = { ...(action.acks || {}), [code]: value };
  log(session, 'acknowledge', { actionId, code, value, version: action.version }, actor);
  return action;
}

/**
 * Human approval of ONE exact version. The caller must send the version the person saw;
 * any mismatch means the screen was stale and nothing is approved.
 */
export function approveAction(session: Session, actionId: string, opts: { version?: number; actor?: string } = {}): Action {
  const action = findAction(session, actionId);
  const actor = opts.actor || 'pengguna';
  const reject = (reason: string) => {
    log(session, 'approve_rejected', { actionId, reason }, actor);
    throw new Error(reason);
  };
  if (action.status !== 'pending_approval') reject(action.status === 'needs_clarification' ? 'Aksi masih menunggu klarifikasi.' : `Aksi berstatus "${action.status}" tidak dapat disetujui.`);
  if (opts.version != null && Number(opts.version) !== action.version) reject(`Versi yang Anda lihat (v${opts.version}) sudah tidak berlaku; versi terbaru v${action.version}. Tinjau ulang.`);
  const missing = requiredAcks(action).filter((c) => !(action.acks || {})[c.code]);
  if (missing.length) reject(`Konfirmasi tambahan belum dicentang: ${missing.map((m) => m.label).join('; ')}.`);
  const fp = fpOf(action);
  action.status = 'approved';
  action.approvedFingerprint = fp;
  action.approvedAt = session.clock();
  action.approvedBy = actor;
  action.fingerprint = fp;
  log(session, 'approve', { actionId, version: action.version, fingerprint: fp, approvedFields: action.fields }, actor);
  return action;
}

export function cancelAction(session: Session, actionId: string, reason = 'Dibatalkan oleh pengguna', actor = 'pengguna'): Action {
  const action = findAction(session, actionId);
  if (['simulated', 'cancelled', 'undone'].includes(action.status)) throw new Error('Aksi ini sudah selesai.');
  if (action.status === 'queued') throw new Error('Aksi sudah di antrean; gunakan Urungkan.');
  action.status = 'cancelled';
  invalidateApproval(action);
  log(session, 'cancel', { actionId, reason }, actor);
  return action;
}

/* -------------------------------------------------------- gate + queue */

const ADAPTER = { email: 'email', meeting: 'kalender', task: 'task board' };

/**
 * The only door to the connectors. Deterministic gate:
 *  1. status must be `approved`
 *  2. the fingerprint of the current fields must equal the approved fingerprint
 * The action then waits in the queue for the undo window before delivery.
 */
export function enqueueApproved(session: Session, actionId: string, nowMs = Date.now()) {
  const action = findAction(session, actionId);
  if (action.status !== 'approved') {
    log(session, 'gate_blocked', { actionId, status: action.status, reason: 'Belum disetujui' }, 'gerbang');
    throw new Error(`Ditolak gerbang persetujuan: status "${action.status}", bukan "approved". Tidak ada tool yang dipanggil.`);
  }
  const current = fpOf(action);
  if (current !== action.approvedFingerprint) {
    log(session, 'gate_blocked', { actionId, reason: 'Isi berubah setelah persetujuan', current, approved: action.approvedFingerprint }, 'gerbang');
    throw new Error('Ditolak gerbang persetujuan: isi berubah setelah disetujui. Perlu persetujuan baru.');
  }
  const windowMs = session.dataset.rules.undoWindowSeconds * 1000;
  action.result = {
    simulated: true,
    ref: `SIM-${action.type.toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    adapter: ADAPTER[action.type],
    queuedAt: new Date(nowMs).toISOString(),
    undoUntil: new Date(nowMs + windowMs).toISOString(),
    deliveredAt: null,
    undoneAt: null,
    fingerprint: current,
    version: action.version,
    payload: JSON.parse(JSON.stringify(action.fields)),
    note: 'SIMULASI — tidak ada email terkirim, kalender berubah, atau task board tersentuh.',
  };
  action.status = 'queued';
  log(session, 'queued', { actionId, ref: action.result.ref, undoUntil: action.result.undoUntil }, 'gerbang');
  return action.result;
}

/** Back-compat name: approval → queue. */
export const executeApproved = enqueueApproved;

export function undoAction(session: Session, actionId: string, nowMs = Date.now(), actor = 'pengguna') {
  const action = findAction(session, actionId);
  if (action.status !== 'queued' || !action.result) throw new Error('Hanya aksi di antrean yang bisa diurungkan.');
  if (nowMs >= Date.parse(action.result.undoUntil)) throw new Error('Jeda urungkan sudah lewat.');
  action.status = 'undone';
  action.result.undoneAt = new Date(nowMs).toISOString();
  const secs = Math.round((nowMs - Date.parse(action.result.queuedAt)) / 1000);
  log(session, 'undo', { actionId, ref: action.result.ref, afterSeconds: secs }, actor);
  return action;
}

/** Deliver queued actions whose undo window has passed. Re-checks the fingerprint. */
export function settleQueue(session: Session, nowMs = Date.now()) {
  const delivered = [];
  for (const a of session.actions) {
    if (a.status !== 'queued' || !a.result || nowMs < Date.parse(a.result.undoUntil)) continue;
    if (fpOf(a) !== a.approvedFingerprint) {
      a.status = 'pending_approval';
      invalidateApproval(a);
      log(session, 'gate_blocked', { actionId: a.id, reason: 'Isi berubah saat di antrean' }, 'gerbang');
      continue;
    }
    a.status = 'simulated';
    a.result.deliveredAt = new Date(nowMs).toISOString();
    session.metrics.simulated += 1;
    log(session, 'tool_result', { actionId: a.id, ref: a.result.ref, adapter: a.result.adapter, simulated: true }, `konektor ${a.result.adapter} (simulasi)`);
    delivered.push(a);
  }
  return delivered;
}

/* -------------------------------------------------------------- metrics */

export function summary(session: Session) {
  const byStatus: Record<string, number> = {};
  for (const a of session.actions) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  const findings = session.actions.flatMap((a) => a.findings);
  return {
    planVersion: session.planVersion,
    actions: session.actions.length,
    byStatus,
    blockingFindings: findings.filter((f) => f.severity === 'blocking').length,
    injectionsBlocked: session.findingsGlobal.filter((f) => f.code === 'INJECTION_DETECTED').length,
    questionsAsked: session.metrics.questionsAsked,
    simulated: session.metrics.simulated,
    pipelineMs: session.metrics.pipelineMs,
    auditEntries: session.audit.length,
    review: session.review ? { checked: session.review.checked, matched: session.review.matched, missing: session.review.missing, added: session.review.added } : null,
  };
}

export const UNKNOWN = UNKNOWN_ANSWER;
