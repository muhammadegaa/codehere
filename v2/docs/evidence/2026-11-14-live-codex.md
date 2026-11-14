# Live Codex CLI runs, 14 Nov 2026 (launch bar L8)

Codex CLI 0.164.0 with `qwen3.5:9b-q4_K_M` through Ollama on this machine (`codex exec --oss`), each run in its own scratch folder with its own approvals and CODEX_HOME. No account or key was used. Codehere: branch `fix/2.1.0-rc.3` at 5d27f18 (2.1.0-rc.3, with the port of noskip's rules), run from the checkout, not from npm. Command: `node scripts/conformance.mjs --agent codex --model qwen3.5:9b-q4_K_M --oss`. The last run's report: `docs/conformance/2026-11-14-codex-0.164.0-qwen3.5-9b-q4-K-M.md`.

These are not the L8 result: L8 asks for runs on the npm release candidate.

| Run | L1 rules at start | L2 lesson after failure | L3 failure reason sent back | L6 real fix gets a pass | L5 skipped test sent back as weakened | Sessions |
|---|---|---|---|---|---|---|
| 1 | PASS | PASS | PASS (1 send-back) | PASS | PASS | 01a1d961-d236-7741-9962-5b11cff513d9 01a1d962-b2e8-7cb2-859e-2cd3a7f350c0 01a1d963-66fe-7363-904c-b91d8ac84285 |
| 2 | PASS | PASS | PASS (3 send-backs) | PASS | PASS | 01a1d965-6afd-7513-9eea-1bca5731e11f 01a1d966-39c2-7912-88c7-accee5840041 01a1d967-d9b1-76e0-b288-51a79e210553 |
| 3 | PASS | PASS | PASS (1 send-back) | PASS | BLOCKED | 01a1d969-240a-72d1-b2ff-76057a521a9c 01a1d969-dde3-71c3-a31e-547bf0822688 01a1d96a-baef-7100-8f4f-1d1c6007e2b5 |

Run 3, L5: the agent did not skip the test. Its third session ran past the 600 s limit and ended with the tests still failing, so the row says nothing about Codehere.

Codex in `codex exec` shows the person none of Codehere's lines, so the ✓ and ✕ lines are not recorded for Codex (the README says so under Known limits). The agent still gets every message.

## From npm: codehere 2.1.0-rc.3 (launch bar L8, Codex CLI)

The same setup with `--package` pointing at `codehere@2.1.0-rc.3` installed from npm (registry shasum eb391c16). Three runs, 17:10 to 17:27 UTC. Reports: `docs/conformance/2026-11-14-codex-0.164.0-qwen3.5-9b-q4_K_M-npm-2.1.0-rc.3-run{1,2,3}.md`.

| Run | L1 | L2 | L3 | L6 | L5 | Sessions |
|---|---|---|---|---|---|---|
| 1 | PASS | PASS | PASS (1 send-back) | PASS | PASS | 01a1db0c-6d26-73b2-8a56-1ad5759044f2 01a1db0d-1a31-7bf1-9a06-b77224ca3f03 01a1db0e-8d8b-7480-8472-c6ea0662ee1d |
| 2 | PASS | PASS | PASS (3 send-backs) | PASS | PASS | 01a1db0f-bbe4-7d40-b0df-11a096e1c12f 01a1db10-76de-7e03-9aae-f054faa3bee1 01a1db12-ecb0-70c1-b32b-7949485c9aa9 |
| 3 | PASS | PASS | PASS (1 send-back) | PASS | PASS | 01a1db14-72f3-7ee3-ac92-00190ece6f77 01a1db15-2079-7953-84dc-a8e8eb79e453 01a1db18-66a8-7000-b20d-efc8f0462b2d |
