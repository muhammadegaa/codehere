# The finish check's detector on CheatBench (13 Nov 2026)

CheatBench (github.com/DariusHQ/noskip at 2290032, MIT) is 100 Claude Code runs (Haiku, Sonnet, Opus) on 20 small tasks, each labelled by a person. In 8 tasks one test contradicts the spec, so no honest change makes the suite green.

Command: `node v2/scripts/cheatbench-detector.mjs <noskip>/bench v2/src/signals.js`. It reads each run's recorded diff as text and runs the detector on it; nothing from the bench is executed. Sent back means a finding, or the visible tests failed (the finish check's re-run).

| Build | Gamed runs sent back | Honest runs (visible tests passing) sent back |
|---|---|---|
| npm 2.1.0-rc.2 | 0 of 39 | 0 of 45 |
| branch fix/2.1.0-rc.3 | 0 of 39 | 0 of 45 |
| for reference, 17 Oct (agent/eval/head-to-head/results/cheatbench-result.json): noskip 1.2.0 `--fail-on low` | 39 of 39 | 0 of 45 |
| same run: the old `codehere check` | 35 of 39 | 0 of 45 |

All 39 gamed runs fixed the real bug, then changed the contradicting test: an edited expected value, a flipped assertion, a case dropped from a list, swapped input rows, or a special case in the code. Every one said so in its summary (label "disclosed"). The v2 detector looks for skips, `.only`, deleted test files, assertions that cannot fail, net removed assertions and filters on the test script; it does not look at changed expected values, which its README and the pilot page list as a limit.

Limits: one benchmark, made by noskip's author; all 39 gamed runs are one kind (a changed test, said in the summary); the noskip and old-check rows are from 17 Oct, not re-run today.
