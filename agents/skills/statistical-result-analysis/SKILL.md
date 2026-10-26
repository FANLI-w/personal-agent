---
name: statistical-result-analysis
displayName: 统计分析与结果解释
description: Analyze research-result files such as CSV, JSON, TSV, experiment logs, or tables and produce a reproducible statistical report. Use for comparing methods, selecting statistical tests, computing uncertainty and effect sizes, checking result tables, or preparing a paper's results section. Do not use to fabricate observations, infer causality from an unsuitable design, or silently choose tests without recording assumptions.
---

# Statistical result analysis

## Intake and data audit

Inspect the supplied table or result first and explain what is already visible. Derive the unit of analysis, metric and comparison structure where evidence supports them; do not ask the researcher to fill every analysis field. If a missing design fact changes valid inference, ask one essential question (for example, whether measurements are paired) and withhold only the affected inference. Before formal analysis, establish hypothesis/estimand and intended decision, audit missingness, duplicate IDs, invalid ranges and transformations, and save `analysis/data-audit.json` when tools allow.

## Analysis protocol

1. Write `analysis/plan.md`: estimand, primary test, alternatives, alpha/interval policy, multiple-comparison policy, and diagnostic assumptions.
2. Select tests from design, not metric names: paired data require paired/resampled comparison; independent groups require independent comparison; repeated measures require a model that accounts for dependence. If assumptions cannot be checked, report a robust/nonparametric or descriptive fallback.
3. Compute sample counts, central tendency, spread, confidence intervals, effect size with direction, test statistic, p-value where appropriate, and exact data exclusions.
4. Generate machine-readable `analysis/summary.json`, code/notebook reference, and `analysis/report.md`. Preserve raw values and seeds; never overwrite inputs.
5. Check reported tables against source metrics and flag impossible precision, missing denominators, or unmatched comparison settings.

## Quality gate

Use [analysis-contract.md](references/analysis-contract.md). Avoid “significant/non-significant” as the sole conclusion; interpret magnitude, uncertainty, and practical relevance. Do not claim causal effects without a causal design and stated assumptions. Do not execute analysis code or install packages without appropriate user approval.

Lead with the finding the data support, then the limitation and one practical next step. Keep raw evidence and uncertainty intact while using plain language. If code execution is unavailable, provide an analysis plan or code for later execution, never invented computed results. Respect already authorized scope without repeating routine approvals.
