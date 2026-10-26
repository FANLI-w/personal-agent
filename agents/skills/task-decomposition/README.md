# task-decomposition

默认将一个科研目标整理为一项任务，执行步骤和中间产出写入任务说明；只有用户明确要求分开创建才拆成多项独立任务并标注依赖。任务拆解不指定执行人，分工由现有 `allocation` 机制处理。用户在任务框说明要做的事、目标足够时就给待确认任务，材料和日期可以后续补；必要时最多问一个简单问题，不把创建任务变成问卷。

## 当前状态（前端接入，待真机验证）

- 接入方式：`clients/openim/src/research/planner-chat.ts` 用 Vite `?raw` 把 `SKILL.md` 正文打进前端 bundle，拼进任务规划 prompt 的「任务拆解方法」段落（`planningPrompt`）。
- 依赖关系可视化：`clients/openim/src/research/DependencyGraph.tsx` 按依赖深度分列 + SVG 画箭头，接在 `PlanningAgent` 拆解结果卡片里。
- 0.10.37已整合构建修复并公开；0.10.38候选补对话优先，0.10.39继续统一各助手和任务流程的低负担交流。真实模型拆解与交流质量尚未代验，不能用类型/结构检查代替；当前候选状态以`docs/current-state.md`为准。

## 后续计划

1. 真机验证拆解效果（本地 dev 或导师打包后）。
2. 完善后迁移到后端：由 `apps/api` 的 `execution-worker.ts` 通过 `loadResearchSkills()` 加载本 skill 正文注入 system，前端不再打包；规则文本不变，仅换加载来源。
3. 能力标注（capabilities）待项目能力库搭好后对齐；当前按 SKILL.md 约定降级为动词短语描述。
