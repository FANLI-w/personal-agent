# 交接：把 dsh-research-workbench 做成工作台默认插件

写给接手插件侧（`luoyan96/dsh-research-workbench`）的同学/助手。读完这份就知道现在项目在哪、插件是怎么被加载的、以及我们两边各要做什么。

## 1. 现在的状态

| 项 | 值 |
|---|---|
| 仓库 | `luoyan96/personal-agent`，`main = dd9839d`（docs 提交），功能提交 `ebc4a3e` |
| 客户端 | **0.10.90**，已发 Release（tag `v0.10.90` → `ebc4a3e`），安装包 SHA256 `0adb33ce…e88364cf` |
| 后台 | 契约 **0.41.0**，迁移到 **032**；0.41.0 的部署由负责人在做，未确认完成 |
| 内置 DSH | **0.2.1-rc.3**（Windows 安装包内固定版本），云端 DSH 仍是 rc.2 |
| CI | main 顶端 Foundation + Windows desktop package 均通过 |

客户端最近这批改动：任务入口按范围拆分（个人/课题组）、课题组规范页、PPT 工作模板、本地资料文件夹、资料索引（文件在本地，云端只存指针）、任务详情页重排。这些跟插件不冲突，但**插件必须兼容内置的 rc.3**，不要依赖云端 rc.2 的接口。

## 2. AcceptCat 是怎么把 DSH 跑起来的

- 运行时目录：安装包里是 `resources/dsh`，开发态是 `clients/openim/.dsh-runtime`。
- 启动参数：`--profile web --patch <home>/acceptcat-managed.patch.json --no-open --host 127.0.0.1 --port 0`。
- 每个账号一个私有 home：`<userData>/local-dsh/accounts/<identity>/`，其中 `acceptcat-managed.patch.json` 是**模型与少量开关**的 overlay，由 `integrations/deepseek-harness/desktop/account-profile.ts` 生成。
- **profile 归 DSH 所有**：`<home>/profiles/web/{package.json,cordis.yml,cordis.patch.yml,pnpm-lock.yaml,node_modules}`。AcceptCat 目前不写这些文件。
- 设计原则（别破坏）：AcceptCat 只做 overlay 和桥接，用户的 profile、已装插件列表、会话都归 DSH；我们不做第二套插件管理。

## 3. 插件现在是怎么装进去的（实测这台机器）

```json
// <home>/profiles/web/package.json
{
  "dependencies": { "dsh-research-workbench": "github:luoyan96/dsh-research-workbench" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-research-workbench"] } }
}
```

```yaml
# pnpm-lock.yaml
dsh-research-workbench@https://codeload.github.com/luoyan96/dsh-research-workbench/tar.gz/3d2805c…
  version: 0.3.1
```

即：**一条 npm 依赖 + bundles 里一项**，安装由 DSH 自己用内置 pnpm 完成。

### DSH 插件系统的三个关键事实

1. **没有“更新插件”这个动作**。可用的 API 只有 `pluginManager.installBundle`、`pluginManager.removePlugin`、`listBundles`、`listPlugins`、`inspect`、`cancelInstall`。所以负责人每次只能卸载再装——这是产品现状，不是操作问题。
2. **`github:owner/repo` 只在第一次解析时取 HEAD**，之后被 `pnpm-lock.yaml` 钉死在某个 commit。spec 不变、lock 还在，重装也是旧 commit。卸载之所以有效，是因为它删掉了 lock 里那条。
3. **DSH 文档明确支持“Built in”插件**：bundle 页面的 Source 会显示 `pnpm add` 能接受的 spec，或者 **Built in**（安装包自带的官方 bundle）。也就是说“随软件发布的内置插件”是设计内的正规形态。

## 4. 目标与三条路线

目标：**打开软件插件就在（默认启用），并且能跟着 GitHub 更新。**

| 路线 | 做法 | 能否跟随 GitHub | 风险 |
|---|---|---|---|
| A 跟软件走 | 插件打进安装包，`bundles` 默认带上 | 不能，跟版本走 | 最低 |
| B 跟 GitHub 走 | 启动时比对 main HEAD，变了改 spec + 清 lock + 重启 DSH | 能 | main 每个提交都进用户机器；装挂要能回退 |
| C 内置 + 提示更新（推荐） | 内置一份兜底；启动查 GitHub，有新版提示，点了才更新 | 能（人工确认） | 低 |

建议落地顺序：**先 A（内置默认启用），再加 C 的更新提示**。B 的“静默自动更新”不建议默认开——插件在用户机器上跑，能读工作区、用模型额度，第三方代码静默升级是供应链风险。

