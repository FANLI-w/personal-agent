# 交接：把 dsh-research-workbench 做成工作台默认插件

写给接手插件侧（`luoyan96/dsh-research-workbench`）的同学/助手。本文已按插件侧的源码核对结果更新（2026-11-02），标「已核实」的结论来自插件侧对 DSH 启动链的确认，不要再按旧假设设计。

## 1. 现在的状态

| 项 | 值 |
|---|---|
| 仓库 | `luoyan96/personal-agent`，`main = dd9839d`（docs 提交），功能提交 `ebc4a3e` |
| 客户端 | **0.10.90**，已发 Release（tag `v0.10.90` → `ebc4a3e`），安装包 SHA256 `0adb33ce…e88364cf` |
| 后台 | 契约 **0.41.0**，迁移到 **032**；0.41.0 的部署由负责人执行，未确认完成 |
| 内置 DSH | **0.2.1-rc.3**（Windows 安装包内固定版本），云端 DSH 仍是 rc.2 |
| 插件仓库 | `main = 30244c5`，tag **v0.3.3**，Release 附 `dsh-research-workbench-0.3.3.tgz` |
| 用户机器上当前装的 | lock 钉在 `3d2805c`（**0.3.1，没有 CCF 面板**）；内置兜底请直接用 0.3.3 |
| CI | main 顶端 Foundation + Windows desktop package 均通过 |

客户端最近这批改动：任务入口按范围拆分（个人/课题组）、课题组规范页、PPT 工作模板、本地资料文件夹、资料索引（文件在本地，云端只存指针）、任务详情页重排。这些跟插件不冲突，但**插件必须兼容内置的 rc.3**。

## 2. AcceptCat 是怎么把 DSH 跑起来的

- 运行时目录：安装包里是 `resources/dsh`，开发态是 `clients/openim/.dsh-runtime`。
- 启动参数：`--profile web --patch <home>/acceptcat-managed.patch.json --no-open --host 127.0.0.1 --port 0`。
- 每个账号一个私有 home：`<userData>/local-dsh/accounts/<identity>/`，其中 `acceptcat-managed.patch.json` 是**模型与少量开关**的 overlay，由 `integrations/deepseek-harness/desktop/account-profile.ts` 生成。
- **profile 归 DSH 所有**：`<home>/profiles/web/{package.json,cordis.yml,cordis.patch.yml,pnpm-lock.yaml,node_modules}`。AcceptCat **不直接写这些文件**——包括 `package.json`。插件安装只走 DSH 自己的入口（见 §7）。
- 设计原则：AcceptCat 只做 overlay 和桥接；用户的 profile、已装插件列表、会话都归 DSH。

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

即：**一条 npm 依赖 + bundles 里一项**，安装由 DSH 自己用 pnpm 完成。

### DSH 插件系统的四个关键事实

1. **没有“更新插件”这个动作**。可用 API 只有 `pluginManager.installBundle`、`removePlugin`、`listBundles`、`listPlugins`、`inspect`、`cancelInstall`。所以负责人每次只能卸载再装——这是产品现状。
2. **`github:owner/repo` 只在第一次解析时取 HEAD**，之后被 `pnpm-lock.yaml` 钉死。spec 不变、lock 还在，重装也是旧 commit。
3. **启动时不会自动 install（已核实）**。启动链 `runProfile → composeProfile → prepareProfile → loadProfile → loadProfileDirectory` 的最后一步只读 `package.json`、用 `resolveBundleDir` 去 `node_modules` 找已存在目录；找不到就进 `skippedBundles`、往 stderr 打一行 `dsh: skipping profile bundle ...` 继续启动。
4. **因此「改 spec + 删 lock 再重启」是一条假成功路径**：`node_modules` 里仍是旧目录，DSH 会**静默加载旧版本且不报错**。这比安装失败更危险，不要用。

### pnpm 在哪（内部路径，不是契约）

`<supportDir>/primary-runtime/dependencies/pnpm/bin/pnpm.mjs`，启动器用 `process.execPath --expose-internals <pnpm.mjs>` + `ELECTRON_RUN_AS_NODE=1` 调用。**不要依赖这个路径**，也不要自己拼 pnpm 命令——用 `installBundle`。

## 4. 目标与落地路线

目标：**打开软件插件就在（默认启用），并且能跟着 GitHub 更新。**

| 路线 | 做法 | 能否跟随 GitHub | 结论 |
|---|---|---|---|
| A 跟软件走 | 插件打进安装包，`bundles` 默认带上 | 不能，跟版本走 | 可用，作为离线兜底 |
| B 自己改 profile | 改 spec + 删 lock + 重启 | 名义上能 | **不可用**，会静默加载旧版本（§3.4） |
| C 内置 + `installBundle` 更新（推荐） | 内置一份兜底；检查到新 tag 后调 `installBundle` 更新 | 能（用户确认后） | 推荐 |

落地顺序：**先 A（内置默认启用），再用 `installBundle` 做 C 的更新提示**。不默认静默自动更新——插件在用户机器上跑，能读工作区、用模型额度。

## 5. 已确认（原「待验证」作废）

