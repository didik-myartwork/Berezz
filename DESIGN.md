---
name: Berezz
description: Chat-to-Action Copilot. A calm job inbox where every chat-derived action waits at a visible human gate.
colors:
  canvas: "#fafafa"
  surface: "#ffffff"
  surface-2: "#f5f5f6"
  surface-3: "#ededef"
  line: "#e6e6e9"
  line-strong: "#d4d4d9"
  text: "#111113"
  text-2: "#46464e"
  text-3: "#6b6b74"
  primary: "#18181b"
  primary-hover: "#2e2e33"
  on-primary: "#ffffff"
  accent: "#5b5bd6"
  accent-soft: "#eeeefc"
  accent-line: "#c8c8f3"
  on-accent: "#ffffff"
  selection: "rgba(91, 91, 214, .18)"
  amber: "#a85a06"
  amber-bg: "#fff8ec"
  amber-line: "#f4dcae"
  green: "#157346"
  green-bg: "#eef8f2"
  green-line: "#c4e6d2"
  red: "#c02d28"
  red-bg: "#fef2f2"
  red-line: "#f6cfcd"
  gray: "#63636c"
  gray-bg: "#f3f3f5"
  gray-line: "#e2e2e6"
typography:
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  section:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  body-dense:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  input:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  control:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13.5px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  caption:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  xs: "5px"
  sm: "7px"
  inset: "8px"
  md: "10px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "12px"
  inset: "14px"
  lg: "16px"
  xl: "24px"
  page: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "0 13px"
    height: "34px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
  button-danger-hover:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.red}"
  button-sm:
    padding: "0 10px"
    height: "30px"
  button-icon:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    size: "34px"
  status-pill-amber:
    backgroundColor: "{colors.amber-bg}"
    textColor: "{colors.amber}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px 0 7px"
    height: "24px"
  status-pill-green:
    backgroundColor: "{colors.green-bg}"
    textColor: "{colors.green}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px 0 7px"
    height: "24px"
  status-pill-neutral:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px 0 7px"
    height: "24px"
  status-pill-red:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.red}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px 0 7px"
    height: "24px"
  status-pill-gray:
    backgroundColor: "{colors.gray-bg}"
    textColor: "{colors.gray}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 9px 0 7px"
    height: "24px"
  badge-simulation:
    backgroundColor: "{colors.gray-bg}"
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "28px"
  step-count:
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 5px"
    height: "18px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-2}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "0 9px"
    height: "26px"
  file-chip:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-3}"
    typography: "{typography.caption}"
    rounded: "{rounded.inset}"
    padding: "0 10px 0 8px"
    height: "30px"
  file-chip-selected:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  tag:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.xs}"
    padding: "0 6px"
    height: "20px"
  input-field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  sidebar:
    backgroundColor: "{colors.surface-2}"
    padding: "14px 12px 16px"
    width: "252px"
  nav-step:
    textColor: "{colors.text-3}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "32px"
  nav-step-active:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  topbar:
    backgroundColor: "{colors.canvas}"
    padding: "10px 28px"
    height: "64px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "14px 16px 16px"
  card-foot:
    backgroundColor: "{colors.surface-2}"
    typography: "{typography.caption}"
    padding: "10px 12px 10px 10px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "14px 16px 16px"
    width: "340px"
  nested-block:
    backgroundColor: "{colors.surface-2}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  option-list:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.inset}"
    padding: "11px 12px"
  option-hover:
    backgroundColor: "{colors.accent-soft}"
  callout-warn:
    backgroundColor: "{colors.amber-bg}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  callout-danger:
    backgroundColor: "{colors.red-bg}"
    typography: "{typography.body-dense}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: Berezz

## Overview

**Creative North Star: "The Quiet Gate"**

