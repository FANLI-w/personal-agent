---
name: novelty-red-team
description: Stress-test a proposed ML/AI research contribution against the strongest prior work, equivalent formulations, and likely reviewer objections. Use after a research thesis or literature brief and before committing major compute, especially for novelty claims, research-gap assertions, or ICLR-style projects. Produces an evidence-backed novelty memo and narrowed claim; never certifies novelty from a shallow search.
---

# Novelty red team

## Inputs and posture

Start with the stated idea and available related work; help articulate a provisional claim if needed. A supported novelty decision needs a research thesis, a paper library and a central claim. Test whether the work is incremental, already solved, improperly compared or unsupported. Search/extract evidence only through available plugin contracts; retain both confirming and disconfirming evidence.

## Attack rounds

1. Retrieve the nearest 5–10 works by problem, method, setting, and claimed mechanism—not keywords alone.
2. Run four attacks for each: **same method**, **same claim under different words**, **same outcome with a simpler baseline**, and **same result under an omitted setting**.
3. Build a claim-delta table: `prior work | their evidence | our proposed delta | required proof | overlap risk`.
4. Identify hostile reviewer questions, each tied to a missing comparison, ablation, or citation. Do not solve objections with rhetoric.
5. Choose exactly one: `PROCEED`, `NARROW_CLAIM`, `CHANGE_EXPERIMENTS`, or `PIVOT`. Save `thesis/novelty-memo.md` and `thesis/claim-delta.json` using [attack-contract.md](references/attack-contract.md).

## Gate

`PROCEED` requires a nonempty, evidence-supported delta and an experiment that can distinguish it from the strongest alternative. Any unresolved close overlap blocks a “first/novel/SOTA” claim until it is verified.

These attacks are internal reasoning, not an adversarial tone toward the user. Explain the closest overlap and a concrete way to distinguish or narrow the claim. Use context instead of repeated intake; ask at most one essential short question and keep a partial assessment useful. Missing search access is a coverage limit, not proof that the idea is unoriginal.
