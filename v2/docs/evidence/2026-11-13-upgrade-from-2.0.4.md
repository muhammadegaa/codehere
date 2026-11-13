# Upgrade from 2.0.4 (13 Nov 2026) — launch bar L12

`node v2/scripts/upgrade-from-2.0.4.mjs <scratch> <2.0.4 bin> <this build's bin>`, with 2.0.4 from the npm tarball (sha1 29d3eb77…, the shasum npm lists for 2.0.4) and this build at `fix/2.1.0-rc.3` (7f4e7e5). One repo and one HOME for both versions.

A 2.0.4 user runs `init --agent claude`, approves `npm test --silent` in a terminal, adds a team rule and a lesson, commits them, and has one session (a failing run is sent back). Then, with nothing re-run, the next sessions use this build:

```
ok   2.0.4: init, approve, rule and lesson succeed
ok   2.0.4: a failing run sends the agent back
ok   upgraded: session start still gives the agent the team rule
ok   upgraded: a skipped test is sent back, with the person's line
ok   upgraded: the test command approved under 2.0.4 still runs, and the fix gets ✓
ok   upgraded: status works on the 2.0.4 state
```

Not checked: upgrades from 2.0.0 to 2.0.3, Codex and Copilot hook files written by 2.0.4, and whether the 2.0.4 lesson reaches the agent at a matching error after the upgrade.
