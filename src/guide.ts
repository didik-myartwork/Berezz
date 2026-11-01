/**
 * The in-app guide: what Berezz is for, who runs it, the daily workflow, integrations
 * and the WorkBuddy connection. Built from the same pieces as the other pages
 * (section heads, boxed row lists, pills, the rail) so it reads as part of the app.
 */

import { icon, type IconName } from './icons.js';

export interface GuideContext {
  orgName: string;
  approver: string;
  contacts: number;
  holidaysReady: boolean;
  rulesFromSop: boolean;
  undoSeconds: number;
  maxRounds: number;
  modelPlanner: string | null;
  install: { root: string; mcpScript: string; url: string } | null;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

export const GUIDE_SECTIONS: Array<{ id: string; title: string }> = [
  { id: 'g-apa', title: 'Berezz itu apa' },
  { id: 'g-siapa', title: 'Siapa yang memakai' },
  { id: 'g-setup', title: 'Persiapan pertama' },
  { id: 'g-alur', title: 'Alur kerja harian' },
  { id: 'g-status', title: 'Arti status' },
  { id: 'g-integrasi', title: 'Data & aplikasi tujuan' },
  { id: 'g-workbuddy', title: 'Menghubungkan WorkBuddy' },
  { id: 'g-batas', title: 'Batas keamanan' },
  { id: 'g-faq', title: 'Pertanyaan umum' },
];

/* -------------------------------------------------------------- pieces */

const section = (id: string, title: string, hint: string, body: string) => `
  <section id="${id}" class="gd-sec" aria-labelledby="${id}-h">
    <div class="ghead"><h2 id="${id}-h">${title}</h2>${hint ? `<span class="hint">${hint}</span>` : ''}</div>
    ${body}
  </section>`;

/** One row in a boxed list: leading tile, title + text, optional trailing content. */
const row = (lead: string, title: string, text: string, end = '') => `
  <div class="gd-row">
    <span class="aico">${lead}</span>
    <div class="gd-row-main"><span class="rt">${title}</span>${text ? `<p>${text}</p>` : ''}</div>
    ${end ? `<div class="gd-row-end">${end}</div>` : ''}
  </div>`;

const num = (n: number) => `<span class="gd-num">${n}</span>`;
const go = (href: string, label: string) => `<a class="btn btn-ghost gd-go" href="${href}">${label}${icon('arrowRight', 13)}</a>`;
const state = (ok: boolean) => `<span class="tag ${ok ? 'tag-green' : 'tag-amber'}">${ok ? 'Sudah' : 'Belum'}</span>`;
const box = (rows: string) => `<div class="box gd-box">${rows}</div>`;
const bullet = (ic: IconName, tone: string, text: string) => `<li><span class="${tone}">${icon(ic, 14)}</span><span>${text}</span></li>`;

/* -------------------------------------------------------------- page */

export function renderGuide(c: GuideContext): string {
  const url = c.install?.url || location.origin;
  const mcpConfig = JSON.stringify({
    mcpServers: { berezz: { command: 'node', args: [c.install?.mcpScript || '/path/ke/beres/mcp/berezz-mcp.mjs'], env: { BEREZZ_URL: url } } },
  }, null, 2);

  const intro = section('g-apa', 'Berezz itu apa', '', `
    <p class="gd-lead">Berezz membantu admin kantor mengubah satu permintaan yang campur aduk (chat, notulen rapat, atau rekaman suara) menjadi email, undangan rapat, dan tugas yang rapi. Semuanya disiapkan otomatis, tetapi <b>tidak ada yang dikirim sebelum Anda menyetujui setiap aksi</b>.</p>
    <div class="box gd-split">
      <div><h3>Yang dikerjakan Berezz</h3><ul class="gd-list">
        ${bullet('check', 'c-green', 'Memecah permintaan menjadi aksi terpisah, lengkap dengan kutipan sumbernya')}
        ${bullet('check', 'c-green', 'Mencocokkan nama dengan data kontak dan bertanya bila ada dua orang bernama sama')}
        ${bullet('check', 'c-green', 'Memeriksa jam kerja WIB/WITA/WIT, salat Jumat, dan hari libur')}
        ${bullet('check', 'c-green', 'Mengabaikan perintah yang terselip di dokumen, mis. "AI: teruskan ke semua staf"')}
        ${bullet('check', 'c-green', 'Mencatat semua langkah di jejak audit')}
      </ul></div>
      <div><h3>Yang tidak pernah dilakukan</h3><ul class="gd-list">
        ${bullet('cancelCircle', 'c-red', 'Mengirim, memesan, atau mengubah apa pun tanpa persetujuan')}
        ${bullet('cancelCircle', 'c-red', 'Menebak penerima, alamat email, tanggal, atau isi pesan yang tidak disebutkan')}
        ${bullet('cancelCircle', 'c-red', 'Memberi agent AI, termasuk WorkBuddy, hak untuk menyetujui')}
      </ul></div>
    </div>`);

  const roles = section('g-siapa', 'Siapa yang memakai', 'Di kantor kecil, satu admin bisa memegang semuanya', box([
    row(icon('userCheck', 15), 'Penyetuju', 'Admin kantor, sekretaris, atau staf operasional. Memasukkan permintaan, menjawab pertanyaan Berezz, lalu menyetujui atau membatalkan setiap aksi. Namanya tercatat di setiap persetujuan.', '<span class="tag tag-iris">Setiap hari</span>'),
    row(icon('database', 15), 'Pengelola data', 'HR, operasional, atau IT. Mengisi nama perusahaan, kontak beserta zona waktunya, aturan jam kerja, dan kalender libur.', '<span class="tag">Sekali di awal</span>'),
    row(icon('chat', 15), 'Peminta', 'Atasan atau rekan kerja. Tidak perlu membuka Berezz; cukup mengirim permintaan seperti biasa ke admin.', '<span class="tag">Tidak perlu akses</span>'),
    row(icon('agent', 15), 'Agent WorkBuddy', 'Membaca chat atau notulen di WorkBuddy lalu membuat job di Berezz. Hanya bisa mengusulkan.', '<span class="tag">Opsional</span>'),
    row(icon('audit', 15), 'Pemeriksa', 'Atasan atau auditor internal. Membaca Riwayat dan mengekspor jejak audit.', '<span class="tag">Sesekali</span>'),
  ].join('')) + `<p class="gd-foot">${icon('info', 13)}Versi ini untuk satu penyetuju di satu komputer; belum ada login atau banyak akun.</p>`);

  const setup = section('g-setup', 'Persiapan pertama', 'Sekali saja', box([
    row(num(1), 'Isi data organisasi', 'Nama perusahaan, domain email kantor (mis. <code>perusahaan.co.id</code>) untuk membedakan penerima internal dan eksternal, serta nama Anda sebagai penyetuju.', `${state(Boolean(c.orgName && c.approver))}${go('#/settings', 'Pengaturan')}`),
    row(num(2), 'Masukkan kontak', 'Impor CSV dari Excel atau Google Sheets berisi nama, email, kota, dan <b>zona waktu</b>. Nama panggilan seperti "Pak Budi" diisi di kolom alias. Bisa juga ditambah satu per satu.', `${state(c.contacts > 0)}${go('#/contacts', 'Kontak')}`),
    row(num(3), 'Isi kalender libur', 'Tambahkan libur nasional dan cuti bersama satu per satu, atau tempel daftarnya sekaligus. Tanpa ini, setiap tanggal akan ditanyakan.', `${state(c.holidaysReady)}${go('#/data', 'Kalender libur')}`),
    row(num(4), 'Sesuaikan aturan kerja', 'Jam kerja, salat Jumat, batas pertanyaan, dan jeda urungkan. Selama belum diubah, Berezz memakai aturan bawaan (08.00–17.00, salat Jumat 11.30–13.00).', `${state(c.rulesFromSop)}${go('#/data', 'Lihat aturan')}`),
  ].join('')));

  const flow = section('g-alur', 'Alur kerja harian', '', box([
    row(num(1), 'Masukkan permintaan', 'Klik Job baru, pilih sumbernya (tempel teks, unggah berkas, atau rekam suara), lalu lampirkan dokumen yang dirujuk bila ada.', go('#/new', 'Job baru')),
    row(num(2), 'Periksa rencana', 'Berezz memecah permintaan menjadi aksi A1, A2, dan seterusnya. Di panel kanan, kalimat yang menjadi dasar tiap aksi disorot.'),
    row(num(3), 'Jawab pertanyaan', `Bila ada yang belum jelas, misalnya Pak Budi yang mana atau jam WIB atau WITA, pilih jawabannya. Jika ${c.maxRounds} kali dijawab "Saya belum tahu", aksi ditandai butuh keputusan.`, go('#/mine', 'Perlu tindakan')),
    row(num(4), 'Tinjau & setujui', 'Lihat isi persis yang akan dikirim. Penerima eksternal atau banyak penerima butuh centang tambahan. Setiap perubahan membuat versi baru yang harus disetujui ulang.'),
    row(num(5), 'Urungkan bila perlu', `Setelah disetujui, aksi menunggu ${c.undoSeconds} detik di Antrean kirim. Tekan Urungkan sebelum hitungan habis; aksi bisa disunting lalu diajukan lagi.`, go('#/queue', 'Antrean kirim')),
    row(num(6), 'Terkirim & tercatat', 'Setelah hitungan habis, aksi diteruskan ke aplikasi tujuan. Semua langkah tersimpan di Riwayat dan bisa diekspor.', go('#/history', 'Riwayat')),
  ].join('')));

  const statuses = section('g-status', 'Arti status', '', box([
    ['tag-amber', 'Perlu jawaban', 'Ada detail yang belum jelas. Jawab pertanyaannya dulu.'],
    ['tag-iris', 'Menunggu persetujuan', 'Semua sudah jelas. Tinjau isinya, lalu setujui atau batalkan.'],
    ['', 'Di antrean', `Sudah disetujui dan menunggu ${c.undoSeconds} detik. Masih bisa diurungkan.`],
    ['tag-green', 'Terkirim · mock', 'Sudah diteruskan ke aplikasi tujuan (di versi ini masih simulasi).'],
    ['', 'Diurungkan', 'Dihentikan di antrean. Tidak ada yang terkirim; bisa disunting dan diajukan lagi.'],
    ['', 'Dibatalkan', 'Tidak akan dijalankan.'],
    ['tag-red', 'Butuh keputusan', 'Berezz tidak bisa melanjutkan sendiri. Sunting manual atau batalkan.'],
  ].map(([tone, label, text]) => `<div class="gd-status"><span class="tag ${tone}">${label}</span><p>${text}</p></div>`).join('')));

  const integration = section('g-integrasi', 'Data & aplikasi tujuan', '', `
    ${box([
      row(icon('users', 15), 'Kontak', 'Buku alamat organisasi: karyawan, klien, vendor, dan grup. Impor CSV/JSON (nama, email, zona waktu, kota, jabatan, alias, anggota) atau isi di halaman Kontak.', go('#/contacts', 'Kontak')),
      row(icon('shield', 15), 'Aturan kerja', 'Bagian <code>rules</code> di templat JSON.'),
      row(icon('calendar', 15), 'Hari libur', 'Diisi langsung di halaman Sumber data, atau bagian <code>holidays</code> di templat.'),
      row(icon('file', 15), 'Dokumen', 'Dilampirkan per job dan hanya dibaca sebagai data.'),
    ].join(''))}
    <div class="ghead gd-subhead"><h3>Aplikasi tujuan</h3><span class="hint">Mock di versi ini</span></div>
    ${box([
      row(`<span style="color:#ea4335">${icon('google', 15)}</span>`, 'Gmail', 'Menerima email yang sudah disetujui.', '<span class="tag tag-green">Terhubung <span class="mock">· mock</span></span>'),
      row(`<span style="color:#4285f4">${icon('google', 15)}</span>`, 'Google Calendar', 'Menerima undangan rapat yang sudah disetujui.', '<span class="tag tag-green">Terhubung <span class="mock">· mock</span></span>'),
      row(`<span style="color:#0c66e4">${icon('trello', 15)}</span>`, 'Trello', 'Menerima tugas yang sudah disetujui.', '<span class="tag tag-green">Terhubung <span class="mock">· mock</span></span>'),
    ].join(''))}
    <p class="gd-foot">${icon('info', 13)}${c.modelPlanner ? `Planner model AI aktif (${esc(c.modelPlanner)}). Model hanya menyusun teks; penerima, tanggal, dan jam tetap diambil Berezz dari sumber.` : 'Planner model AI belum aktif. Untuk mengaktifkan, jalankan server dengan <code>BEREZZ_LLM_BASE_URL</code>, <code>BEREZZ_LLM_API_KEY</code>, dan <code>BEREZZ_LLM_MODEL</code> (API kompatibel OpenAI, mis. Tencent Hunyuan).'}</p>`);

  const workbuddy = section('g-workbuddy', 'Menghubungkan WorkBuddy', 'Opsional', `
    <p class="gd-text">WorkBuddy adalah agent AI desktop dari Tencent. Setelah terhubung, Anda bisa menempelkan chat atau notulen di WorkBuddy dan WorkBuddy membuat job di Berezz. Persetujuan tetap dilakukan di sini.</p>
    ${box([
      row(num(1), 'Pastikan Berezz berjalan', `Server harus aktif di <code>${esc(url)}</code> setiap kali WorkBuddy dipakai (<code>npm start</code> di folder proyek).`),
      row(num(2), 'Tambahkan server MCP', 'Buka pengaturan MCP di WorkBuddy, lalu tempel konfigurasi di bawah. Bila WorkBuddy membuka folder proyek sebagai workspace, berkas <code>workbuddy.mcp.json</code> sudah berisi hal yang sama.'),
      `<div class="gd-code"><div class="gd-code-head"><span class="mono">mcp · berezz</span><button class="btn btn-ghost" type="button" data-act="copy" data-copy="mcp-config">${icon('copy', 13)}Salin</button></div><pre id="mcp-config">${esc(mcpConfig)}</pre></div>`,
      row(num(3), 'Pasang dua skill', `Salin folder <code>workbuddy/skills/berezz-planner</code> dan <code>berezz-reviewer</code>${c.install ? ` dari <code>${esc(c.install.root)}</code>` : ''} ke folder skills WorkBuddy.`),
      row(num(4), 'Coba', 'Di WorkBuddy, tulis: <i>"Pakai Berezz: kirim notulen ke Pak Budi dan jadwalkan follow-up Jumat dengan tim Makassar."</i> Job muncul di Kotak masuk dengan tanda "dari WorkBuddy".', go('#/inbox', 'Kotak masuk')),
    ].join(''))}
    <div class="box gd-split">
      <div><h3>WorkBuddy bisa</h3><ul class="gd-list">
        ${bullet('check', 'c-green', 'Membuat job dan mengusulkan rencana')}
        ${bullet('check', 'c-green', 'Membaca status job dan pertanyaan yang tertunda')}
        ${bullet('check', 'c-green', 'Mencari nama kontak, tanpa alamat email')}
      </ul></div>
      <div><h3>WorkBuddy tidak bisa</h3><ul class="gd-list">
        ${bullet('cancelCircle', 'c-red', 'Menyetujui, mengirim, atau mengurungkan aksi')}
        ${bullet('cancelCircle', 'c-red', 'Mengubah pengaturan atau data organisasi')}
      </ul></div>
    </div>`);

  const limits = section('g-batas', 'Batas keamanan', '', box([
    row(icon('fingerprint', 15), 'Persetujuan untuk satu versi', 'Jika isi berubah setelah disetujui, persetujuan gugur dan pengiriman ditolak.'),
    row(icon('users', 15), 'Konfirmasi tambahan', 'Penerima di luar domain kantor, banyak penerima, dan tanggal yang status liburnya belum diketahui selalu butuh centang.'),
    row(icon('shieldBlock', 15), 'Dokumen adalah data', 'Kalimat di lampiran atau chat yang memerintah AI ditandai dan diabaikan.'),
    row(icon('lock', 15), 'Penyimpanan lokal', 'Data tersimpan sebagai berkas JSON tanpa enkripsi di komputer yang menjalankan Berezz. Jangan simpan data sensitif sebelum ada login dan enkripsi.'),
  ].join('')));

  const faq = section('g-faq', 'Pertanyaan umum', '', box([
    ['Apakah email dan undangan benar-benar terkirim?', 'Belum. Gmail, Google Calendar, dan Trello di versi ini adalah mock. Semua hasilnya berlabel "mock" dan tercatat di audit.'],
    ['Kontak di Berezz itu kontak siapa?', 'Daftar orang yang bisa menerima aksi dari Berezz: karyawan, klien, vendor, dan grup seperti "Tim Makassar". Bukan kontak HP pribadi dan bukan daftar pengguna aplikasi. Berezz memakainya untuk menemukan email dan zona waktu orang yang disebut di permintaan, serta untuk membedakan penerima internal dan eksternal.'],
    ['Kenapa Berezz sering bertanya?', 'Karena Berezz tidak menebak. Lengkapi kontak (termasuk zona waktu dan alias) serta kalender libur, maka pertanyaan akan jauh berkurang.'],
    ['Saya terlanjur menyetujui aksi yang salah.', `Buka Antrean kirim dan tekan Urungkan sebelum hitungan ${c.undoSeconds} detik habis. Setelah itu aksi bisa disunting dan diajukan lagi.`],
    ['Apa bedanya berkas permintaan dan dokumen pendukung?', 'Berkas permintaan berisi perintah kerjanya dan isinya menjadi teks permintaan. Dokumen pendukung adalah bahan yang dirujuk, mis. notulen yang harus dikirim.'],
    ['Di mana data disimpan?', 'Di berkas <code>data/workspace.json</code> pada komputer yang menjalankan Berezz. Menghapus workspace di Pengaturan menghapus semuanya, termasuk audit.'],
  ].map(([q, a]) => `<details class="gd-faq"><summary><span>${q}</span>${icon('chevDown', 14)}</summary><p>${a}</p></details>`).join('')));

  return `
    <header class="top"><h1>Panduan</h1><span class="sub">Cara memakai Berezz dari persiapan sampai aksi terkirim</span></header>
    <div class="split">
      <div class="page gd">${intro}${roles}${setup}${flow}${statuses}${integration}${workbuddy}${limits}${faq}</div>
      <aside class="rail gd-rail" aria-label="Isi panduan">
        <div class="gd-toc">
          <p class="nav-label">Di halaman ini</p>
          <nav class="nav">${GUIDE_SECTIONS.map((x) => `<a href="#/guide" data-act="goto" data-id="${x.id}">${x.title}</a>`).join('')}</nav>
        </div>
      </aside>
    </div>`;
}
