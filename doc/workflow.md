# Workflow

**Purpose.** The development routine: how a stage goes from plan to merged code, and where the
review gates are.

**What belongs here.** Process — branching, commit granularity, review points, merge and push
order, how the docs get updated as work lands.

**What doesn't.** Anything about the game itself. Rules go in
[query-and-conquer.md](query-and-conquer.md), technical choices in [tech-stack.md](tech-stack.md),
behavior in [implementation-spec.md](implementation-spec.md), the build order in
[implementation-tracking-v1.md](implementation-tracking-v1.md), code style in
[code-conventions.md](code-conventions.md), machine setup in [environment.md](environment.md).

**Branches.** `main` holds demonstrable work. `build-vN` is the long-running integration branch;
each stage gets its own branch off it (`build-vN-M`), merged back after review. `main`
fast-forwards from the integration branch at milestones.

---

## Per stage

### 1. Review the plan

Re-read the stage's own checklist in the tracking doc and check whether it still holds up — add,
remove, or tweak steps based on what's been learned since it was written, especially from how the
previous stage actually went. Do this **before** touching the spec or any code.

A plan written five stages ago was written by someone who hadn't built the last four.

### 2. Create the stage's branch

One branch per stage, off the integration branch. Keeps a stage reviewable as a unit and reverting
it a single operation.

### 3. Fill in the spec, then stop

Write the [implementation-spec.md](implementation-spec.md) sections the stage needs — that doc is
organized by game element/module, not by stage, so a stage typically touches several sections
rather than one. That's the "Spec" checkbox at the top of each stage.

**Then stop and wait for explicit sign-off before writing implementation code.** The cheapest
review gate in the loop: a wrong assumption costs a paragraph here and a day of rework once the
code exists.

**Opt-out.** When the reviewer explicitly says to skip the wait for a stage ("if no significant
question just do the spec and start implementation, I'll review after"), then: note any genuine
open design questions *in the spec text itself*, pick the sensible default for each rather than
blocking, and proceed. Review happens against the finished result instead of the spec draft. A
per-request opt-out, not a change to the default.

If the design shifts once implementation starts, update the spec section — it describes the end
state, so it must match what actually got built.

### 4. Implement, one commit per checklist step

A separate commit per checklist item, not one per stage. Bundling a stage into one commit makes
the diff unreviewable and bisecting useless.

Commit messages say **why**, not what — the what is in the diff. Decisions, rejected
alternatives, and anything surprising you found are worth the lines. (Multi-line messages: write
to a file and use `git commit -F`, per [environment.md](environment.md).)

### 5. Verify before claiming done

Run the **full** suite — `npm test` and `npm run test:e2e` — not just what you touched. Report
failures plainly with output; a skipped step gets said out loud, not quietly dropped.

**Look at anything visual.** A passing test says the code ran, not that the result is right. A
move-range overlay at 18% opacity over dark terrain draws correctly and is effectively invisible;
only looking found that.

**Write throwaway verification for anything you're reasoning about rather than observing.** A
scratch script running the real functions and printing what actually happened — a seeded
simulation over many turns, a screenshot, a direct check of a computed value — repeatedly catches
what careful thinking misses: off-by-one errors in hand-worked coordinates, a rule that never
fires, a fixture that isn't what you meant. Delete it in the same session
([code-conventions.md](code-conventions.md)).

Two traps, both of which have cost real time here:

- **Don't write scratch output where the dev server watches it.** live-server reloads the page
  mid-run and resets the state you were inspecting, and the failure reads as an application bug
  rather than a tooling one. Use `/tmp`.
- **A test failing after a deliberate rule change may be asserting the old behavior.** Before
  "fixing" anything, decide which of the two is right. A test written when the old rule held is
  evidence about the old rule — but it's equally possible the rule change was wrong and the test
  is saying so. Read it before touching either.

### 6. Push the branch

Push the stage branch to its own remote as soon as it's complete — **before** review and before
any merge. The work is backed up off the machine from that moment, and the reviewer has something
to look at that isn't a working copy.

### 7. Review

The reviewer reviews the finished stage. Nothing merges before this.

### 8. Merge, then push the target

Merge or fast-forward into the integration branch, then push that. Because step 6 already pushed
the branch, its full history survives on origin independently rather than only implicitly inside
the integration branch's history.

Delete the stage branch once merged and confirmed, locally and on the remote.

---

## Checking work off

Check items off **with a note on what actually happened**, particularly where it diverged:

- Already handled by earlier generic work: say so, and what confirmed it.
- Found and fixed along the way but not in the plan: add it as an `Ad hoc:` item, rather than
  leaving the checklist looking like the plan was perfect.
- Deliberately not done: move it to whichever closing-pass stage fits the kind of gap (map/hex,
  UI/UX, balance, or the final audit — query-and-conquer's own tracking doc splits these into
  separate stages once there's enough of each kind to plan on its own), with the reasoning. Don't
  silently drop it.

The checklist records how the build actually went. Its value is in the divergences.

**Keep the note itself short — a sentence or two, pointing at where the full reasoning already
lives, not a copy of it.** The commit message already carries the why (per "one commit per
checklist step" above); a design decision already lives in whichever spec doc owns that kind of
rule. A checklist note re-deriving either is the same reasoning written three times over —
measured across Stages 6/12/13, item length roughly doubled stage over stage this way, purely
from habit rather than any of those stages actually needing more explaining. Reserve real length
for the one case a commit can't cover: something genuinely deferred, where the checklist itself
is the only durable record until a later stage picks it up (see "Deferring work honestly" below).

---

## Deferring work honestly

When something real is found but shouldn't be fixed now, write it into whichever closing-pass
stage fits it (see above) with enough detail to act on later: what's wrong, why it was deferred,
what fixing it would take. "Not a minor tweak" is useful; a stub saying "improve X" is not.

Anything deferred because it needs a **decision** rather than work should say which decision and
what the options are. That's what makes it resumable.

---

## When a rule turns out to be wrong

Specs get things wrong. When implementation reveals a documented rule doesn't hold up:

1. Fix the doc that owns the rule, in the same change as the code.
2. Say plainly in the commit message that it's a reversal, and why the original reasoning failed.

Don't leave a doc asserting something the code no longer does. A spec nobody trusts is worse than
no spec, because people keep half-believing it.

Watch specifically for **implementation limitations leaking into rules** — "it works this way
because that was awkward to build" is a bug in the doc, not a design decision. This has happened
here: an unload-into-boat transfer was specced as free because neither container tracked an
action budget, which was a limitation dictating a rule rather than the reverse.

---

## Codify agreements in the docs

A standing agreement made in conversation is invisible to the next session, the next tool, and
the next person. If it will matter again, write it into whichever doc owns that kind of decision.

An AI assistant's private memory is a fine fast-recall convenience alongside that, but must not be
the only record of anything a contributor would need.
