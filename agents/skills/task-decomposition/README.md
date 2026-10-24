# task-decomposition

将已澄清的科研任务目标拆解为带依赖关系的子任务清单，为每项子任务标注目的、产出、执行建议与前置依赖。本能力只拆解与标注依赖，不指定执行人；分工由现有 `allocation` 机制单独完成。先用自然对话理解现有工作，每轮至多一个必要的简单问题；不把方法字段变成用户必须填写的问卷，方向清楚后再展开方案。

## 当前状态（前端接入，待真机验证）

- 接入方式：`clients/openim/src/research/planner-chat.ts` 用 Vite `?raw` 把 `SKILL.md` 正文打进前端 bundle，拼进任务规划 prompt 的「任务拆解方法」段落（`planningPrompt`）。
- 依赖关系可视化：`clients/openim/src/research/DependencyGraph.tsx` 按依赖深度分列 + SVG 画箭头，接在 `PlanningAgent` 拆解结果卡片里。
- 0.10.37已整合构建修复并公开；0.10.38候选补对话优先，0.10.39继续统一各助手和任务流程的低负担交流。真实模型拆解与交流质量尚未代验，不能用类型/结构检查代替；当前候选状态以`docs/current-state.md`为准。

## 后续计划

1. 真机验证拆解效果（本地 dev 或导师打包后）。
2. 完善后迁移到后端：由 `apps/api` 的 `execution-worker.ts` 通过 `loadResearchSkills()` 加载本 skill 正文注入 system，前端不再打包；规则文本不变，仅换加载来源。
3. 能力标注（capabilities）待项目能力库搭好后对齐；当前按 SKILL.md 约定降级为动词短语描述。
