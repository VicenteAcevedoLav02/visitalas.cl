# Kickoff prompt (paste into Cursor Agent)

Use this when starting work in the visitalas.cl repo:

---

We are scoping a POC SaaS tool for real-estate agents, shown as a portfolio project from vincente.cl (linked from placeholder/visitalas).

**Product idea (full vision, for context only):** a landing page + tooling + portfolio + metrics generator that agents can use for their own practice.

**What to build now:** only the **tool frontend and tool backend**. Nothing else.

**Architecture to set up / follow:**
- pnpm + Turborepo monorepo (`apps/`, `packages/`)
- React + TypeScript (strict) + Vite for the tool UI
- Redux Toolkit for client state
- TypeScript Node backend for the tool API
- Shared styling/components in packages when needed (CSS Modules / plain CSS)
- Mock/stub data is fine — no real MLS, payments, or production auth

**Hard constraints:**
- POC only — no deploy/hosting/CI work
- No serious irreversible product decisions
- No tests unless I ask
- Keep it portfolio-demo quality: clear UX for one agent workflow, not a full multi-tenant SaaS

Start by scaffolding the monorepo and a minimal tool shell (frontend + backend) so we can iterate on features next. Follow `.cursor/rules/project.mdc`.