# Teks submission — Berezz

> Hasil berikut mengikuti bukti di repo per 1 November 2026. Jangan mengklaim hemat waktu nyata: pembandingan dengan admin belum dilakukan.

## Project title
Berezz — Chat-to-Action Copilot

## Short blurb (< 10 kata)
Chat berantakan jadi aksi kantor, setelah Anda setujui.

## Project description

**Project overview.** Challenge B — The Office Agent, skenario *meeting to action*. Pengguna: admin, staf operasional, sekretaris, dan pemilik usaha kecil yang menerima banyak permintaan kerja dalam satu chat, notulen, atau voice note. Berezz memecah permintaan itu menjadi aksi email, rapat, dan tugas; menanyakan hal yang ambigu; memeriksa jam kerja WIB/WITA/WIT, salat Jumat, dan hari libur; lalu menunggu persetujuan manusia atas detail persis sebelum apa pun diteruskan.

**Real-world insight.** Permintaan kantor jarang datang rapi: "tolong kirim notulen ke Pak Budi, jadwalkan follow-up Jumat siang dengan tim Makassar, dan kabari vendor". Organisasi menengah sering punya beberapa orang bernama sama, tim lintas zona waktu, dan aturan tidak tertulis seperti tidak rapat saat salat Jumat. Admin menyalin detail ke beberapa aplikasi; agent yang bertindak sendiri bisa mengirim ke orang yang salah, memesan jam yang salah, atau menjalankan instruksi yang terselip di berkas terusan. Berezz memisahkan yang boleh dikerjakan mesin (memecah, mencocokkan, memeriksa, menyusun draf) dari yang harus diputuskan manusia (siapa, kapan, isi akhir, dan "kirim").

**Solution design.**
- *Bisnis:* satu kotak masuk berisi job. Setiap job menunjukkan apa yang perlu jawaban, apa yang siap disetujui, apa yang di antrean, dan jejak auditnya. Data organisasi (kontak, aturan SOP, kalender libur) diimpor sendiri; Berezz tidak membawa data bawaan.
- *Teknis:* server lokal Node menjadi satu sumber kebenaran dan menjalankan gerbang persetujuan, sehingga browser maupun agent tidak bisa melewatinya. Engine TypeScript deterministik melakukan grounding, validasi, klarifikasi (maks 3 putaran lalu eskalasi), reviewer kedua, gerbang berbasis versi + fingerprint, dan antrean 60 detik yang bisa diurungkan. Konektor masih simulasi.
- *Agent dan prompt:* agent WorkBuddy terhubung lewat server MCP Berezz dengan dua skill (planner dan reviewer). Prompt mewajibkan kutipan sumber verbatim untuk setiap aksi, melarang mengarang penerima/tanggal/isi, dan memperlakukan lampiran sebagai data. Server tidak mempercayai prompt begitu saja: aksi tanpa kutipan ditolak, penerima dan waktu diturunkan ulang dari kutipan dan data organisasi, dan model hanya boleh menyumbang teks draf. MCP tidak punya tool approve/send/undo.

**Business value.** Pada 20 kasus uji buatan tim, semua lulus; tes tersebut mencakup 32 aksi, 15 klarifikasi, 2 instruksi tersisip yang diabaikan, dan 17 percobaan aksi tak sah yang ditolak gerbang. Enam aksi simulasi mencapai konektor hanya setelah persetujuan versi yang sama. Ini adalah hasil fixture, bukan estimasi produksi. Waktu dan penghematan kerja dibanding proses manual belum diukur dengan admin nyata. Rincian dan batas pengujian ada di `docs/test-results.md`.

## Accountability sheet
Lihat `docs/accountability-sheet.md` (1 halaman).

## Test results
Lihat `docs/test-results.md` dan folder `screenshots/`. Test case dan dataset dibuat tim karena dataset resmi panitia belum diterima; ganti dengan test resmi bila tersedia.

## Architecture diagram
`docs/architecture.png` (sumber: `docs/architecture.html`, penjelasan: `docs/architecture.md`).

## Product sharing — di mana WorkBuddy memberi nilai

WorkBuddy terhubung ke server Berezz melalui MCP stdio. Skill Planner mengusulkan job dan Skill Reviewer membaca job untuk mencari aksi yang hilang/ditambahkan. Server Berezz tidak menyediakan tool approve/send/undo untuk agent; persetujuan tetap dilakukan manusia di UI. Integrasi MCP dan prompt/skills tersedia di `workbuddy/` dan `mcp/`. Tes MCP otomatis memakai server tiruan; panduan repo mencatat uji manual ke Berezz lokal. Screenshot koneksi WorkBuddy masih perlu disertakan sebagai bukti submission.

Pelajaran utamanya: WorkBuddy dapat menyusun rencana dan memberi opini kedua, sementara keputusan persetujuan berada di server dan UI Berezz. Model opsional tidak menggantikan grounding, validasi sumber, atau persetujuan. Konektor nyata belum dipasang; semua efek akhir masih simulasi.

## Source code

Source code tersedia di repo lokal Berezz (branch `main`, commit `c42dcc6`). **Belum ada remote atau URL repo publik**, sehingga item ini belum siap dikirim. Saat mempublikasikan, sertakan `src/`, `app/`, `server.mjs`, `mcp/`, `workbuddy/`, tests, dan dokumen; jangan sertakan `data/`, `.env`, kunci API, atau data organisasi nyata.

## Demo video
Ikuti `docs/demo-script.md` (target 6 menit).

## Cover image (opsional)
`docs/cover.png` (16:9, 1520×864 = 4× dari 380×216).
