# Codehere

**A team brain for vibe coders.** It stops your AI coding agent from going in circles, checks "done" for real, and shares what your team learns. It works through plain files in git.

Codehere is built to remove work, not add it. You keep using Claude Code, Codex CLI or Copilot CLI as usual. Codehere talks to the agent, not to you, and stays silent unless it helps.

## What it does

| Without Codehere, you… | With Codehere |
|---|---|
| Re-explain your team's rules every session | Team rules load into every session automatically |
| Type "still broken" and the agent guesses what you mean | Codehere adds the last error, the failing test and the files changed to your short message |
| Ask for a whole app with no way to check it | The agent asks you one question first: "How will you know it works?" Your answer becomes a test |
| Watch the agent try the same failing fix again and again | After the same error 3 times, the agent is told to stop and find the root cause first |
| Trust "Done!" and find it broken later | Codehere runs your tests itself. If they fail, the agent goes back to work. |
| Miss that a test was skipped or deleted to make it "pass" | The agent is blocked and asked to restore it |
| Lose a long, messy session and start over from scratch | When a long session keeps hitting the same error, the agent suggests `codehere brief`: one clean spec that the next session loads |
| Write a long message to ask a friend for help | `codehere help` writes a redacted help card for you |
| Solve a bug that a teammate already solved last week | Their fix reaches your agent the first time the error appears |

## Install (2 minutes)

```bash
npm install -g codehere
cd your-project
codehere init --agent claude,codex,copilot   # finds your test command, adds the hooks, asks you to approve the command
git add .codehere .claude/settings.json .codex/hooks.json .github/hooks/codehere.json .gitignore
git commit -m "Add Codehere" && git push
```

Name only the agents your team uses, such as `--agent claude` or `--agent codex,copilot`; with no `--agent`, `init` sets up Claude Code. The hooks go in `.claude/settings.json`, `.codex/hooks.json` and `.github/hooks/codehere.json`.

Each teammate installs the CLI once (`npm install -g codehere`) and runs `codehere approve` once in the repo. Until they do, their agent tells them at session start that the test check is off. The hooks and the brain arrive through git.

Codex runs a repo's hooks only after each developer trusts them. Open Codex in the repo, trust the project if asked, then type `/hooks` and trust the four Codehere hooks. Do it once per clone, and again after an update that changes the hooks. Until then Codex skips them, and `codex exec` does not warn.

Copilot runs a repo's hooks only in a folder you trust: answer yes when Copilot asks on its first start in the repo. Copilot also runs the hooks in `.claude/settings.json`. Where `.github/hooks/codehere.json` runs Codehere, those stay quiet, so nothing runs twice; without it, they give Copilot the same checks.

`codehere uninstall` removes the hooks, and `.codehere/` too when it holds no rules, lessons, help cards or briefs.

The test command is in `.codehere/config.json`, which anyone with push access can change. So Codehere runs it only after you approve that exact command on your machine, at your terminal. If a pull or the agent changes it, the finish check skips it and tells you, until you approve it again. Approvals are kept in `~/.config/codehere/approvals.json`, outside the repo, so nothing that arrives through git can approve a command.

## The team loop

```bash
codehere rule "Prices are in cents. Never use floats for money."   # every agent follows it

# stuck?
codehere help "Cart total ignores quantity"   # writes .codehere/help/<id>.md (redacted)
git add .codehere && git commit -m "help: cart" && git push

# teammate, after git pull (their agent also mentions it at session start)
codehere inbox
codehere reply <id> "Use price * qty; same bug was in checkout.js" --solved
git add .codehere && git commit -m "answer" && git push
```

`--solved` turns the answer into a **team lesson**. From then on, any teammate's agent that hits a similar error gets that fix automatically. When an agent solves a repeated error by itself, Codehere saves a lesson with the proof from that test run (command, exit code, commit, the files the fix changed) and asks the agent to fill in the cause and the fix.

