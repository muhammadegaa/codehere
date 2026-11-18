# Codex review, round 1 (launch bar L13)

- Date: 18 Nov 2026
- Command: `codex review --base main` in `~/code/codehere-audit`, branch `fix/2.1.0-rc.3` at 3cf9b7f (72 commits since main, the whole 2.1.0 diff)
- Reviewer: Codex CLI on its default model, default review instructions (`--base` takes no custom prompt)

## Findings

| # | Codex priority | File | Finding | Our rating | Outcome |
|---|---|---|---|---|---|
| 1 | P2 | `v2/src/hooks.js:243` | `readProtected` follows a committed symlink at `.github/hooks/` and reads `*.json` files outside the repo; suggests representing the link by its target without listing it | Not a defect | Kept as is, pinned by two e2e checks |

## Why finding 1 is kept

- Copilot loads hooks through that folder, link or not. If Codehere stood for the folder by its link target, an agent could edit the hooks Copilot runs through the link and the finish check would not see it.
- Checked, not argued: with Codex's suggested change applied, the new e2e check "an edit through a linked .github/hooks/ folder is still caught" fails (563 passed, 1 failed). On the current code it passes (564 passed, 0 failed).
- What 256e485 promised was that no committed link can hang a hook. Reads through the folder stay bounded: each file is opened without following a final link, without blocking, checked as a plain file, and read up to 8 MB. The second new check runs session start and the finish check with `/dev/zero` and a FIFO inside the linked folder, under a 10 s timeout: neither hangs.
- Only a sha256 of what is read is kept in session state, so nothing from outside the repo is written anywhere.

Blocker: 0. Major: 0. L13 needs a second round in a row with none.
