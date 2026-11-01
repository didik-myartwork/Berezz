# Berezz — Chat-to-Action Copilot

**Chat berantakan jadi aksi kantor, setelah Anda setujui.**

Berezz adalah prototipe untuk Tencent Cloud AI CAN DO IT Indonesia Hackathon 2026, Challenge B: The Office Agent. Satu pesan chat, notulen, atau voice note dipecah menjadi aksi email, rapat, dan tugas. Berezz bertanya bila ada yang ambigu, memeriksa aturan kerja, menampilkan detail persis untuk disetujui manusia, lalu meneruskan aksi yang disetujui ke konektor simulasi dengan jeda urungkan 60 detik. Semua yang dilihat, diputuskan, dan dijalankan tercatat di audit.

## Jalankan

Butuh Node.js 18+.

```bash
npm install
npm run build
npm start
```

Buka `http://localhost:8787`. Saat pertama dibuka, workspace **kosong**: Berezz tidak membawa data contoh.

1. **Pengaturan** — isi nama organisasi/PT (bisa diubah kapan saja), domain email internal, dan nama penyetuju.
2. **Sumber data** — impor dataset organisasi (JSON atau CSV kontak; unduh templat dari halaman itu) atau tambah kontak satu per satu.
3. **Job baru** — tempel chat/notulen, unggah berkas, atau rekam voice note Bahasa Indonesia (Chrome/Edge).

Untuk mencoba tanpa data sendiri, impor `datasets/organisasi-uji/dataset.json` (organisasi fiktif buatan tim, bukan dataset resmi panitia).

Opsi server: `--port 8787`, `--data ./data/workspace.json`. Workspace tersimpan secara lokal dengan izin file terbatas di `data/workspace.json` (di-*gitignore*). Bila berkas rusak, Berezz berhenti tanpa menggantinya dengan workspace kosong. Bila penyimpanan gagal saat berjalan, perubahan baru diblokir dan server mengembalikan error.

Workspace masih berupa JSON lokal tanpa enkripsi atau autentikasi akun. Gunakan hanya data demo/fiktif sampai kebutuhan perlindungan data organisasi nyata terpenuhi. `.env` dan berkas kunci API juga di-*gitignore*.

## Arsitektur singkat

```
Permintaan (UI atau agent WorkBuddy via MCP)
  → Planner (aturan Berezz, atau rencana model yang di-grounding ulang)
  → Validator (kontak, zona waktu, jam kerja, salat Jumat, hari libur, injeksi)
  → Klarifikasi (maks 3 putaran, lalu eskalasi)
  → Reviewer kedua (membandingkan rencana dengan permintaan asli)
  → Layar persetujuan (versi + fingerprint) → gerbang deterministik di server
  → Antrean 60 detik (bisa diurungkan) → konektor SIMULASI → audit
```

Detail: [`docs/architecture.md`](docs/architecture.md). Batas tanggung jawab: [`docs/accountability-sheet.md`](docs/accountability-sheet.md).

## WorkBuddy

Agent WorkBuddy terhubung lewat server MCP Berezz (`mcp/berezz-mcp.mjs`, konfigurasi `workbuddy.mcp.json`) dan dua skill (`workbuddy/skills/berezz-planner`, `workbuddy/skills/berezz-reviewer`). Agent boleh membuat job, mengusulkan rencana, dan membaca status. Agent **tidak punya** tool untuk menyetujui, mengubah, atau mengirim. Panduan: [`workbuddy/README.md`](workbuddy/README.md).

Planner model opsional di server Berezz memakai API kompatibel OpenAI (misalnya Tencent Hunyuan):

```bash
BEREZZ_LLM_BASE_URL=… BEREZZ_LLM_API_KEY=… BEREZZ_LLM_MODEL=… npm start
```

## Uji

```bash
npm test                 # 36 tes: engine + 20 skenario + MCP + persistence
node tools/run-cases.mjs # jalankan 20 test case lewat UI nyata dan simpan screenshot
```

Hasil dan screenshot: [`docs/test-results.md`](docs/test-results.md), folder `screenshots/`.

## Struktur

| Path | Isi |
|---|---|
| `src/engine.ts` | Pipeline deterministik: planner, validator, klarifikasi, reviewer, gerbang, antrean |
| `src/dataset.ts` | Impor dan normalisasi data organisasi; aturan bawaan berlabel |
| `src/ui.ts`, `index.html`, `app/styles.css` | Antarmuka (kotak masuk job, persetujuan, antrean, riwayat, sumber data, pengaturan) |
| `server.mjs` | Server lokal, penyimpanan workspace, gerbang persetujuan, API agent |
| `mcp/`, `workbuddy/`, `workbuddy.mcp.json` | Integrasi WorkBuddy |
| `datasets/organisasi-uji/` | Dataset uji fiktif yang bisa diimpor |
| `tests/` | Test engine, 20 test case, test MCP |
| `docs/` | Dokumen submission |

Ikon: Hugeicons (gratis). Font: Geist (SIL OFL), disimpan lokal di `app/fonts/`.