原文档设想的「DSH 启动是否自动对齐 package.json 与 lock」实验**取消**，插件侧已核对源码，结论见 §3.3/§3.4：**不会对齐，且缺失的 bundle 会被静默跳过**。

由此推出两条硬约束：

- 任何更新都必须真正改动 `node_modules` 里的内容，否则等于没更新。
- 更新失败不能只看「重启后插件还在」——要在更新后**核对 `node_modules/dsh-research-workbench/package.json` 的 version**，与预期版本比对才算成功。

## 6. 插件侧已确认的事

1. **tag 与 release 已有**：`v0.3.3`（`30244c5`），Release 附 `dsh-research-workbench-0.3.3.tgz`。**不要补 `v0.3.1` 的 tag**——0.3.1 有 2 个测试失败且没有 CCF 面板，补了会被误当成可安装稳定版。
2. **`dist` 是提交的，不靠 `prepare`**：`lib/` 全量在 git 里，`files` 已含 `lib/index.js`、`lib/client.js`、`lib/papers.js`、`lib/workbench/*.js`；只有 `prepack`。**用户机器上不需要构建**，内置 tarball 直接可用。
3. **没有任何 peer 依赖**：`dependencies` / `peerDependencies` / `devDependencies` 全空，零运行时依赖；只用 Cordis `inject` 取宿主服务（`webServer`、`connection`，可选 `tools`），浏览器侧用 `ui-layout` / `ui-sidebar` / `ui-renderer`。
4. **版本门控（可选，暂不加）**：字段是 `engines.dsh`，不是 peer。注意 `^0.2.1` **不匹配** `0.2.1-rc.3`（rc 小于正式版），要写 `>=0.2.1-rc.3 <0.3.0`；不匹配时 bundle 会被**静默跳过**（面板直接消失），所以暂不建议加。

## 7. AcceptCat 侧要做的（按更正后的方式）

1. **默认安装走 `pluginManager.installBundle(spec)`**：DSH 自己改 `package.json`、跑 pnpm、写 `dsh.profile.bundles`。**我们不写 profile 文件**。
2. **回退已内建**：`installBundle` 运行前快照 `package.json` + `pnpm-lock.yaml`，失败/取消/无 bundle patch 一律原样恢复；`cancelInstall` 有 `cancelled` / `too-late` / `not-running` 三态；`approvedBuilds` 处理 build script 拦截；失败分类结构化（`not-found` / `no-matching-version` / `network` / `integrity`）。不需要我们再写一套回滚。
3. **不要用 `dsh plugin --profile web <args>`**：它只把参数转发给 pnpm，**不写 `dsh.profile.bundles`**，反而要我们自己补 bundles。
4. **安装包内置 0.3.3 的 tarball 作离线兜底**（`lib/` 已提交，装出来即可运行）。
5. **更新检查**：查 GitHub 最新 tag，与已装版本（读 `node_modules/dsh-research-workbench/package.json` 的 version，不是 lock）比对；不同则提示「研究插件有新版本」，用户确认后调 `installBundle`，并**在更新后核对实际版本**。
6. **失败不静默**：`skippedBundles` / stderr 里的 `dsh: skipping profile bundle ...` 要能在界面上看到，否则用户只会看到面板消失。
7. 版本与状态如实显示，不用固定文案谎称「已是最新」。

## 8. 边界（别做）

- 不写 `profiles/web` 下的任何文件（`package.json`、`cordis.yml`、`cordis.patch.yml`、`pnpm-lock.yaml`）。
- 不动用户手动装的其他插件。
- 不把 AcceptCat 的平台密钥写进 profile 或插件配置。
- 不在用户不知情的情况下静默升级第三方插件代码。
- 不改 DSH 本体（`resources/dsh` 是固定校验的发行包）。
- 不依赖 pnpm 的内部路径（`primary-runtime/dependencies/pnpm/bin/pnpm.mjs`）。

## 9. 关键文件（AcceptCat 仓库）

| 用途 | 路径 |
|---|---|
| DSH 启动与账号 home | `clients/openim/electron/main/localDshManage.ts` |
| 模型 overlay（`--patch` 文件） | `integrations/deepseek-harness/desktop/account-profile.ts` |
| 运行时与环境变量 | `integrations/deepseek-harness/desktop/local-runtime.ts` |
| 任务工作区（读 profile 的绑定） | `integrations/deepseek-harness/desktop/task-workspace.ts` |
| 打包入口与校验 | `scripts/desktop-build.mjs`、`.github/workflows/desktop.yml` |

## 10. 还需要对齐的两件事

1. **`installBundle` 的调用面**：它由 DSH 的插件管理 API 暴露（`pluginManager.installBundle`）。AcceptCat 目前没有调用它的通道——需要确认这个 API 是仅存在于渲染层（DSH 页面里），还是可通过本地 HTTP 接口调用。如果是前者，就要在嵌入的 DSH 页面里发一条受控调用，而不是从主进程直接跑 pnpm。
2. **内置 tarball 的落点**：放在安装包哪个目录、以什么 spec 交给 `installBundle`（本地路径 spec 还是 `github:…#v0.3.3`）。优先用 tag 形式（`github:luoyan96/dsh-research-workbench#v0.3.3`），本地 tarball 只作无网兜底。
