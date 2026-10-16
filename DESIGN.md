# Design System — codehere · "Instrument"

> 2026-10-16: the web UI and the gates `ui-token-gate.mjs` and `glyph-gate.mjs` are not in this tree any more. §1, the trust rule, still applies to everything `codehere check` prints. The other sections were written for the web UI and are kept as reference.


> **Binding source of truth.** Read this before any visual, copy, or CLI-output change — web AND CLI.
> Do not deviate without the owner's approval, and when you do deviate, update this file in the same change.
> Supersedes the "warm workroom" system of 2026-07-02, recoverable at git sha `630f180`.
>
> That system was ratified and never implemented: 203 explicit mono overrides against a sans default,
> 418 raw font-sizes across 17 values, a second undeclared accent that became the most-used hex in the
> codebase, and `/verify` running an entirely separate palette. This file is written to be **enforced**,
> not admired. Every binding rule below has a gate named next to it.

---

## 0 · The one thing

**"It actually checked."**

Every product in this category renders *claims* at hero scale and *evidence* as a thumbnail. For a
product whose wedge is that agents claim work they did not do, that is backwards to the point of
self-parody. codehere is a **measuring device**. An agent's claim is an input, never a result.

### The law (binding · gateable)

> **The largest type on any product surface is a measured fact — a reading, a count, an amount.
> Never a claim, never a heading.**

Scope: product surfaces (`/`, `/verify`, CLI output). It does **not** bind marketing pages or this
document, or the gate could never pass.

**Enforced in two halves, because one is not checkable from the other.**
`scripts/ui-token-gate.mjs` (`reading-size-unearned`) refuses `--fs-reading` on any selector that
does not carry `[data-reading]` — that is the *who claims the ceiling* half.
`scripts/dogfood-pass.mjs` (`reading-outranked`) drives the real DOM and asserts that the largest
text actually on screen is the marked element — that is the *what won* half, and it is the only one
that can see an inline style or a computed size. A stylesheet cannot; proven by planting a 52px
inline heading, which the CSS gate passed and the runtime check caught.

The rule fires on the reading size being *taken* by non-measurement text, never on a surface simply
having no measurement yet. An empty room has nothing to rank.

---

## 1 · The trust rule (binding · the most important rule in this file)

codehere runs on AI. So the first hard question in the first sales call is: *why should I trust your
AI's word about their AI?* The answer must be structural, not a promise.

**An LLM judgement may never render as proof.**

| Tier | Produced by | Reproducible | Renders as |
|---|---|---|---|
| **MEASURED** | codehere re-executed it: test exit code, real counts, file hash, git diff | Yes, deterministically | `--verified`. **The only green in the product.** |
| **OBSERVED** | the command ran, the file changed; nothing asserts correctness | Yes, partial | `--ink`, neutral. States what happened, claims nothing about quality. |
| **JUDGED** | a model read the diff and formed an opinion | No | Must name the model and the word *opinion*. **Never green. Never the card's reading.** |
| **UNCHECKED** | the agent said so, nothing was verified | No | `--ink-28`, dimmed, rendered as a claim only. |

Binding consequences:
- `--verified` is unreachable from any code path whose evidence is model-generated.
- A JUDGED result may never occupy `--fs-reading`.
- When codehere cannot re-execute something, it says so rather than dressing an opinion as a measurement.

**Enforced, in two halves (2026-08-07).** The tier is *derived*, never stamped: `evidenceTier()` reads
the fields `applyTestObservation()` already writes — `tests.observed` (codehere re-ran it and owns the
exit code) → `measured`; `testsUnobserved` with its recorded reason, or an agent scrape alone →
`unchecked`. `ui-token-gate.mjs` (`unearned-verdict-green`) refuses `--verified` on a verdict selector
that lacks `[data-evidence="measured"]`, and `styles.ts` scopes the green to that attribute so a
non-measured verdict renders in ink by construction. `dogfood-pass.mjs` (`unearned-green`) drives the
surface until a verdict actually exists, then asserts nothing painted green sits outside measured
evidence.

`judged` has no producer today: nothing LLM-derived reaches a verdict, because the Final Report is
prose. The tier exists so that if one ever does, it cannot arrive wearing green.

**Not yet covered:** green outside a verdict surface — a passing test count, the `/verify` legend key,
a readiness label. Those are measurements or states rather than verdicts, and requiring provenance on
every green pixel is a defensible larger rule but a different change. Named here so it is a decision
rather than an oversight.

**Measured, not asserted (2026-08-07).** `scripts/eval-detection.mjs` runs the shipped `verifyClaim`
over the existing corpora and reports, with a CI ratchet so quality may improve but never silently
regress:

