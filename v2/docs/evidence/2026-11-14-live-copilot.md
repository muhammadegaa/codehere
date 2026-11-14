# Live Copilot CLI runs, 14 Nov 2026 (launch bar L8)

Copilot CLI 1.0.105 (the official `@github/copilot` from npm, installed in a scratch folder with install scripts off) with `qwen3.5:9b-q4_K_M` through Ollama on this machine, set as a provider in a scratch COPILOT_HOME; no GitHub login or token was used. Codehere: `codehere@2.1.0-rc.3` installed from npm (registry shasum eb391c16). `init --agent claude,copilot`, so the repo has both `.github/hooks/codehere.json` and `.claude/settings.json`. Command: `node scripts/conformance.mjs --agent copilot --model qwen3.5:9b-q4_K_M --oss --bin <copilot> --package <codehere>`. Reports: `docs/conformance/2026-11-14-copilot-1.0.105-qwen3.5-9b-q4_K_M-npm-2.1.0-rc.3-run{1,2,3}.md`.

| Run | L1 rules at start | L2 lesson after failure | L3 failure reason sent back | L6 real fix gets a pass | L5 skipped test sent back as weakened | L4 Claude Code hooks stay quiet under Copilot | Sessions |
|---|---|---|---|---|---|---|---|
| 1 | PASS | PASS | PASS (1 send-back) | PASS | PASS | PASS | 7ee058d0-f14a-4e4b-93b5-6ce4cb475641 1cf07b5b-9d1b-4c55-8b88-1e2c2292e48c 1a6b1a05-2cb1-4d9b-9bab-c09a9857d96a |
| 2 | PASS | PASS | PASS (3 send-backs) | PASS | PASS | PASS | 62739cf7-995d-4e13-92be-5ae77c383718 84ff5fa7-3a03-4523-9e9f-86eddc51f1d8 01b63b7c-5bc2-4608-b01d-dd1709879d2b |
| 3 | PASS | PASS | PASS (2 send-backs) | PASS | PASS | PASS | 6104d191-eb1d-42d5-9887-f6006890c3e0 24326982-1300-4356-984f-e33dc52914f5 f5634783-4710-47d8-972a-8b28eacbd180 |

Copilot shows the person none of Codehere's lines, so the ✓ and ✕ lines are not recorded (the README says so under Known limits); the agent gets every message, and a send-back reaches it as the next prompt. 1.0.112 was the newest Copilot CLI on the day; 1.0.105 was used because it had been out for weeks and is the version the October runs used.
