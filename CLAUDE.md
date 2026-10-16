
## Design System
Read DESIGN.md before making any copy or CLI-output change.
One rule is binding and gateable, not stylistic:
  - An LLM judgement may never render as proof; green is reserved for re-executed,
    machine-checkable evidence (DESIGN.md §1).
The web UI sections of DESIGN.md and their gates are not in this tree.
Do not deviate without the owner's approval, and update DESIGN.md in the same change.
In QA and review, flag any code that does not match DESIGN.md.

## Every turn (owner, 2026-10-09)
Answer the question first, in one sentence. Then:
- **Workflow:** the IDs (W0 to W10, `agent/CLAUDE.md` § Workflows by goal) we are running, and why. Say it before the first tool call when executing, planning or deciding.
- **Happened:** what changed since the last turn, with evidence (run id, file, number). If nothing ran, say so.
- **Ongoing:** what is running or waiting, and on whom.
- **Next:** what I do next. Decisions for the owner go under **Your call**, at most 3.

Plain words, no apology, never report green that wasn't observed. A UserPromptSubmit hook (`agent/scripts/turn-report-reminder.mjs`, registered in `.claude/settings.json`, which is gitignored and local) re-injects this each turn. A fresh clone has the rule but not the hook.
