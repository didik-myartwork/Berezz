/**
 * Berezz — organisation data.
 *
 * Berezz ships with NO contacts, holidays or documents. Everything the agent reasons
 * about comes from data the organisation imports or types in. The only built-in values
 * are facts (WIB/WITA/WIT offsets) and default operating rules, which are labelled as
 * defaults until the organisation replaces them with its own SOP.
 */
export const TIMEZONES = {
    WIB: { label: 'WIB', city: 'Jakarta', offsetMinutes: 420 },
    WITA: { label: 'WITA', city: 'Makassar', offsetMinutes: 480 },
    WIT: { label: 'WIT', city: 'Jayapura', offsetMinutes: 540 },
};
const DEFAULT_RULE_SOURCE = 'Aturan bawaan Berezz (belum dari SOP organisasi)';
export function defaultRules() {
    return {
        officeHours: { start: '08:00', end: '17:00', weekdays: [1, 2, 3, 4, 5], source: DEFAULT_RULE_SOURCE },
        fridayPrayer: { start: '11:30', end: '13:00', source: DEFAULT_RULE_SOURCE },
        meetingDefaultMinutes: 60,
        maxClarificationRounds: 3,
        undoWindowSeconds: 60,
        isDefault: true,
        source: DEFAULT_RULE_SOURCE,
    };
}
export function emptyDataset() {
    return {
        meta: { origin: 'empty', fileName: null, importedAt: null, importedBy: null },
        timezones: TIMEZONES,
        contacts: [],
        rules: defaultRules(),
        holidays: null,
    };
}
export function defaultSettings() {
    return {
        orgName: '',
        orgDomains: [],
        operatorName: '',
        operatorRole: '',
        defaultTimezone: 'WIB',
        refDate: { mode: 'system', fixed: null },
        planner: 'rules',
    };
}
/* ------------------------------------------------------------ contacts */
const TZ_ALIASES = {
    wib: 'WIB', 'gmt+7': 'WIB', 'utc+7': 'WIB', 'asia/jakarta': 'WIB', 'asia/pontianak': 'WIB',
    wita: 'WITA', 'gmt+8': 'WITA', 'utc+8': 'WITA', 'asia/makassar': 'WITA',
    wit: 'WIT', 'gmt+9': 'WIT', 'utc+9': 'WIT', 'asia/jayapura': 'WIT',
};
export function parseTimezone(v) {
    const key = String(v ?? '').trim().toLowerCase();
    return TZ_ALIASES[key] || null;
}
function slug(s) {
    return s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}
