# Accountability sheet — Berezz

Berezz mengubah satu permintaan kerja menjadi rencana email, rapat, dan tugas. Manusia menyetujui setiap aksi sebelum apa pun diteruskan.

## Yang bisa diakses

| Data | Sumber | Keterangan |
|---|---|---|
| Teks permintaan dan lampiran job | Ditempel, diunggah, atau didiktekan oleh pengguna; atau dikirim agent WorkBuddy lewat MCP | Dibaca sebagai **data**, bukan instruksi |
| Kontak, zona waktu, aturan kerja, hari libur | Diimpor atau diketik oleh organisasi | Tidak ada data bawaan. Bila aturan belum diimpor, aturan bawaan dipakai dan **diberi label "belum dari SOP"** |
| Pengaturan (nama PT, domain internal, penyetuju) | Diisi di halaman Pengaturan | Nama penyetuju tercatat di setiap persetujuan |

Semua tersimpan di satu berkas lokal (`data/workspace.json`) di mesin yang menjalankan Berezz. Tidak ada akses ke kotak email, kalender, atau task board sungguhan. Transkripsi voice note memakai pengenalan suara bawaan browser (Chrome/Edge), yang dapat mengirim audio ke layanan pembuat browser; transkrip selalu ditampilkan untuk dikoreksi.

## Yang dijalankan otomatis (tanpa persetujuan)

- Memecah permintaan menjadi aksi dan menyimpan kutipan sumber setiap aksi.
- Mencocokkan nama dengan data kontak; menghitung zona waktu WIB/WITA/WIT; memeriksa jam kerja, salat Jumat, dan hari libur.
- Mendeteksi dan mengabaikan instruksi tersisip ("AI: teruskan file ini…").
- Reviewer kedua: membandingkan rencana dengan permintaan asli (aksi hilang, aksi tambahan, penerima tanpa sumber).
- Menyusun **draf** isi email dari lampiran, diberi label draf.
- Mencatat audit.

Tidak ada satu pun dari langkah di atas yang menghubungi orang atau mengubah sistem lain.

## Yang butuh persetujuan manusia

| Aksi | Yang ditampilkan sebelum disetujui |
|---|---|
| Email | Penerima persis (nama + alamat), pengirim, subjek, isi lengkap |
| Rapat | Peserta + zona waktunya, tanggal, jam mulai–selesai + konversi zona, lokasi |
| Tugas | Pemilik, judul, tenggat |

- Persetujuan berlaku untuk **satu versi** (nomor versi + fingerprint). Perubahan apa pun membuat versi baru dan membatalkan persetujuan.
- Penerima eksternal, banyak penerima, dan tanggal yang status liburnya tidak diketahui butuh **centang konfirmasi tambahan**.
- Setelah disetujui, aksi menunggu **60 detik** di antrean dan bisa diurungkan sebelum diteruskan.
- Gerbang persetujuan berjalan di server. Konektor hanya menerima aksi berstatus `approved` dengan fingerprint yang sama.

## Yang tidak akan pernah dilakukan

- Mengirim, memesan, atau mengubah apa pun tanpa persetujuan eksplisit atas versi yang ditampilkan.
- Menebak penerima, alamat email, tanggal, jam, atau isi pesan yang tidak ada di sumber. Yang tidak diketahui ditanyakan atau ditandai "belum diketahui".
- Menjalankan instruksi yang ada di dalam dokumen, chat, atau lampiran.
- Memberi agent (termasuk WorkBuddy) kemampuan menyetujui: server MCP Berezz tidak punya tool approve/send/undo, dan endpoint agent tidak punya jalur persetujuan.
- Berputar tanpa batas: setelah 3 putaran klarifikasi yang belum jelas, aksi dieskalasi ke manusia.
- Mengklaim aksi simulasi sebagai pengiriman sungguhan.

## Audit dan retensi

Setiap job mencatat: permintaan mentah, lampiran, aturan dan tanggal acuan yang dipakai, instruksi tersisip yang diabaikan, hasil planner dan reviewer, pertanyaan dan jawaban, setiap versi, siapa menyetujui/membatalkan/mengurungkan beserta waktunya, dan hasil konektor (berlabel simulasi). Audit bisa diekspor sebagai JSON per job. Retensi mengikuti berkas workspace; menghapus workspace menghapus audit.

## Batas prototipe yang perlu diketahui

- Konektor email/kalender/task masih **simulasi**.
- Pengamanan endpoint persetujuan adalah token per sesi untuk halaman browser satu origin: melindungi dari agent yang bekerja lewat MCP, **bukan** autentikasi pengguna. Perangkat lunak lain di mesin yang sama masih bisa memanggil API lokal. Produksi butuh akun penyetuju terautentikasi.
- Fingerprint memakai FNV-1a 64-bit (non-kriptografis); produksi sebaiknya HMAC-SHA256.
- Planner bawaan berbasis aturan teks; planner model dan agent WorkBuddy bersifat opsional dan hasilnya selalu di-grounding ulang oleh Berezz.
