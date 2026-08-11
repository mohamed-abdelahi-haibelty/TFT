# Commit Conventions

## When to Commit

- One commit per completed task file, after all "Done when" checks pass.
- If a task needed a mid-task checkpoint (rare), squash before finishing so history stays one-commit-per-task.
- Never commit with a failing build or failing tests.

## Format (Conventional Commits)

```
<type>(<scope>): <summary>  [task NN]
```

- `type`: `feat` | `fix` | `refactor` | `chore` | `test` | `docs`
- `scope`: `store` | `admin` | `pos` | `orders` | `stock` | `db` | `auth` | `infra`
- Summary: imperative, lowercase, ≤ 72 chars, no period.
- Always end with the task number.

Body (optional, only when non-obvious): 1–3 lines on what changed behaviorally. No file lists, no restating the diff.

## Examples

```
feat(db): add full schema and seed with admin user  [task 02]
feat(orders): public order creation with whatsapp handoff  [task 11]
fix(stock): restore component stock when bundle order is cancelled  [task 13]
```

## Rules

- Never mention AI, Claude, or code generation in messages.
- `chore(db): migration` commits are allowed only alongside the feature that needed them — schema never changes in isolation.
- Do not commit `.env*` files (only `.env.example`).
