## Residual Review Findings

Review findings not applied on `fix/rest-timer-hides-reps`. None were filed as GitHub issues: the repository is public, so opening issues waits for the owner's go-ahead.

- P2 · `src/features/rest/RestTimerSheet.tsx:92` · **Centre-of-bar tap during rest hits Skip** (UX call for the owner). At 360 px the compact timer's Skip / Close spans x≈149–210, where the full-width Next's centre (x=180) sits whenever no rest is running. A habitual centre tap ends the rest with no undo; Next then widens back under the same spot, so a second tap moves on with no countdown. Suggested fix: render Skip before the countdown face (`[Skip | face] [Next]`), so the centre lands on the reversible Expand face instead.
- P3 · `src/domain/workout/resync.ts:150` · **No test that a half-finished carry set starts no rest.** The carry guard became `if (setComplete) next = startRestFor(...)`; forcing it true leaves every unit test green. Suggested fix: assert `runtime.rest` is null at the end of "does not auto-start the other side while hidden" in `src/domain/workout/resync.test.ts`.
- P3 · `src/features/rest/RestTimerSheet.tsx:86` · **Held Enter strobes the rest view.** With the focus handoff, each auto-repeated Enter keydown activates the counterpart toggle, so holding Enter flips between compact and large until release. Suggested fix: `onKeyDown={(event) => { if (event.repeat) event.preventDefault() }}` on the Expand and Collapse buttons.

Source: `ce-code-review` run `20261002-184101-5cbd7830` (verdict: ready with fixes) against plan `docs/plans/2026-10-02-001-fix-rest-timer-hides-reps-plan.md`. Five other findings were applied in `fix(review): simplify the rest timer and apply review findings`.