const pick = (o, ...keys) => {
    for (const k of keys) {
        const v = o[k];
        if (v !== undefined && v !== null && String(v).trim() !== '')
            return v;
    }
    return null;
};
function listOf(v) {
    if (Array.isArray(v))
        return v.map((x) => String(x).trim()).filter(Boolean);
    if (v == null)
        return [];
    return String(v).split(/[;|]/).map((x) => x.trim()).filter(Boolean);
}
/** Normalise one contact record from any of the accepted shapes. Returns null when unusable. */
export function normalizeContact(raw, used = new Set()) {
    const name = String(pick(raw, 'name', 'nama', 'full_name', 'nama_lengkap') ?? '').trim();
    const email = String(pick(raw, 'email', 'surel', 'e-mail') ?? '').trim();
    if (!name)
        return { contact: null, problem: 'nama kosong' };
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
        return { contact: null, problem: `email tidak valid untuk ${name}` };
    const tzRaw = pick(raw, 'timezone', 'zona_waktu', 'zona', 'tz');
    const kindRaw = String(pick(raw, 'kind', 'jenis', 'type', 'tipe') ?? '').toLowerCase();
    const kind = /ext|eksternal|luar/.test(kindRaw) ? 'external' : /int|internal|dalam/.test(kindRaw) ? 'internal' : null;
    let id = String(pick(raw, 'id') ?? '') || `c-${slug(name)}`;
    while (used.has(id))
        id = `${id}-x`;
    used.add(id);
    const members = listOf(pick(raw, 'members', 'anggota'));
    return {
        contact: {
            id,
            name,
            email,
            role: String(pick(raw, 'role', 'jabatan', 'title', 'peran') ?? '') || undefined,
            city: String(pick(raw, 'city', 'kota', 'lokasi') ?? '') || undefined,
            timezone: parseTimezone(tzRaw),
            kind,
            aliases: listOf(pick(raw, 'aliases', 'alias', 'panggilan')),
            members: members.length ? members : undefined,
        },
        problem: tzRaw && !parseTimezone(tzRaw) ? `zona waktu "${tzRaw}" tidak dikenali untuk ${name}` : undefined,
    };
}
export function contactKind(c, settings) {
    if (c.kind)
        return c.kind;
    const domain = c.email.split('@')[1]?.toLowerCase() || '';
    if (!settings.orgDomains.length)
        return 'external';
    return settings.orgDomains.some((d) => domain === d.toLowerCase() || domain.endsWith(`.${d.toLowerCase()}`)) ? 'internal' : 'external';
}
export function contactRef(c, settings) {
    return {
        id: c.id,
        name: c.name,
        email: c.email,
        role: c.role,
        city: c.city,
        timezone: c.timezone ?? null,
        kind: contactKind(c, settings),
        members: c.members?.length,
    };
}
/** Minimal CSV parser: header row, comma or semicolon separated, double-quote escaping. */
export function parseCSV(text) {
    const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length)
        return [];
    const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    const split = (line) => {
        const out = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (q) {
                if (ch === '"' && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                }
                else if (ch === '"')
                    q = false;
                else
                    cur += ch;
            }
            else if (ch === '"')
                q = true;
            else if (ch === sep) {
                out.push(cur);
                cur = '';
            }
            else
                cur += ch;
        }
        out.push(cur);
        return out.map((s) => s.trim());
    };
    const head = split(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map((l) => {
        const cells = split(l);
        const row = {};
        head.forEach((h, i) => { row[h] = cells[i] ?? ''; });
        return row;
    });
}
function normalizeHolidays(raw, fileName, warnings) {
    if (!Array.isArray(raw))
        return null;
    const out = [];
    for (const h of raw) {
        const date = String(pick(h, 'date', 'tanggal') ?? '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            warnings.push(`hari libur dilewati: tanggal "${date}" bukan format YYYY-MM-DD`);
            continue;
        }
        out.push({ date, name: String(pick(h, 'name', 'nama', 'keterangan') ?? 'Hari libur'), source: String(pick(h, 'source', 'sumber') ?? fileName) });
    }
    return out;
}
function normalizeRules(raw, fileName, warnings) {
    const base = defaultRules();
    if (!raw || typeof raw !== 'object')
        return base;
    const src = String(pick(raw, 'source', 'sumber') ?? fileName);
    const hhmm = (v, fallback) => {
        const s = String(v ?? '').replace('.', ':');
        if (/^\d{1,2}:\d{2}$/.test(s))
            return s.padStart(5, '0');
        if (v != null)
            warnings.push(`aturan: jam "${v}" tidak dikenali, dipakai ${fallback}`);
        return fallback;
    };
    const oh = (pick(raw, 'officeHours', 'jam_kerja') || {});
    const fp = (pick(raw, 'fridayPrayer', 'salat_jumat', 'sholat_jumat') || {});
    return {
        officeHours: {
            start: hhmm(pick(oh, 'start', 'mulai'), base.officeHours.start),
            end: hhmm(pick(oh, 'end', 'selesai'), base.officeHours.end),
            weekdays: Array.isArray(oh.weekdays) ? oh.weekdays.map(Number) : base.officeHours.weekdays,
            source: src,
        },
        fridayPrayer: {
            start: hhmm(pick(fp, 'start', 'mulai'), base.fridayPrayer.start),
            end: hhmm(pick(fp, 'end', 'selesai'), base.fridayPrayer.end),
            source: src,
        },
        meetingDefaultMinutes: Number(pick(raw, 'meetingDefaultMinutes', 'durasi_rapat_menit')) || base.meetingDefaultMinutes,
        maxClarificationRounds: Number(pick(raw, 'maxClarificationRounds', 'maks_putaran_klarifikasi')) || base.maxClarificationRounds,
        undoWindowSeconds: Number(pick(raw, 'undoWindowSeconds', 'jeda_urungkan_detik')) || base.undoWindowSeconds,
        isDefault: false,
        source: src,
    };
}
/**
 * Import an organisation dataset. Accepts:
 *  - JSON object { contacts|kontak, rules|aturan, holidays|hari_libur, organization? }
 *  - JSON array of contacts
 *  - CSV of contacts (header row)
 * Sections not present keep their current value.
 */