You see one line per event:

```
codehere › Ana's lesson given to the agent · verified on Ana's machine · 21 Oct
codehere ✕ npm test · 2 failed · agent sent back · 1 of 3
codehere ✓ npm test · 48 passed · re-run here · 6.2 s
```

✓ marks only a test run Codehere just made on your machine. A teammate's "verified" is plain text: it was true on their machine, and anyone with push access can edit a lesson file. The agent is told whether the files the fix changed have changed since.

Don't want to commit help cards? Copy the printed text into WhatsApp, Discord or Slack instead.

## Which agents

| | Claude Code | Codex CLI | Copilot CLI |
|---|---|---|---|
| Team rules at session start | yes | yes | yes |
| A teammate's lesson after a failed command | yes | yes | yes |
| "Same error 3 times: stop and find the root cause" | yes | yes, given next to the error output | yes, given next to the error output |
| Context added to a short prompt such as "still broken" | yes | yes | no: by Copilot's docs it drops a prompt hook's output |
| Finish check: your tests re-run, the agent sent back | yes | yes | yes |
| Your one line (✓ ✕ ⊘ ›) | yes | in the interactive screen, as `↳ Hook · codehere ✓ …`; not in `codex exec` | no; when the agent is sent back, you see the full reason as the next prompt |
| Restart-brief suggestion in long sessions | yes | no | no |
| Before it works | nothing | each developer trusts the hooks in `/hooks` | each developer trusts the folder when Copilot asks |
| MCP tools, instruction file | no | no | no |
| Tested on | 2.1.311 with haiku: [result](docs/conformance/2026-10-27-claude-2.1.311-haiku.md) | 0.164.0 with a local model (Qwen 3.5 9B through Ollama): [result](docs/conformance/2026-10-27-codex-0.164.0-qwen3.5-9b-q4-K-M.md) | 1.0.105 with a local model (Qwen 3.5 9B through Ollama): [result](docs/conformance/2026-10-29-copilot-1.0.105-qwen3.5-9b-q4-K-M.md), with only the Claude Code hooks installed: [result](docs/conformance/2026-10-29-copilot-1.0.105-qwen3.5-9b-q4-K-M-claude-hooks-only.md), and with a GitHub-hosted model (`auto`, which picked gpt-6-luna): [result](docs/conformance/2026-10-29-copilot-1.0.105-auto.md) |

The rows for rules, lessons and the finish check are checked on the real agent by `node scripts/conformance.mjs`. The other rows are checked by `npm test` on hook inputs recorded from each agent.

## Commands

```
codehere init [--agent claude,codex,copilot] [--test "npm test"]
                                        set up (safe to run again)
codehere approve                        let the finish check run the test command on this machine
codehere uninstall                      remove Codehere from this repo (asks first)
codehere rule ["text"]                  add or list team rules
codehere lesson ["problem" --fix "..."] add or list lessons
codehere brief [--gemma]                restart brief for a fresh session
codehere help ["question"] [--gemma]    help card for a teammate
codehere inbox [--all]                  teammates' help cards
codehere show <id>                      read a help card
codehere reply <id> "answer" [--solved] answer; --solved makes a lesson
codehere status                         what Codehere has seen
codehere stats                          turns to green, loops stopped, context size
```

## What lives where

```
.codehere/
  rules.md        team rules (written by people)
  lessons/        solved errors, one markdown file each
  help/           help cards
  briefs/         restart briefs
  config.json     test command, loop threshold
  local/          this machine only, git-ignored (session state)
```

Everything is plain markdown, so you can read, edit, review and delete it like any other file.

## Design rules (from the research)

