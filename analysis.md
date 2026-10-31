# Codebase Analysis — Exam Studio

## Overview
- **Root:** `F:\projects\exam-studio\exam-studio`
- **Type:** Monorepo with apps, server, client, shared, electron, cli, scripts
- **Git:** Present
- **Key files:** package.json, README.md, UPGRADE_PLAN.md, PROGRESS.md, BUGFIXES.md
- **Version:** 0.2.1
- **Description:** "Turn course notes into study handouts, notes, flashcards and exams."

## Top-level structure
- `apps/` — likely web app(s)
- `server/` — backend (Node/Express?)
- `client/` — frontend (React/Vite?)
- `shared/` — shared code/types
- `electron/` — desktop wrapper
- `cli/` — CLI tools
- `scripts/` — build/dev scripts
- `deploy/`, `build/`, `release/` — artifacts
- `node_modules/` — dependencies
- `reference/`, `notes/`, `skills/` — docs/reference

## package.json scripts
- `dev`: concurrently server + client dev
- `build`: client build only
- `start`: server start
- `desktop`: build + electron
- `test`: server test && client test
- `mcp`: server mcp
- `samples`: server render-samples
- `create-admin`: server create-admin

Next: inspect README, UPGRADE_PLAN, PROGRESS, BUGFIXES, and subdirectories.