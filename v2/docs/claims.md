# Claims and the checks behind them

Every sentence Codehere's public pages state as fact, with the check that shows it, and the build it holds for. A claim with no passing check is reworded or removed (launch bar L11). Check names are the e2e checks in `v2/test/e2e.mjs` unless a file is named.

## Pilot page (codehere-landing, branch `pilot-page`, `app/pilot/page.tsx`)

The page tells readers to run `npx codehere@next audit`, so every claim must hold for the build on npm `next`. On 13 Nov that is 2.1.0-rc.2, which does not yet carry the fixes below; the claims hold once a build from `fix/2.1.0-rc.3` is published.

| Claim | Check | Holds for |
|---|---|---|
| The audit reads the last 90 days of git history | "audit: reads the non-merge commits of the last 90 days" | rc.2 and later |
| It lists the commits that deleted a test file, skipped a test or removed assertions | "audit: lists each one, and not the docs change, the rename, the old commit or the base"; "audit: what each commit did, from the finish check's own detector" | rc.2 and later |
| …and which of them carry an agent's marker | "audit: names the marker it read, or says there is none"; "audit: Claude Code's footer counts as an agent marker, as a squash merge keeps it" | footer: rc.3 branch |
| It runs on your machine and sends nothing | "audit: makes no network call" (a preload marks any network call; "no-network preload: a control connection is marked" shows the preload works) | rc.3 branch (the check is new; the code did not change) |
| Example output | labelled "Example output" on the page; its first two lines must match the real format | waits on the L4 wording decision |
| When Claude Code, Codex CLI or Copilot CLI says it is finished, Codehere runs your tests | sections 23 and 25 of e2e (Codex, Copilot) and the Claude Code checks, with recorded hook inputs; live runs on 2.1.0 not done yet (L8) | e2e: rc.2 and later; live: not run |
| If they fail, or a test was skipped, deleted or weakened to make them pass, it sends the agent back | "failing tests block "done""; "tampering blocks "done""; "finish check: an expected value changed to the buggy output sends the agent back, with the line"; `v2/scripts/h2h-codehere-cases.mjs` (7 of 7) | expected values: rc.3 branch |
| Free and open source, MIT | `v2/package.json` "license": "MIT"; `v2/LICENSE` | all |
| Limit: a test deleted together with the feature it tested is listed too | measured: 18 of 24 false entries on 12 repos (`docs/evidence/2026-11-13-audit-precision.md`) | rc.3 branch |
| Limit: a commit with no marker may still be an agent's | markers are optional trailers; not a code behaviour | all |
| Limit: a newer commit behind a back-dated one is not read; a shallow clone says so | "audit: a commit behind a back-dated one is not read, as the limits say"; "audit: a shallow clone says its history is not available, exit 1" | rc.2 and later |
| Limit: the audit does not catch an edited expected value, a single removed assertion, or a return placed above an assertion | "events: a changed expected value is its own kind, so the audit does not count it"; "audit: a changed expected value is not listed"; the removed-assertion count needs two | rc.3 branch |
| The team layer: none of it is built yet | true by the page's own statement; nothing to check | all |

## v2 README (`v2/README.md`)

Mapped so far: the claims tonight's changes touched. The rest of the README is not mapped yet (launch bar L11).

| Claim | Check | Holds for |
|---|---|---|
| `codehere audit` reads git history on your machine and sends nothing | "audit: makes no network call" | rc.3 branch |
| It lists the commits that deleted, skipped, left out or weakened tests (not "every" commit) | the audit checks in e2e section 27; measured: `docs/evidence/2026-11-13-audit-heldout-results.md` | rc.3 branch |
| Agent markers include Claude Code's footer | "audit: Claude Code's footer counts as an agent marker, as a squash merge keeps it" | rc.3 branch |
| The weakened-test scan's list of what it catches | the `scan:` checks for each kind; `v2/scripts/h2h-suite.mjs` (46 cases, `docs/evidence/2026-11-13-case-suite.md`) | rc.3 branch |
| What it does not catch, and 5 of 19 on CheatBench's held-out half | `docs/evidence/2026-11-13-cheatbench.md` | rc.3 branch |
| A git missing from PATH is reported (the design rule "it fails open" still holds: the agent carries on) | "without git: …" checks | rc.3 branch |
| Every command in "Commands" exists, and `--help` lists no command the README leaves out | sweep on 13 Nov: the 13 commands match `codehere --help` | rc.3 branch |
| The 9 relative links (conformance results, docs) point at files that exist | sweep on 13 Nov: 9 of 9 exist | rc.3 branch |
| `node demo/demo.mjs` shows the whole loop, including "done" checked | run on 13 Nov: scene 6 shows the failed run sent back (✕), scene 11 the ✓; before this fix it showed ⊘ "not approved" because the demo never approved the test command | rc.3 branch |

