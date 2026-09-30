---
title: "electron-store ESM upgrade risk in desktop main"
type: warning
tags: [dependencies, electron, electron-store]
status: inbox
confidence: 0.50
source:
  kind: "agent"
  agentRole: "dev"
  engine: "antigravity"
  session: "dac1b6dc-6d55-4b79-9842-7f56d543c636"
  thread: "dac1b6dc-6d55-4b79-9842-7f56d543c636"
  commit: "4457686"
created: 2026-09-30T11:49:21.817454200+00:00
updated: 2026-09-30T11:49:21.817454200+00:00
---

desktop main tsconfig uses CommonJS. electron-store v9+ is pure ESM. Do not upgrade electron-store beyond v8.2.0 without migrating main to ESM or using dynamic import.
