# Live Claude Code runs, 14 Nov 2026 (launch bar L8)

Claude Code 2.1.323, model haiku, on Ega's subscription login (`env -u ANTHROPIC_API_KEY`), each run in its own scratch folder with its own approvals. Codehere: branch `fix/2.1.0-rc.3` at 470f0e5 (package version still 2.1.0-rc.2), run from the checkout, not from npm. Command: `node scripts/conformance.mjs --agent claude --model haiku`.

These are not the L8 result: L8 asks for runs on the npm release candidate. They check the harness and the branch before that.

| Runs | Result | Sessions (the first two of each run; the reports did not list the third) |
|---|---|---|
| 1 to 3 | L2, L3, L5, L6 PASS; L1 FAIL in all three | c80a314e-6d2c-44b3-967c-98ef0b8a6679 676185eb-9dd8-461b-883c-9605805179ef · 0410f064-3e23-4198-81aa-f4766a570515 3382fe79-e484-48b5-b277-a10760049bb8 · bae03824-7ceb-42f8-9e4b-2106e83bb922 51d71f3f-7a74-48a5-addc-f74b731c6fd0  |
| 4 to 6, after the harness fix | L1, L2, L3, L5, L6 PASS in all three | c2799511-2481-4bfa-86bd-1800010d008d b48fbc4f-7317-4f90-8467-c83c43033ef5 · c6c285f3-4127-4ebf-ae95-2e73ae936cc3 d5bdeabb-1172-4107-a001-bb000c9b37a5 · 6e43daf9-fbd1-46db-b0f1-a82ee7c93418 49f5d355-d77b-4e14-bfc7-684ecc5aebc5  |

Why L1 failed in runs 1 to 3: the harness added the team rule by running `codehere rule` from its own process, which runs under an agent (this Claude Code session). Since 2.1.0 that only prints a draft, so the rule was never saved and never reached the model; Codehere's session-start text was in the model's context without it. The harness now adds the rule from a detached terminal, as it already did for `codehere approve`, and stops if the rule was not saved. Nothing in Codehere changed between runs 3 and 4.

What each row checks: L1 the team rule is in the model's context before its first tool call; L2 a teammate's lesson reaches the model once after the tests fail; L3 after the agent breaks a test, Codehere's failure reason is the next prompt, 3 times at most; L6 a real fix gets a pass recorded in this session and the ✓ line; L5 the agent told to skip the failing test is sent back as a weakened test and the person sees the ✕ line.

Known fault in these six reports: the session table's "Tests after" for the second session was read after the third session, so it shows pass. Fixed in the harness; the ✕ lines in that row show the tests failed.

Not run: Codex CLI and Copilot CLI on this branch; any agent on an npm build of 2.1.0-rc.3.
