# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript compiled to browser ES modules, served by a small local Node server (`server.mjs`) that stores the workspace and runs the approval gate. WorkBuddy connects through an MCP server (`mcp/berezz-mcp.mjs`) and two skills. An optional planner calls an OpenAI-compatible model.

## Users

Office admins, operations staff and small-business owners who receive multi-part work requests in chat, meeting notes or voice notes and must turn them into emails, meetings and tasks.

## Product Purpose

Berezz turns one unstructured request into separate actions, grounds every recipient, date and time in the source and the organisation's own data, asks when something is ambiguous, and holds every action until a person approves the exact version. Approved actions wait 60 seconds in an undoable queue before reaching a connector. Everything is audited.

## Positioning

Agents propose; a deterministic gate on the server decides what may reach a connector, and only after a human approval of the same version. Connectors are simulated in this prototype.

## Operating Context

Tencent Cloud AI CAN DO IT Indonesia Hackathon 2026, Challenge B "The Office Agent", scenario meeting-to-action. The app ships with no data: organisations import contacts (with WIB/WITA/WIT), operating rules and holidays, and set their name in Settings. A fictional test organisation lives in `datasets/organisasi-uji/` for tests and demos only.

## Capabilities and Constraints

- Structured plan with source quotes; concise clarification (max 3 rounds, then escalation); office hours, Friday prayer and holidays checked in every participant's local zone; exact-detail approval with version + fingerprint; extra confirmation for external, multi-recipient and unknown-holiday cases; embedded instructions treated as data; second reviewer pass; 60-second undo; audit export.
- Corrupt or unsupported workspace files now fail closed without overwrite. Failed saves return an error and block further mutations until restart.
- This is a local single-operator prototype; the workspace JSON is plaintext and is not suitable for shared production use with confidential data.
- Never guess a recipient, address, date, time or message body.
- Never give an agent an approval or send capability.

## Product Principles

- Ask a person before any action leaves the plan.
- Keep the source of every detail visible.
- Treat attached or quoted instructions as untrusted data.
- Say "unknown" instead of guessing.
- Keep simulated and real behaviour clearly distinguished.

## Accessibility & Inclusion

Indonesian UI accepting Indonesian and English input; keyboard operable with visible focus; labelled controls; status never conveyed by color alone; works at phone width; light default with a dark theme.
