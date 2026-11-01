/**
 * Berezz — node:test wrapper for the 20 team-made test cases (T01–T20).
 *
 * LABEL: cases and dataset are made by the Berezz team, NOT the organiser's official
 * dataset/tests. Case format, step semantics and the check vocabulary are documented in
 * tests/lib/cases.mjs, which does all the work so other runners can share it.
 *
 * Run: npm run build && node --test tests/cases.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, ROOT, loadDataset, loadCases, runCaseHeadless } from './lib/cases.mjs';

const D = await import(join(ROOT, 'app', 'dataset.js'));

test('Dataset uji terimpor bersih (JSON) dan berlabel', () => {
  const { report, dataset, organization, label } = loadDataset();
  const settings = { ...D.defaultSettings(), orgDomains: organization.domains };
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.deepEqual(report.warnings, []);
  assert.match(label, /bukan dataset\/test resmi panitia/);
  assert.equal(report.rules, 'imported');
  assert.match(dataset.rules.source, /SOP-OPS-03/);
  assert.ok(report.contacts >= 20 && report.contacts <= 30, `jumlah kontak ${report.contacts}`);
  assert.ok(dataset.contacts.every((c) => /\.(test|example)$/.test(c.email.split('@')[1])), 'semua email memakai domain cadangan');
  const tz = new Set(dataset.contacts.map((c) => c.timezone));
  for (const z of ['WIB', 'WITA', 'WIT', null]) assert.ok(tz.has(z), `ada kontak zona ${z}`);
  assert.equal(dataset.contacts.filter((c) => c.aliases.includes('Pak Budi')).length, 2);
  assert.ok(D.datasetHealth(dataset).duplicateFirstNames.some((d) => d.name === 'budi'));
  const ext = dataset.contacts.filter((c) => D.contactKind(c, settings) === 'external');
  assert.ok(ext.length >= 3 && ext.every((c) => !c.email.endsWith(`@${organization.domains[0]}`)));
  assert.ok(dataset.contacts.find((c) => c.name === 'Semua Staf').members.length >= 12);
  assert.ok(dataset.holidays.some((h) => h.date === '2026-11-13' && /kebijakan perusahaan/.test(h.name)));
});

test('Versi CSV kontak terimpor dan diklasifikasi lewat domain organisasi', () => {
  const { organization } = loadDataset();
  const text = readFileSync(join(DATA_DIR, 'kontak.csv'), 'utf8');
  const { dataset, report } = D.importDataset(D.emptyDataset(), { fileName: 'kontak.csv', text });
  assert.equal(report.ok, true, report.errors.join('; '));
  assert.deepEqual(report.warnings, []);
  assert.ok(report.contacts >= 10);
  const settings = { ...D.defaultSettings(), orgDomains: organization.domains };
  const byName = (n) => dataset.contacts.find((c) => c.name === n);
  assert.equal(D.contactKind(byName('Budi Santoso'), settings), 'internal');
  assert.equal(D.contactKind(byName('Dewi Anggraini'), settings), 'external');
  assert.equal(byName('Sari Dewanti').timezone, null);
  assert.deepEqual(byName('Budi Hartono').aliases, ['Pak Budi', 'Budi H']);
  assert.equal(byName('Tim Makassar').members.length, 4);
});

for (const c of loadCases()) {
  test(`${c.id} ${c.title}`, () => {
    const { failures } = runCaseHeadless(c);
    assert.ok(failures.length === 0, `\n${c.id} GAGAL:\n  - ${failures.join('\n  - ')}\nDiharapkan: ${c.expected}`);
  });
}