```
DETECTION       5/5   modelled false completions returned 'broken'
FALSE POSITIVE  0/8   honest sessions wrongly called 'broken'
ABSTENTION      2/2   unverifiable claims correctly warned, not failed
```

Abstention is a first-class result, not a miss. When the adapter captured no test artifact, codehere
*cannot* check the claim, and it warns instead of failing — a verifier that fails whatever it cannot
see is just a different way of lying.

**What this number is not.** Five modelled lies, hand-written alongside the detector, plus six real
sessions that contain no captured lies. A detection rate measured on lies you wrote yourself shows
the detector does what its authors intended, not that it survives an agent nobody anticipated. It is
a floor. **Say "catches every false-completion shape we have modelled" and never "catches N% of false
completions."** The honest upgrade is organic capture from real sessions. See
`feedback_evaluate_methods_not_just_ship` in memory.

---

## 2 · Product Context

- **What this is:** a local-first CLI + daemon that runs coding agents across vendors, re-runs the checks they claim they ran, and keeps a tamper-evident local record of what each did and cost.
- **Who it's for:** developers running 2+ coding agents on their own bill.
- **Space:** developer tooling / AgentOps. Peers looked at 2026-08-07: Linear, Vercel, Sentry, Depot, Conductor.
- **Project type:** desktop web dashboard (127.0.0.1:3773) + CLI.

## 3 · Aesthetic Direction

- **Direction:** Industrial / instrument-grade. Precision instrument, not a terminal and not a SaaS dashboard.
- **Decoration level:** minimal. Hairlines, tick marks and alignment do the work. No texture, no gradients, no glow, no illustration, no mascot.
- **Mood:** a well-made measuring tool. Calm, exact, quietly serious. The named risk is reading cold or clinical; the fix is §5 — ember is the one warm colour and belongs to the human.
- **Reference:** Depot's benchmark bars (data as design, done well) · Linear's restraint. Explicitly **not** Sentry's purple-gradient-plus-mascot, which is the category's AI-slop default.

## 4 · The mechanic — claimed vs measured

The signature element. Every verifiable claim renders as a paired bar on one shared scale:

- **claimed** — hollow, dashed outline, `--ink-28`
- **measured** — solid fill; `--verified` when they agree, `--caught` when they do not

The comparison is carried by **geometry, not colour**, so a false completion is visible as a gap
before a word is read, and colour stays rationed for §5. A colour-blind user loses nothing.

## 5 · Colour

**Approach:** restrained. Colour is rare and always means something.

```
--g0        #0e0f10   app background          --ink      #e8eaec
--g1        #16181a   panels, rail            --ink-70   rgba(232,234,236,.70)
--g2        #1e2124   cards, raised           --ink-45   rgba(232,234,236,.45)
--g3        #282c30   hover, highest raise    --ink-28   rgba(232,234,236,.28)
--hair      rgba(232,234,236,.09)
--hair-soft rgba(232,234,236,.055)

--verified  #7fc39a   MEASURED only (see §1). Never for liveness, availability or success-in-general.
--caught    #e2827f   a verdict caught a contradiction
--warn      #d9a441   budget, partial, JUDGED
--ember     #ff9a76   THE accent. The human's own action. Never decorative, never a status.
```

Graphite is **true neutral** on purpose: the previous system was warm, and every competitor is cool
or neutral. Neutral reads as instrument rather than either cosy room or blue console.

**Banned:** purple/violet anything · gradients as decoration · a second accent (the old `--blue:#4a90e2`
became the most-used hex in the codebase; it is deleted) · green for anything except MEASURED.

**Contrast floors:** body ≥ 13:1 · `--ink-45` on `--g1` ≥ 4.5:1 · never use `--ink-28` for text a
user must read, only for de-emphasised claims. The old system had 167 text sites below its own floor.

## 6 · Typography

One superfamily, three jobs. IBM Plex was drawn for an engineering company: it carries machine
authority without costume, and it is absent from this category, where everything is Inter or a
Geist-shaped substitute.

- **Display / readings:** IBM Plex Mono 600, tabular-nums — the measured fact, the hero of every card
- **Voice / body:** IBM Plex Sans 400 — anything a person or an agent *said*
- **Labels / instrument marks:** IBM Plex Mono 400, uppercase, `.13em` tracking
- **Evidence / data:** IBM Plex Mono 400, tabular-nums — costs, counts, hashes, paths
- **Loading:** self-hosted base64 via `scripts/embed-fonts.mjs`, 3 faces, 64KB of woff2 → 79KB generated. **Zero external fetch, ever** — this is a product value, not just a design one.

