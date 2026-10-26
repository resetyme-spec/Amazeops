# AmazeFab Marketplace V1 — Project Root

## Structure

```
E:\Amaze opsv1\
 ├── brain\BRAIN.md ← THE BRAIN — single source of truth (read first!)
 ├── mindmap\index.html ← Visual brain map (open in browser)
 ├── docs\ ← Specifications, ADRs, notes
 ├── prisma\schema.prisma ← Database schema (14 models, 13 enums)
 ├── src\backend\
 │ ├── db\prisma.ts ← Prisma client
 │ └── services\ ← 8 service files (all built)
 ├── package.json ← Node.js + Express + Prisma
 └── tsconfig.json
```

## Brain System Rules

1. **Always read `brain/BRAIN.md` first** — it has the full spec + actual code state + decisions + issues
2. **After any change**, update the brain: progress tables, change log, open questions, known issues
3. **The mind map** (`mindmap/index.html`) is auto-generated from the brain — open it to see visual flow

## Status

| Layer | Status |
|---|---|
| Database Schema | ✅ Complete |
| Service Layer (8 services) | ✅ Built |
| Server + Routes | ❌ Missing (BLOCKER) |
| Frontend (3 platforms) | ❌ Not started |
| Invoice/Payment | ❌ Schema only |

## Quick Start

```bash
cd "E:\Amaze opsv1"
npm install
npx prisma generate
npx prisma db push
```

## Tech Stack

- **Backend:** Node.js + TypeScript + Express
- **ORM:** Prisma (SQLite dev, PostgreSQL prod)
- **Auth:** JWT (planned)
- **Mobile:** To be decided
- **Admin Web:** To be decided
