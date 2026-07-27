# Project-local kanban contracts

Drop a file with the same name as one in `~/.claude/commands/_kanban/` here to
override it for this repo only. Fixer/Reviewer/Patcher prompts source clauses
with `repo → global` precedence (see `/kanban-fix` "Shared paste-in clauses").

Files the orchestrator looks for:

- research-clause.md
- tdd-contract.md
- no-shortcuts.md
- ci-clean.md
- worktree-rules.md
- false-positive-patterns.md
- validator-prompt.md

If a file is absent here, the global default is used. There is no merge — the
override is a full replacement.