> Labels were specified as IBM Plex Sans Condensed 600 when this file was first written, and that was
> dropped during implementation on the same day. 44 of the 48 uppercase-tracked label selectors were
> already `var(--mono)`, and a label set in mono already reads as a machine mark. A fourth face has to
> earn its 14.7KB by doing a job the other three do not; this one did not. Recorded here rather than
> quietly ignored, because a spec the code does not follow is how the previous system died.

**The voice/evidence split (binding):** anything *said* is Sans. Anything a machine *recorded* is Mono.
The old system inverted this in practice (203 mono overrides against a sans default) and nothing caught it.

### Scale (closed — closed is what makes it enforceable)

| Token | Size / line | Face | Used for |
|---|---|---|---|
| `--fs-reading` | 40 / 1.04 | Plex Mono 600 | the one measured fact per card |
| `--fs-title` | 20 / 1.20 | Plex Sans 600 | room and section titles |
| `--fs-body` | 14.5 / 1.55 | Plex Sans 400 | anything said |
| `--fs-ui` | 13 / 1.50 | Plex Sans 400 | controls, rail, cards |
| `--fs-fact` | 12 / 1.45 | Plex Mono 400 | costs, counts, hashes |
| `--fs-label` | 10.5 / 1.25 | Plex Cond 600 | instrument marks, column heads |

Six values. Nothing else. `ui-token-gate.mjs` `ALLOWED_FS` must be rewritten to exactly this set in
the same increment that migrates the CSS — not after.

## 7 · Spacing, layout, radius, motion

- **Base unit:** 4px. **Scale:** 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64
- **Density:** compact inside evidence blocks, generous between them.
- **Layout:** hybrid — grid-disciplined for the room and rail, free for the measurement block. Rail 200px. Max content 1120px.
- **Radius:** `--r-sm 2px` · `--r-md 4px`. Tight corners are instrument corners. Uniform bubbly radius is on the slop list.
- **Motion:** minimal-functional. Bars settle once on first reveal; nothing else moves. `prefers-reduced-motion` collapses all motion while information stays put.

## 8 · Glyphs and voice

Closed set: `✓` verified · `✕` caught · `·` separator · `—` absent value · `›` next · `●` on · `○` idle · `⊘` blocked. **That is the whole vocabulary.** Never emoji as an icon.

Copy: terse, human, never self-narrating. Never say the product is being honest — honesty reads from
behaviour. Status is word + number ("14 passed"), not a sentence. Separator is `·`, never an em dash.

## 9 · What this costs to implement (be honest about it)

1. Embed IBM Plex Sans / Sans Condensed / Mono via `scripts/embed-fonts.mjs`; drop Instrument Sans, Bricolage Grotesque, JetBrains Mono. **~1 day.**
2. Rewrite `ui/tokens.ts` to the §5 palette and §6 scale. Both pages already import it (`630f180`).
3. Collapse 418 raw font-sizes into the six tokens; clear all **178** `ui-token-baseline.json` signatures to 0.
4. Rewrite `ui-token-gate.mjs`: new `ALLOWED_FS`, plus the §0 law and the §1 trust rule as checks.
5. Extract a component layer from `app-script.ts` (5,230 lines, 495 class names, 0 components).
6. Delete `--blue`. Re-point every `--allow`/`--block` reference to `--verified`/`--caught`.

**Total: 1.5–2 weeks.** `ui-token-baseline.json` reaching **0** is the only honest measure of done.

## Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-02 | "Warm workroom" system ratified | `/design-consultation`. Never implemented; see header. |
| 2026-08-07 | One `:root` for every page (`ui/tokens.ts`) | `/verify` shipped a third "verified" green (`#28c840`) plus Inter. Commit `630f180`. |
| 2026-08-07 | Replaced with "Instrument" | The owner's call: full redesign from scratch. "Receipt" (serif + paper panel) proposed and rejected first. |
| 2026-08-07 | Memorable thing locked: "It actually checked." | The owner. Evidence is the only durable pillar; P1 commoditised by CodeBurn, P3 eroding to MCP. |
| 2026-08-07 | §1 trust rule: an LLM judgement may never render as proof | The owner raised the recursion: how is our AI trustworthy about their AI. Answer must be structural. Eval harness still owed. |
| 2026-08-07 | IBM Plex superfamily; graphite true-neutral | Anti-convergence: differs from both the old system and every peer reviewed. |
| 2026-08-08 | Absence of evidence gets its own state, never a verdict colour | The audit panel was a boolean, so an empty chain (which walks clean) rendered `--verified`. "Nothing recorded yet" is now `--fg-30`, matching the not-proven seal. A two-state control over a three-state fact will always paint one of them a lie. |
