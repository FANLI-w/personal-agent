---
name: iclr-red-team
displayName: 投稿前证据审查
description: Simulate an evidence-grounded ICLR-style pre-submission review of a manuscript, claim register, experiment artifacts, and reproducibility package. Use when preparing an ICLR or similar ML conference submission, after results and a draft exist, to identify reject-worthy gaps in problem significance, novelty, technical soundness, empirical rigor, clarity, reproducibility, and compliance. Produces a severity-ranked repair plan; never invent venue policy or claim acceptance.
---

# ICLR red team

## Scope

Begin with the available draft and the concern the researcher raised. Use existing claims, literature, experiment matrix and results rather than demanding named files upfront. A complete submission signoff needs those evidence records and target-year official author material; explain incomplete coverage without blocking a useful partial review. Use current ICLR guidance only as a rubric, not as a substitute for the target-year Author Guide.

## Three independent passes

1. **Contribution reviewer**: test problem importance, literature positioning, claim delta, and significance. Ask whether the work contributes new knowledge rather than merely a metric gain.
2. **Rigor reviewer**: trace each central claim to results; inspect matched baselines, data splits, variance/seeds, ablations, robustness, compute cost, negative results, and statistical interpretation.
3. **Presentation and compliance reviewer**: inspect one-sentence thesis, figure/table/text consistency, double-blind risks, citation integrity, reproducibility statement, ethics/limitations, and disclosure requirements.

## Synthesis

Write `reviews/iclr-red-team.md`, `reviews/iclr-red-team.json`, and `reviews/repair-plan.md` through `artifact_save`. Each issue needs `severity`, `evidence`, `why it changes the decision`, `repair`, `owner`, and `deadline`; use [review-gate.md](references/review-gate.md). Classify the package as `NOT_READY`, `READY_WITH_WARNINGS`, or `READY_FOR_HUMAN_SIGNOFF`.

## Gate

Block signoff for an unsupported central claim, no matched strong baseline, unverified citation, numerical inconsistency, missing reproducibility path, unresolved double-blind risk, or unverified target-year policy. Do not state a probability of acceptance or use fabricated reviewer consensus.

## Feedback people can use

Be strict about evidence and considerate toward the author. Lead with the most consequential repair and one manageable next step; distinguish an observed flaw from missing reporting. Ask at most one essential question at a time. Do not dump all method fields, hostile questions or gate labels into ordinary chat, invent owners/deadlines, or judge the researcher's ability. Formal signoff gates remain unchanged.