Berezz is a calm job inbox for an office admin who turns messy chats, meeting notes and voice notes into email, meeting and task actions. The visual system makes one fact legible at a glance: every action is held at a human gate, and the screen says why. Linear/Vercel canon played straight: cool neutral canvas, white working surfaces, a sunken sidebar, 1px hairlines, near-black commit buttons and one iris accent. Light is the default; a dark theme redefines every token (`localStorage` key `berezz-theme`).

Rejected: noisy AI dashboards (gradients, glow, hero metrics) and any layout that shows the agent pipeline as navigation.

## Information architecture

- **The side menu holds objects, never process steps.** Kerja: Kotak masuk, Perlu tindakan saya, Antrean kirim, Riwayat. Saluran masuk: one filter per channel that has jobs. Kontrol: Sumber data, Audit log, Pengaturan. Footer: the "Konektor: simulasi" card and the approver, with the theme toggle.
- **The organisation name** comes from Pengaturan and sits under the brand; an unset name shows in amber as a call to action.
- **Process stages live inside one job** as a non-interactive vertical stepper in the context rail (Diterima, Direncanakan, Divalidasi, Klarifikasi, Persetujuan, Antrean kirim, Selesai).
- **Empty workspace** shows a setup checklist (organisation, contacts, rules and holidays, first job). There is no built-in data.

## Layout

- **Inbox:** list column (320px) grouped by what the person must do — Perlu Anda, Berjalan, Selesai — with two-line rows: status glyph, title, time; requester · channel and a short next-step token ("2 jawab · 1 setujui", "eskalasi", "3/3").
- **Job detail:** compact header (ID, status tag, plan version, one-line title, requester · channel · time · planner) over two columns. Left: actions grouped as Perlu jawaban Anda, Eskalasi ke manusia, Siap disetujui, Di antrean, Selesai. Right rail (≈300px), sections split by hairlines: Permintaan asli (source spans highlighted and labelled A1…, ambiguous names dotted-underlined in amber, injected lines struck through), Keamanan, Progres, Data yang dipakai.
- **Pages** (Antrean, Riwayat, Sumber data, Pengaturan, Job baru) share a 52px white top bar (title, short subtitle, actions) and the same main-plus-rail split where a rail adds context.
- ≤1180px the inbox list stacks above the detail; ≤860px the sidebar becomes a top block with wrapping nav; ≤640px option tags wrap under their label. No horizontal page scroll at 375px.

## Components

- **Action row:** 28px type tile, mono ID, title (button that expands details), status tag or the single next action on the right, then tokens (icon + short value; unknown values in amber). An open question renders inline under the row as a bordered list of radio-style options, one line each, ending with "Belum bisa dipastikan" and, for people, "Tambah kontak baru".
- **Approval dialog:** 560px; header with ID, version tag, "Konektor simulasi"; an envelope of the exact payload; a checklist of required acknowledgements (amber wash) and notes; mono source + fingerprint line; footer: Batalkan aksi (ghost red), Kembali, Setujui vN (disabled until every acknowledgement is ticked).
- **Queue row:** fixed columns (action, recipients, connector, approver, status) with a 44px draining bar, mono countdown and Urungkan.
- **Tags** 20px, 5px radius; tone by meaning: amber = needs a person, iris = ready to approve / agent-proposed, green = done, red = escalated, gray = neutral. Status is never color alone: every tag and glyph carries words or a shape.

## Rules

- **The Iris Means Ready-or-Focus Rule.** Iris marks focus, selection, items ready for the person's approval, and agent proposals. It never fills a primary button.
- **The Simulation Is Stated Rule.** Simulated connectors are named in words ("Konektor simulasi", "Diteruskan (simulasi)") wherever a result appears.
- **The No-Guess Rule.** Unknown values are shown as unknown ("tanggal ?", "zona ?", "Penerima belum ada") in amber, never filled with a plausible default.
- **One primary action per view.** Secondary choices use bordered or ghost buttons.
- Icons are Hugeicons (stroke-rounded) only; type is Geist and Geist Mono, self-hosted.
