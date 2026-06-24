# Seam

A local-first scoping workbench for Forward Deployed Engineers. It walks you through
turning a customer's manual process into a deployable AI automation (an **Assignment**)
using a fixed five-stage methodology plus a four-pillar reliability check, and produces
a shareable Markdown scoping brief.

## Run it

```bash
npm install
npm run dev      # → http://localhost:5173
```

> It is a Vite app — **open it via `npm run dev`**, not by opening `index.html`
> directly. `index.html` references `/src/main.tsx`, which only the dev server can
> transpile; opened as a raw file it renders blank.

```bash
npm run build    # type-check (tsc) + production build to dist/
npm test         # run the logic tests (vitest)
npm run preview  # serve the production build
```

## The methodology it encodes

**Decomposition spine (5 stages):**
1. Map the real process
2. Find the seam — interactive seam-ranker (score candidates 1–5 on Volume / Rule-bound / Low-judgement / Low-blast-radius, weighted, top score suggested)
3. SOP & guardrails
4. Integration methodology — decision aid (API / screen-driven / run-where-it-lives / files) per system
5. Failure modes & eval — offline/online plan + grader chooser (programmatic → reference → llm-judge → human)

**Agent-Reliability 4-pillar check:** Guardrails · Human-in-the-loop · Observability · Eval before scale.

A scope is **Ready to build** only when all five stages have content and all four pillars are done.

## Structure

- `src/types.ts` — domain model · `src/constants.ts` — canonical methodology text + factories
- `src/logic.ts` — scoring, recommendations, readiness (pure) · `src/brief.ts` — Markdown + exec summary
- `src/storage.ts` — localStorage + JSON import/export · `src/sample.ts` — worked sample scope
- `src/components/` — one file per stage, plus stepper and scope list

Local-first: scopes persist to `localStorage`, no backend.