## 5. 还没验证的一件事（需要实验）

**DSH 启动时会不会把 `package.json` 和 `pnpm-lock.yaml` 自动对齐（即自动 `pnpm install`）？**

- 会 → 路线 B/C 很轻：我们只改 `package.json` 的 spec、删 lock 里那条，重启 DSH 即可。
- 不会 → 必须外部调 pnpm。目前**没找到可独立调用的 pnpm 二进制**（DSH 里 `pnpm@11.5.1` 是内部依赖，未在 `app.asar.unpacked` 暴露），这条路要另想办法（例如通过 DSH 的插件 API 走一次 `installBundle`）。

实验方法（在负责人机器上做，先备份）：备份 `package.json` + `pnpm-lock.yaml` → 把依赖改成指向更早的 commit → 重启 DSH → 看 `node_modules/dsh-research-workbench/package.json` 的 version 有没有变 → 还原。**这一步要负责人点头再做。**

## 6. 插件侧需要配合的事

1. **打 tag**：现在仓库只有 `main`，没有 tag、没有 release（最近 push 2026-11-01，默认版本 0.3.1）。没有 tag 就没有“稳定版本”锚点，也没法“装挂了退回上一版”。建议 `v0.3.1`、`v0.3.2` 这样打。
2. **明确包名与版本策略**：`dsh-research-workbench` 这个名字一旦被写进默认配置，改名等于所有用户要重装。版本号请遵守 semver，破坏性变更升 minor 以上。
3. **安装形态**：现在走 GitHub codeload tarball，国内网络不稳（DSH 的安装对话框专门为这种情况提供 npmmirror 兜底）。如果将来发到 npm，安装会稳定很多——**但请保持 GitHub 方式可用**，我们默认内置的就是 tarball。
4. **构建产物**：git 依赖安装时 pnpm 会跑 `prepare`。请确保仓库里要么有可用的 `prepare`，要么 `dist` 已提交，否则用户机器上装出来是空的。
5. **兼容性**：目标 DSH 是 **0.2.1-rc.3**（内置），不要依赖 rc.2 没有或 rc.4 才有的 API；peer 依赖写清楚。
6. **失败要可诊断**：安装/加载失败时给出可读原因（DSH 会把 pnpm 和 Loader 的原始诊断直接显示出来，别吞错）。

## 7. AcceptCat 侧我会做的事

1. DSH 启动前确保 `profiles/web/package.json` 里有这条依赖 + `bundles` 里有一项（**幂等**，不覆盖用户已有配置，不删除用户手动装的其他插件）。
2. 安装包内置一份插件 tarball 作为兜底（首次无网也能用）。
3. 启动时查 GitHub 最新 tag（**所以请打 tag**），与 lock 里的版本比对，不同就在 DSH 页提示「研究插件有新版本」，点了才更新并重启 DSH。
4. 记录“上一个可用版本”，安装失败自动回退并提示。
5. 版本与状态显示在界面上，不用固定文案谎称“已是最新”。

## 8. 边界（别做）

- 不接管用户的 profile：不重写 `cordis.yml`、不覆盖 `cordis.patch.yml`、不动用户手动装的插件。
- 不把 AcceptCat 的平台密钥写进 profile 或插件配置。
- 不在用户不知情的情况下静默升级第三方插件代码。
- 不改 DSH 本体（`resources/dsh` 是固定校验的发行包）。

## 9. 关键文件（AcceptCat 仓库）

| 用途 | 路径 |
|---|---|
| DSH 启动与账号 home | `clients/openim/electron/main/localDshManage.ts` |
| 模型 overlay（`--patch` 文件） | `integrations/deepseek-harness/desktop/account-profile.ts` |
| 运行时与环境变量 | `integrations/deepseek-harness/desktop/local-runtime.ts` |
| 任务工作区（读 profile 的绑定） | `integrations/deepseek-harness/desktop/task-workspace.ts` |
| 打包入口与校验 | `scripts/desktop-build.mjs`、`.github/workflows/desktop.yml` |

## 10. 我需要你回的三件事

1. 插件仓库能不能**打 tag 并发 release**（`v0.3.1` 起）？没有的话更新只能跟 main 的每个提交。
2. 仓库里 `dist` 是提交的，还是靠 `prepare` 构建？我内置 tarball 时要确认装出来是可运行的。
3. 插件有没有对 `@deepseek-ai/dsh-base` 的 peer 版本要求？内置的是 0.2.1-rc.3。