- **No AI in the decision path.** Loops, failed tests and tampering are detected with plain rules, so Codehere doesn't inherit the agent's mistakes.
- **It talks to the agent, not to you.** If Codehere is wrong, the agent does one extra check. You lose nothing.
- **Silent on normal turns.** Your prompt gets extra context only after a failure, for a feature with no way to check it, or in a long session stuck on one error. Each at most once, under 300 tokens.
- **It only reacts to this session's work.** Changes you had before the session are ignored. If the agent changed nothing, Codehere does nothing.
- **It never traps the agent.** At most 3 "not done yet" messages per session, then it lets go.
- **It fails open.** If anything breaks, the hook exits quietly and the agent carries on.
- **Small model, small job.** Gemma 4 (via Ollama) is optional and only writes summaries for briefs and help cards, which you read before using. Turn it on with `--gemma`.
- **Only human-confirmed context at session start.** Rules are written by people. Lessons appear only when a matching error shows up, because auto-generated context files can make agents worse.

## Try the demo (no Claude account needed)

```bash
node demo/demo.mjs          # two teammates, one repo, the whole loop
node demo/demo.mjs --step   # press Enter between scenes (good for a live talk)
npm test                    # end-to-end checks
```

## Known limits

- Claude Code, Codex CLI and Copilot CLI. OpenCode is next. Copilot in VS Code reads the same hook files but has not been checked, and Copilot's cloud agent is not supported. See [Which agents](#which-agents) for what works on each.
- Lessons match by error text. When both the failure and the lesson name a failing test, the names must be the same, so a lesson for a failed `assert.equal` reaches only a failing test with the same name. Two tests with the same name in different files or suites still share lessons. A generic error outside a test can bring up a lesson that doesn't fit, which is why the agent gets it as reference, not as an instruction.
- Redaction catches common keys, tokens and emails. Always read a help card before sharing it.
- The "done" check needs a test command. Without one, only the tampering check runs.
- Approvals are per folder. Each git worktree or extra clone needs its own `codehere approve`.
- In `codex exec`, Codex shows you none of Codehere's lines. The agent still gets every message, and the finish check still sends it back.
- Copilot shows you none of Codehere's lines either, so on Copilot you do not see the ✓, the ⊘, or the notes about an approval, an uninstall or a settings change during a session. The agent still gets every message, and when the finish check sends it back you see the reason as the next prompt.
- Copilot's cloud agent also runs the committed `.github/hooks/codehere.json`. `codehere` is not installed there, so by GitHub's docs each hook fails and the job carries on without Codehere.
- `codehere approve` and `codehere uninstall` ask only in your own terminal. They refuse when Claude Code, Codex or Copilot is among the processes above them, and inside Codex's sandbox. An agent that detaches its terminal on purpose can still answer, so the finish check of a session that was open tells you when an approval or an uninstall happened (not on Copilot, which shows none of these lines).
- Approving `npm test` approves that command, not the scripts behind it in `package.json`. And Claude Code runs any hook a teammate adds to the committed `.claude/settings.json`, as Copilot does in a trusted folder for `.github/hooks/` and `.claude/settings.json`; Codex asks each developer to trust a new or changed hook first. Both are your repo's code, with the same trust as running it yourself.
- When the agent changes `.codehere/config.json`, `.codehere/rules.md`, the hook and env settings in `.claude/settings*.json` or `.github/copilot/settings*.json`, or `.codex/hooks.json`, `.codex/config.toml` or `.github/hooks/codehere.json` during a session, the finish check tells you. It cannot tell you if the session ends without a finish check, for example when you close it mid-turn. An agent that sets out to fake your terminal or rewrite Codehere's local files can also get around this.
- Only the test command needs approval. A teammate who sets `verifyOnStop` to `false` in `.codehere/config.json` turns the finish check off for everyone; `codehere status` shows it as off.
- Sharing is through git. There is no server, so teammates see updates after `git pull`.
- Prompt checks are plain word lists (English and Indonesian). They can miss a short prompt in another language.
- The weakened-test scan catches skipped tests, deleted test files and removed assertions. It does not yet catch an edited expected value; see `docs/overlap-with-check.md`.

MIT licensed.
