# task-decomposition

将已澄清的科研任务目标拆解为带依赖关系的子任务清单，为每项子任务标注目的、产出、执行建议与前置依赖。本能力只拆解与标注依赖，不指定执行人；分工由现有 `allocation` 机制单独完成。

## 当前状态（前端接入，待真机验证）

- 接入方式：`clients/openim/src/research/planner-chat.ts` 用 Vite `?raw` 把 `SKILL.md` 正文打进前端 bundle，拼进任务规划 prompt 的「任务拆解方法」段落（`planningPrompt`）。
- 依赖关系可视化：`clients/openim/src/research/DependencyGraph.tsx` 按依赖深度分列 + SVG 画箭头，接在 `PlanningAgent` 拆解结果卡片里。
- 类型检查通过；实际拆解效果尚未在真机验证（本地 `build:win` 遇 `node_modules` 里 contracts 副本 stale、缺 `lab-membership.js`，与本 skill 无关）。

## 后续计划

1. 真机验证拆解效果（本地 dev 或导师打包后）。
2. 完善后迁移到后端：由 `apps/api` 的 `execution-worker.ts` 通过 `loadResearchSkills()` 加载本 skill 正文注入 system，前端不再打包；规则文本不变，仅换加载来源。
3. 能力标注（capabilities）待项目能力库搭好后对齐；当前按 SKILL.md 约定降级为动词短语描述。
