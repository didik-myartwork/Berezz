# Draft pengisian formulir submission Berezz

Status: **draft lokal, belum dikirim**. Nama **PT Artavista** adalah data dummy untuk mengisi/latihan, bukan klaim bahwa perusahaan tersebut adalah peserta atau pemilik proyek.

Tautan submission resmi dari halaman Tencent Cloud mengarah ke shortlink `tinyurl.com/IDHackathon2026`. Saat dibuka, browser hanya menampilkan pemeriksaan keamanan Cloudflare; kolom formulir dan persyaratan unggahan persisnya belum terlihat. Draft ini memakai materi submission Berezz yang sudah disiapkan dan perlu dipetakan ke kolom formulir setelah halaman dapat dibuka.

## Identitas

| Kolom | Isian draft |
|---|---|
| Nama tim / organisasi | PT Artavista *(dummy; ganti atau konfirmasi sebelum pengiriman resmi)* |
| Nama ketua | Belum diisi — gunakan nama peserta sebenarnya |
| Email ketua | Belum diisi — gunakan email peserta sebenarnya |
| Anggota tim | Belum diisi — masukkan hanya anggota yang benar-benar ikut |

## Proyek

**Judul:** Berezz — Chat-to-Action Copilot

**Challenge:** Challenge B — The Office Agent

**Blurb:** Chat berantakan jadi aksi kantor, setelah Anda setujui.

**Deskripsi:**

Berezz membantu admin, staf operasional, sekretaris, dan pemilik usaha kecil yang menerima banyak permintaan kerja dalam satu chat, notulen, atau voice note. Berezz memecah permintaan itu menjadi aksi email, rapat, dan tugas; menanyakan hal yang ambigu; memeriksa jam kerja WIB/WITA/WIT, salat Jumat, dan hari libur; lalu menunggu persetujuan manusia atas detail persis sebelum apa pun diteruskan.

Permintaan kantor sering datang tidak rapi. Ada nama yang sama, tim lintas zona waktu, aturan operasional lokal, dan instruksi terselip di dokumen terusan. Berezz memisahkan pekerjaan mesin (memecah permintaan, mencocokkan kontak, memeriksa aturan, menyusun draf) dari keputusan manusia (siapa, kapan, isi akhir, dan persetujuan untuk melanjutkan).

Berezz menyediakan satu kotak masuk job dengan status jawaban, persetujuan, antrean, dan jejak audit. Data kontak, aturan SOP, serta kalender libur diimpor oleh organisasi; produk tidak membawa data organisasi contoh. Engine TypeScript deterministik meng-grounding ulang rencana, memeriksa sumber dan penerima, meminta klarifikasi (maksimal tiga putaran lalu eskalasi), menjalankan reviewer kedua, dan mengunci persetujuan pada versi serta fingerprint yang sama. Setelah disetujui, aksi masuk antrean simulasi selama 60 detik dan masih dapat diurungkan.

WorkBuddy terhubung melalui server MCP Berezz dan dua skill: Planner mengusulkan job, Reviewer memberi pemeriksaan kedua. WorkBuddy tidak mempunyai tool untuk menyetujui, mengirim, atau mengurungkan. Konektor email, kalender, dan task board pada prototipe ini masih simulasi.

Pada 20 kasus uji buatan tim, semua lulus: 32 aksi, 15 klarifikasi, dua instruksi tersisip diabaikan, dan 17 percobaan aksi tak sah ditolak gerbang. Enam aksi simulasi hanya mencapai konektor setelah persetujuan untuk versi yang sama. Ini hasil fixture buatan tim, bukan estimasi produksi; data resmi panitia dan pengukuran penghematan waktu nyata belum tersedia.

## Tautan dan bukti

| Kolom | Isian draft |
|---|---|
| Source code | https://github.com/didik-myartwork/Berezz |
| Demo aplikasi | Belum di-host publik; `http://localhost:8787` hanya berjalan di komputer pengembang dan tidak dapat dibuka juri |
| Video demo | Belum tersedia; rekam sesuai `docs/demo-script.md` lalu tempel tautannya |
| Bukti WorkBuddy | Screenshot koneksi WorkBuddy masih perlu ditambahkan sesuai `workbuddy/README.md` |
| Hasil uji | `docs/test-results.md` dan folder `screenshots/` di repo |
| Diagram arsitektur | `docs/architecture.png` |

Sebelum menyalin ke formulir resmi, cocokkan kolom yang sebenarnya, ganti/konfirmasi nama organisasi dummy, isi identitas peserta yang benar, dan tambahkan tautan demo yang dapat diakses juri.