export function importDataset(current, input) {
    const warnings = [];
    const errors = [];
    const fileName = input.fileName || 'impor';
    const next = JSON.parse(JSON.stringify(current));
    next.timezones = TIMEZONES;
    let parsed;
    const isCSV = /\.csv$/i.test(fileName) || (!/^\s*[[{]/.test(input.text) && /,|;/.test(input.text.split('\n')[0] || ''));
    if (isCSV)
        parsed = { contacts: parseCSV(input.text) };
    else {
        try {
            parsed = JSON.parse(input.text);
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            return { dataset: current, report: { ok: false, contacts: 0, holidays: null, rules: current.rules.isDefault ? 'default' : 'imported', warnings, errors: [`Berkas bukan JSON/CSV yang valid: ${message}`] } };
        }
    }
    if (Array.isArray(parsed))
        parsed = { contacts: parsed };
    const obj = (parsed || {});
    const rawContacts = pick(obj, 'contacts', 'kontak');
    if (rawContacts) {
        if (!Array.isArray(rawContacts))
            errors.push('Bagian kontak harus berupa daftar.');
        else {
            const used = new Set();
            const contacts = [];
            for (const r of rawContacts) {
                const { contact, problem } = normalizeContact(r, used);
                if (problem)
                    warnings.push(problem);
                if (contact)
                    contacts.push(contact);
            }
            next.contacts = contacts;
        }
    }
    const rawHol = pick(obj, 'holidays', 'hari_libur', 'libur');
    if (rawHol)
        next.holidays = normalizeHolidays(rawHol, fileName, warnings);
    const rawRules = pick(obj, 'rules', 'aturan', 'operational_rules');
    if (rawRules)
        next.rules = normalizeRules(rawRules, fileName, warnings);
    if (!rawContacts && !rawHol && !rawRules)
        errors.push('Tidak ada bagian contacts, holidays, atau rules yang dikenali.');
    if (errors.length) {
        return { dataset: current, report: { ok: false, contacts: 0, holidays: null, rules: current.rules.isDefault ? 'default' : 'imported', warnings, errors } };
    }
    next.meta = { origin: 'imported', fileName, importedAt: new Date().toISOString(), importedBy: input.by || null };
    const org = (pick(obj, 'organization', 'organisasi') || null);
    return {
        dataset: next,
        report: {
            ok: true,
            contacts: next.contacts.length,
            holidays: next.holidays ? next.holidays.length : null,
            rules: next.rules.isDefault ? 'default' : 'imported',
            organization: org ? String(pick(org, 'name', 'nama') ?? '') || null : null,
            organizationDomains: org ? listOf(pick(org, 'domains', 'domain')) : [],
            warnings,
            errors,
        },
    };
}
export function addContact(current, raw) {
    const used = new Set(current.contacts.map((c) => c.id));
    const { contact, problem } = normalizeContact(raw, used);
    if (!contact)
        return { dataset: current, contact: null, problem };
    const next = { ...current, contacts: [...current.contacts, contact] };
    if (next.meta.origin === 'empty')
        next.meta = { ...next.meta, origin: 'manual' };
    return { dataset: next, contact, problem };
}
/** Replace one contact's fields; the id stays so existing references keep pointing at it. */
export function updateContact(current, id, raw) {
    if (!current.contacts.some((c) => c.id === id))
        return { dataset: current, contact: null, problem: 'kontak tidak ditemukan' };
    const { contact, problem } = normalizeContact({ ...raw, id }, new Set());
    if (!contact)
        return { dataset: current, contact: null, problem };
    return { dataset: { ...current, contacts: current.contacts.map((c) => (c.id === id ? contact : c)) }, contact, problem };
}
/** Jobs keep their own copy of the dataset, so removing a contact never changes an existing plan. */
export function removeContact(current, id) {
    return { ...current, contacts: current.contacts.filter((c) => c.id !== id) };
}
/** Quality signals shown on the data page. */
export function datasetHealth(ds) {
    const firstNames = new Map();
    for (const c of ds.contacts) {
        const f = c.name.split(/\s+/)[0].toLowerCase();
        firstNames.set(f, (firstNames.get(f) || 0) + 1);
    }
    return {
        contacts: ds.contacts.length,
        withoutTimezone: ds.contacts.filter((c) => !c.timezone),
        duplicateFirstNames: [...firstNames.entries()].filter(([, n]) => n > 1).map(([name, n]) => ({ name, n })),
        holidays: ds.holidays ? ds.holidays.length : null,
        rulesDefault: ds.rules.isDefault,
    };
}
/** Template the organisation can fill in. Field names only; no records. */
export const DATASET_TEMPLATE = {
    contacts: [
        { name: '', email: '', timezone: 'WIB | WITA | WIT', city: '', role: '', kind: 'internal | external', aliases: ['panggilan, mis. Pak ...'], members: [] },
    ],
    rules: {
        source: 'Nama/nomor SOP',
        officeHours: { start: '08:00', end: '17:00', weekdays: [1, 2, 3, 4, 5] },
        fridayPrayer: { start: '11:30', end: '13:00' },
        meetingDefaultMinutes: 60,
        maxClarificationRounds: 3,
        undoWindowSeconds: 60,
    },
    holidays: [{ date: 'YYYY-MM-DD', name: '', source: 'Sumber kalender' }],
};
/* ------------------------------------------------------------- holidays */
const MONTH_NUM = {
    januari: 1, jan: 1, january: 1, februari: 2, feb: 2, february: 2, maret: 3, mar: 3, march: 3, april: 4, apr: 4,
    mei: 5, may: 5, juni: 6, jun: 6, june: 6, juli: 7, jul: 7, july: 7, agustus: 8, agu: 8, agt: 8, aug: 8, august: 8,
    september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, oct: 10, october: 10, november: 11, nov: 11,
    desember: 12, des: 12, dec: 12, december: 12,
};
function validDate(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
        return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
/** Read one pasted line: a date in a common format followed by the holiday's name. */
export function parseHolidayLine(line) {
    const t = line.trim().replace(/^[-*•\d]+[.)]\s+(?=\d)/, '');
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})\b[\s,;:\t|–—-]*(.*)$/.exec(t);
    if (m) {
        const d = validDate(+m[1], +m[2], +m[3]);
        return d ? { date: d, name: m[4].trim() } : null;
    }
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b[\s,;:\t|–—-]*(.*)$/.exec(t);
    if (m) {
        const d = validDate(+m[3], +m[2], +m[1]);
        return d ? { date: d, name: m[4].trim() } : null;
    }
    m = /^(?:\p{L}+,?\s+)?(\d{1,2})\s+(\p{L}+)\.?\s+(\d{4})\b[\s,;:\t|–—-]*(.*)$/u.exec(t);
    if (m && MONTH_NUM[m[2].toLowerCase()]) {
        const d = validDate(+m[3], MONTH_NUM[m[2].toLowerCase()], +m[1]);
        return d ? { date: d, name: m[4].trim() } : null;
    }
    return null;
}
/** Parse a pasted list (one holiday per line). Header rows and blank lines are skipped. */
export function parseHolidayList(text) {
    const holidays = [];
    const skipped = [];
    for (const raw of String(text || '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || /^(tanggal|date)\b/i.test(line))
            continue;
        const h = parseHolidayLine(line);
        if (h)
            holidays.push({ date: h.date, name: h.name.replace(/^["']|["']$/g, '') || 'Hari libur' });
        else
            skipped.push(line);
    }
    return { holidays, skipped };
}
/** Add or rename holidays (keyed by date) and keep the list sorted. Turns "not provided" into a list. */
export function upsertHolidays(current, items, source) {
    const byDate = new Map((current.holidays || []).map((h) => [h.date, h]));
    for (const it of items)
        byDate.set(it.date, { date: it.date, name: it.name || 'Hari libur', source });
    const holidays = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { ...current, holidays, meta: current.meta.origin === 'empty' ? { ...current.meta, origin: 'manual' } : current.meta };
}
export function removeHoliday(current, date) {
    if (!current.holidays)
        return current;
    return { ...current, holidays: current.holidays.filter((h) => h.date !== date) };
}
