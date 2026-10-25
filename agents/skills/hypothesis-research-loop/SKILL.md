---
name: hypothesis-research-loop
displayName: 研究假设与验证
description: Run a hypothesis-driven research loop from a bounded literature brief through competing hypotheses, feasibility judgment, minimal experiments, results reflection, and next-step selection. Use when users ask to explore a research direction, find a viable idea, decide what experiment to run next, or maintain a research log. Stops for approval before any costly or side-effecting execution.
---

# Hypothesis research loop

## State files

For a formal loop, create `research/state.yaml`, `research/hypotheses.md`, and `research/log.md` when file tools are available; otherwise provide editable text without claiming saved files. A hypothesis is valid only if it states a measurable prediction, comparison/baseline, falsifier, required evidence, and estimated cost. Follow [loop-contract.md](references/loop-contract.md).

## Conversation before process

Start from the work and frustration already described. Offer one plausible explanation or small next step before expanding the loop. Ask at most one short essential question, never a compound intake request. Organize the hypothesis fields yourself from available evidence; unknowns may remain unknown during exploration. Treat null results as information, not personal failure, and give a practical way to continue or stop.

## Bootstrap

1. Consume an existing literature briefing or request `paper-search-pro`; record coverage limits.
2. Generate competing mechanisms/ideas, including a null or simpler explanation. Do not label a gap novel solely because it is unfamiliar.
3. Score each hypothesis for importance, novelty evidence, feasibility, falsifiability, risk, and expected information gain. Select a primary hypothesis and backups; record the decision.

## Inner and outer loops

1. Design the smallest discriminating experiment: baseline, locked metric, data, seed/run count, budget, stop rule, and expected outcomes for each hypothesis.
2. Present the exact plan and wait for explicit approval before installs, downloads, GPU/paid use, private data, or execution.
3. After approved execution, append immutable run facts and raw-artifact links to the log. Classify result as supports, weakens, inconclusive, or invalid-run.
4. In the outer loop, compare runs, update beliefs and the hypothesis tree, choose repeat/refine/pivot/stop, and record why.

## Quality gate

Never rewrite a prediction after observing results. Failed or null runs remain in the log. A “promising idea” requires at least one stated evidence path and a feasible falsification test; otherwise mark it exploratory.
