# Codehere

**A team brain for vibe coders.** It stops your AI coding agent from going in circles, checks "done" for real, and shares what your team learns. It works through plain files in git.

Codehere is built to remove work, not add it. You keep using Claude Code as usual. Codehere talks to the agent, not to you, and stays silent unless it helps.

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
npm install -g codehere     # or, from this folder: npm link
cd your-project
codehere init               # finds your test command, adds hooks to .claude/settings.json
git add .codehere .claude/settings.json .gitignore
git commit -m "Add Codehere" && git push
```

Each teammate installs the CLI once (`npm install -g codehere`). The hooks and the brain arrive through git.

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

`--solved` turns the answer into a **team lesson**. From then on, any teammate's agent that hits a similar error gets that fix automatically. When an agent solves a repeated error by itself, Codehere asks it to write a short lesson too.

Don't want to commit help cards? Copy the printed text into WhatsApp, Discord or Slack instead.

## Commands

```
codehere init [--test "npm test"]       set up (safe to run again)
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
  local/          this machine only, git-ignored
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

## Known limits (2.0.0, not released yet)

- Claude Code only for now. Gemini CLI and Codex hooks are next.
- Lessons match by error text. Very generic errors can bring up a lesson that doesn't fit, which is why the agent is told it "may apply".
- Redaction catches common keys, tokens and emails. Always read a help card before sharing it.
- The "done" check needs a test command. Without one, only the tampering check runs.
- Sharing is through git. There is no server, so teammates see updates after `git pull`.
- Prompt checks are plain word lists (English and Indonesian). They can miss a short prompt in another language.
- The weakened-test scan catches skipped tests, deleted test files and removed assertions. It does not yet catch an edited expected value; see `docs/overlap-with-check.md`.

MIT licensed.
