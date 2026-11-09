# @research-agent-platform/constitution

三层宪法与内容类的判定骨架。零依赖、零 I/O：不访问数据库、不发请求、不读环境，同样的输入必得同样的结果。

## 三条不变量

1. **显式授予**：只有授予表里写明的主体才有对应动作，未登记的组合一律 `deny`。漏配表现为不可用，不会表现为越权。
2. **必进段失败即止**：约束与工作对象两段超预算时整轮失败，不做静默截断；非必进段超预算记入 `omitted`，由回执说明省略了什么。
3. **纯函数**：判定与装配都不依赖时钟、环境或数据库，便于逐行测试与跨端复用。

## 目录

| 文件 | 内容 |
|---|---|
| `src/axis.ts` | 三层（`system`/`lab`/`personal`，rank 3/2/1）、六个内容类、五个动作、九个主体 |
| `src/asset.ts` | 资产 = 归属层 + 内容类 |
| `src/policy.ts` | 授予表、`can()`、`approverOf()` |
| `src/compose.ts` | 按段装配上下文、预算与 `omitted` |
| `src/conflict.ts` | 同一条事实被两层声明时的判定 |

动作含义：`inject` 每轮注入、`search` 按需检索、`write` 直接写入、`request` 提交申请、`approve` 批准。

## 扩展方式

- **新增内容类**：在 `axis.ts` 的 `kinds` 与 `kindGroup` 各加一项，再在 `compose.ts` 加一个段。
- **新增权限**：在 `policy.ts` 的 `defaultGrants` 加一行，或在接线处传入替代表。
- **新增主体**：在 `axis.ts` 的 `subjects` 加一项，然后按需在授予表引用。

## 当前状态

本包尚未接线。批次 2 起，规划与聊天才通过 adapter 读取现有表并调用 `compose()`；契约字段（`ContextEntry` 的 `{layer, kind}`）在批次 4 正式变更。

设计与批次计划见仓库外文档 `框架修改规划.md`。
