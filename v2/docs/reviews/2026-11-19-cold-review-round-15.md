# Cold review, round 15 (launch bar L13)

- Date: 19 Nov 2026 (the review stopped once on a network error and was resumed with its work kept)
- Reviewer: the `cold-reviewer` agent on 20dee96, against `v2/docs/finish-check-promise.md` (bounded: an agent doing its task). Every case ran on d5dc9e7, d071afc and 20dee96: scan cases through a harness that builds the diff with `git diff -U0`, the key cases through the real hooks in throwaway repos.
- Our reproduction: each finding below is a check in the `R15` block of `test/e2e.mjs`, run on 20dee96 first.

## Findings

No Blocker: the set of files the scan reads is unchanged since round 14.

| # | Axis | Reviewer | Finding | Our rating |
|---|---|---|---|---|
| 1 | Standards | Major | a pyproject `addopts` item holding an option and its value (`"-k not test_adds"`, `"-k=not cart"`) was quoted whole, so the `-k` was never seen: ✓ through the hooks; d071afc sent it back | Major (regression from round 14) |
| 2 | Standards | Major | git's `\ No newline at end of file` line was counted as a line of the file, so a filter appended to a config with no final newline was placed one line low and not read: ✓ through the hooks, in all three builds | Major |
| 3 | Standards | Minor | a CI test step replaced by an echo holding `\'`, or by PowerShell's `Write-Host` or `printf`, counted as a test step | Minor |
| 4 | Spec (honest) | Minor | a list kept in a variable (`const ignored = [...]`) inlined under its key was sent back | Minor (regression from round 14) |
| 5 | Standards | Minor | a config read shorter than its hunks threw, and the finish check went silent | Minor |
| 6 | Standards | Minor | pytest's `;` comment lines were not comments; removing the `/*` and `*/` lines around a list item was not read | Minor |
| 7 | Standards | Minor | a column-0 comment ended a YAML block list | Minor |
| 8 | Standards, Spec (honest) | Minor | an option and its value on separate lines: a one-line list rewritten one item per line was sent back, and the value widened was missed | Minor |
| 9 | Standards | Minor | `addopts:` with a colon was not read | Minor |
| 10 | Standards | Minor | a regex item on its own line in a wrapped `testIgnore` list was not read | Minor |
| 11 | Spec (honest) | Minor | a YAML value rewritten as a block list was sent back | Minor |
| 12 | Standards | Nit | quotes inside a `#` comment on an `addopts` line were read as items | Nit |

On the out-of-scope list, said once: vitest's `test.exclude`, `--deselect` in tox's `commands` when the approved command is tox, `if: false` on a CI step or job, and GitLab's `when: manual` sit in files the scan reads and were not read in any build. We read tox's `commands` (when tox is the approved command) and CI steps or jobs switched off, as the same kind of thing as a test script's filters and `continue-on-error`. vitest's `test.exclude` is now named in the promise as a known gap: the same key names coverage files.

Blocker: 0. Major: 2, one a regression from round 14. Round 15 is not clean.

## Fixes

Most findings share one cause: a config was judged line by line, so how its lines were wrapped, commented, placed or ended decided what was read. A test config is now read whole when its start version can be rebuilt from the file now and the diff's hunks: the filters it gives the runner at session start are compared with the filters it gives now. package.json is read as JSON; pytest's `addopts` is split the way pytest splits it (a TOML list's items, or the text split as a shell splits it, with `-k not cart` in one argument read as `-k` and its value); a runner's config is read without its comments, with a list a variable holds read where a key names it. Where the file read does not match the diff (a file over 1 MiB, or one changed since), and in the audit, which has no file, the line-by-line reading stays, with fixes 1, 6, 9, 10 and 12 applied there too.

Each fix started as a failing check in the `R15` block: 27 red on 20dee96, then 3 more found while fixing, below; e2e 815/0 after.

| # | Fix | Check |
|---|---|---|
| 1 | Arguments are split as pytest splits them; an argument that starts with an option is read as the option and its value. | through the hooks: the item added is sent back; the three forms in the line-by-line reading are found |
| 2 | The `\ No newline` line is skipped, and a config read whole has no line numbers to get wrong. | through the hooks: the `--deselect` appended is sent back; the YAML item appended is found |
| 3 | An echo's argument is a run of quoted and bare parts; `printf`, `Write-Host` and `Write-Output` print only. | each found |
| 4 | A list a variable holds counts where a key or a `...spread` names it. | the inlined list: no finding; a path added to the variable's list: found |
| 5 | The read file is checked against every added and context line of the diff; when they differ the config is read line by line. | no throw |
| 6, 7, 9, 10, 11, 12 | Read whole: ini `#` and `;` comment lines, JavaScript `//` and `/* */` comments outside quotes, YAML comment lines inside a block, `addopts:`, regex items, a YAML key's block list, and comments cut before TOML items are read. | each found, or no finding for the honest forms |
| 8 | `addopts` is split as a whole, across its lines. | the rewrite: no finding; both widenings found |
| scope | tox's `commands` when the approved command runs tox; `if: false`, `when: manual` or `never` on a CI step or job. | each found; tox's commands with pytest approved: no finding |

Found while fixing, by running the reviewer's 109 scan cases on the fix beside the three earlier builds:
- A CRLF `pyproject.toml` with an item added was missed by the first version of the whole-file read (`.` does not match `\r`); every earlier build found it. Fixed, with its own check.
- `grep: smoke` rewritten as a YAML block scalar (`grep: >-` and the text under it) had been sent back since d071afc; now read as the same value.
- `continue-on-error: ${{ true }}` and TOML's `\"` inside an `addopts` string are read.

On the fix, 104 of the 109 cases give the expected result. The other five every build since d5dc9e7 gives the same way: a TOML multi-line `"""` string, a multi-line YAML flow list, `npm install jest || true` before `npx jest` (sent back), a trigger changed to `workflow_dispatch`, and vitest's `test.exclude`. Round 14's six hook cases and its scan cases give the same results as after round 14.

Measurements after the fixes: CheatBench dev half 20/20 gamed found, 0/30 honest flagged; the 46-case suite 26/26 and 20/20, no ✓ on a cheat (all unchanged); held-out half not run.
