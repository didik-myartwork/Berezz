# Teks submission — Berezz

> Bagian bertanda **[ISI]** wajib diisi tim sendiri: hanya tim yang tahu persis bagaimana WorkBuddy dipakai. Jangan mengklaim yang tidak terjadi; handbook memberi penalti lebih berat untuk kegagalan yang disembunyikan.

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

**Business value.** Hasil terukur dari 20 test case buatan tim (`docs/test-results.md`, 1 November 2026): **20 dari 20 lulus**. Dari 32 aksi yang direncanakan, 15 langsung ditahan untuk klarifikasi karena detailnya ambigu atau tidak ada di data; 2 instruksi tersisip diabaikan; 17 percobaan menyetujui atau mengirim yang tidak sah ditolak gerbang; hanya 6 aksi yang mencapai konektor simulasi, semuanya setelah persetujuan atas versi yang sama. Waktu dari pesan masuk sampai rencana siap ditinjau: median 1 ms, maksimum 45 ms (planner aturan, tanpa model). Nilai bisnisnya: admin tidak lagi menyalin detail ke beberapa aplikasi, dan kesalahan penerima/jam/instruksi tersisip ditangkap sebelum terjadi. Penghematan waktu dibanding proses manual belum diukur dengan pengguna nyata; [ISI bila sudah diuji dengan admin sungguhan].

## Accountability sheet
Lihat `docs/accountability-sheet.md` (1 halaman).

## Test results
Lihat `docs/test-results.md` dan folder `screenshots/`. Test case dan dataset dibuat tim karena dataset resmi panitia belum diterima; ganti dengan test resmi bila tersedia.

## Architecture diagram
`docs/architecture.png` (sumber: `docs/architecture.html`, penjelasan: `docs/architecture.md`).

## Product sharing — di mana WorkBuddy memberi nilai
- **Di produk:** WorkBuddy adalah agent yang menerima pesan kerja dan mengusulkan rencana ke Berezz lewat MCP; skill reviewer WorkBuddy memberi pendapat kedua. Berezz memastikan agent tidak bisa menyetujui atau mengirim apa pun.
- **Dalam proses build:** [ISI — bagian mana yang dibuat/dibantu di WorkBuddy, contoh prompt yang dipakai, screenshot bukti].
- **Yang efektif:** [ISI].
- **Keterbatasan yang ditemukan:** [ISI, mis. format konfigurasi MCP/skill yang perlu dicoba-coba].
- **Pelajaran:** agent paling berguna ketika diberi wewenang mengusulkan, bukan memutuskan; batas itu harus ditegakkan oleh kode, bukan oleh prompt.

## Source code
[ISI — URL repo publik]. Pastikan `data/` tidak ikut (sudah di-*gitignore*) dan tidak ada kunci API di repo.

## Demo video
Ikuti `docs/demo-script.md` (target 6 menit).

## Cover image (opsional)
`docs/cover.png` (16:9, 1520×864 = 4× dari 380×216).