### "What it does" and "Design rules" (mapped 13 Nov against the 552 checks that passed at e593c83)

| Claim | Checks (examples) |
|---|---|
| Team rules load into every session | "(setup) claude: session start carries the team rule"; "Codex, session start: the team rules go in as context"; "Copilot, session start: the team rules go in as JSON additionalContext" (12 in all) |
| "Still broken" gets the last error, the failing test and the files changed | "\"still broken\" after a failure gets the error, failing test and files changed" |
| A feature with no way to check it: "How will you know it works?" | "vague feature with no test: ask \"How will you know it works?\""; "questions and small edits are not vague features" |
| Same error 3 times: stop and find the root cause | "Codex, third repeat: the loop breaker goes in as context…" and the loop checks of section 3 (9 in all) |
| Codehere runs your tests; if they fail, the agent goes back | "failing tests block \"done\""; the finish-check checks for Codex and Copilot (11 in all) |
| A skipped or deleted test is sent back | "tampering blocks \"done\""; "finish check: a weakened test sends the agent back and the person sees one ✕ line"; the 46-case suite |
| A long session stuck on one error: a restart brief | the brief checks (17), e.g. "brief has goal from transcript", "brief redacts emails" |
| A redacted help card | "help card written"; "help card redacts email" (11 in all) |
| A teammate's fix reaches the agent at the first matching error | section 21 and 26 checks, e.g. "Sam sees one line, with no ✓: Ana's lesson, verified on her machine"; "a different failing test does not get the cart lesson" |
| No AI in the decision path | structural: the only model call, `summarize` (Gemma), is in `src/commands.js` for briefs and help cards; `hooks.js`, `signals.js` and `audit.js` call none (checked 13 Nov) |
| Silent on normal turns | "1st error: silent"; "2nd error (different numbers, same signature): silent" |
| Only reacts to this session's work | "changes made before the session do not trigger the test check" |
| Never traps the agent: at most 3 | "after the cap, a failure is still shown and nothing is sent back"; "each send-back shows one line: ✕, …, k of 3" |
| Fails open | "prompt hook fails open on garbage input"; "a malformed draft entry does not stop a later draft from being saved"; without git the finish check shows ⊘ and the agent carries on |
| Gemma optional, local only | the `--gemma` checks (8), e.g. "--gemma: an OLLAMA_HOST off this machine is refused before any request, with a reason" |
| Only human-confirmed context at session start | the draft-and-yes checks (61), e.g. "E2: agent path, rule: no team file changes; one draft of that kind, printed, its id on the last line" |

Not mapped to a check: the "Which agents" table's live rows rest on the linked conformance results from 27 Oct to 3 Nov (2.0.x and 2.1.0-rc.0); no live run on the 2.1.0 branch yet (launch bar L8). The "Known limits" are statements of what is not done; the two tonight's work changed are updated above.

## codehere.uk (codehere-landing, branch `main` at dad0caf, live)

The site tells people to `npm install -g codehere`, which is 2.0.4 (`latest`) on 13 Nov. Its claims must hold for 2.0.4.

| Claim | Check | Holds for |
|---|---|---|
| "How will you know it works?" for a feature with no test; "still broken" gets the error, failing test and files; same error 3 times: stop and name a root cause; Codehere runs your tests, a skipped or deleted test is blocked | the same checks as the README's "What it does" rows above | 2.0.4 and later |
| Plain rules decide; only reacts to this session's changes; silent on normal turns; never blocks the agent more than 3 times; exits quietly if anything breaks | the design-rule checks above | 2.0.4 and later |
| Gemma through Ollama is optional and only writes summaries for briefs and help cards | the `--gemma` checks; the only model call is in `src/commands.js` | 2.0.4 and later |
| Claude Code, Codex CLI and Copilot CLI; on Copilot and in `codex exec` you do not see Codehere's lines | sections 23 and 25 of e2e; conformance results of 27 to 29 Oct | 2.0.x |
| The weakened-test scan "does not yet catch an edited expected value" | true for 2.0.4 | 2.0.4 only: **update when 2.1.0 ships**, which catches it |
| "What happened to codehere check?": still on npm as 1.x | `npm view codehere@1 version`: 1.0.2, 1.0.3 (13 Nov) | now |
| "Does my code leave my machine? No." | "the hooks make no network call…", "audit: makes no network call"; Gemma refused off this machine | rc.3 branch (the checks are new; the code that sends nothing is the same in 2.0.4) |
| Free, open source, no account | MIT license; no sign-in anywhere in the code | all |
