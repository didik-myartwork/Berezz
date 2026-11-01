/**
 * Workspace file shape: one JSON document holding settings, the organisation's data and
 * every job. The server and the tests share this module so the validator that guards
 * startup is the same one that is tested against real saved files.
 */
import { defaultSettings, emptyDataset, TIMEZONES } from './dataset.js';
export function emptyWorkspace() {
    return { version: 1, seq: 0, settings: defaultSettings(), dataset: emptyDataset(), jobs: [] };
}
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
/**
 * Validate a parsed workspace file and fill in fields added in later versions.
 * Throws on anything that is not a workspace this version wrote, so the caller can
 * refuse to start instead of silently replacing the organisation's data.
 */
export function normalizeWorkspace(value) {
    if (!isObject(value))
        throw new Error('Isi workspace bukan objek JSON.');
    const raw = value;
    if (raw.version !== 1 || !isObject(raw.settings) || !isObject(raw.dataset) || !Array.isArray(raw.jobs)) {
        throw new Error('Struktur workspace tidak lengkap atau versinya tidak didukung.');
    }
    const ds = raw.dataset;
    // Attachments live inside each job, so a dataset has no documents list.
    if (!Array.isArray(ds.contacts) || !isObject(ds.rules) || !(ds.holidays === null || ds.holidays === undefined || Array.isArray(ds.holidays))) {
        throw new Error('Dataset workspace tidak lengkap.');
    }
    for (const [i, job] of raw.jobs.entries()) {
        if (!isObject(job) || typeof job.id !== 'string' || !isObject(job.session)) {
            throw new Error(`Job ke-${i + 1} di workspace tidak lengkap.`);
        }
    }
    const base = emptyWorkspace();
    return {
        ...base,
        ...raw,
        version: 1,
        seq: typeof raw.seq === 'number' ? raw.seq : raw.jobs.length,
        settings: { ...base.settings, ...raw.settings },
        dataset: { ...base.dataset, ...ds, timezones: TIMEZONES },
        jobs: raw.jobs,
    };
}
