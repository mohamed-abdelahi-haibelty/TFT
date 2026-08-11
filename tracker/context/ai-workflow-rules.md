# AI Workflow Rules

## Approach

Spec-driven, incremental. Each unit of work is one task file in `tasks/`. When given a task file, implement exactly what it defines — no more. Context files (`project-overview.md`, `architecture.md`, `code-standards.md`, `error-handling.md`) define the system; do not infer or invent behavior beyond them.

Visual design is owned by the impeccable skill. Task specs define functionality only. Never derive design decisions from spec wording.

## Scoping Rules

- One task file at a time, completed end to end before the next.
- Write only the code the task needs. Token-efficient output: no boilerplate, no speculative code, no verbose comments, no restating unchanged code.
- Do not combine unrelated system boundaries in one step.
- If a task turns out to require touching more than its "Scope" section lists, stop and flag it instead of expanding silently.

## Handling Missing Requirements

- Do not invent product behavior.
- If a requirement is ambiguous, ask; record the resolution in the relevant context file before implementing.
- If a requirement is missing, add it to `progress-tracker.md` → Open Questions before continuing.

## Protected Files

Do not modify unless explicitly instructed:

- `components/ui/*` — generated shadcn components
- `src/db/migrations/*` — applied migrations are immutable; schema changes get a new migration
- `context/*` files' invariants — may be updated only to reflect a decision the owner approved

## Keeping Docs in Sync

Update the relevant context file in the same task when implementation changes:

- Architecture, boundaries, or invariants → `architecture.md`
- Conventions → `code-standards.md`
- Error taxonomy → `error-handling.md`
- Scope → `project-overview.md`

## Definition of Done (every task)

1. Every item in the task's "Done when" checklist passes.
2. No invariant in `architecture.md` violated.
3. Only the tests the task asks for were added; all tests pass (`npm test`).
4. `npm run build` passes with zero TypeScript errors.
5. `progress-tracker.md` updated (Completed, Next Up, Session Notes).
6. Code committed following `commit-conventions.md`.
