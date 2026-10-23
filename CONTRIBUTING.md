# 共同开发

主仓库：[luoyan96/personal-agent](https://github.com/luoyan96/personal-agent)。产品名称AcceptCat，近期聚焦中国科研工作者的个人助理与课题组协作，Windows桌面优先，人与Agent共用通讯录。本人和学生先持续使用，再判断推广；长期Personal Agent方向保留。贡献可以是代码、方法、真实使用反馈或可公开的失败案例。

## 第一次参与

每个人及其 AI 使用独立克隆或 worktree，不共用正在修改的目录。2026-10-21，负责人明确选择以当前0.10.29为共同起点：其他合作者优先Fork主仓库，在自己的功能分支开发，向主仓库main提交PR，由负责人审阅后决定是否合并。以后新增合作者沿用同一流程，无需各自维护另一套发布主线。

先在GitHub Fork [luoyan96/personal-agent](https://github.com/luoyan96/personal-agent)，再克隆自己的Fork。以下 `<your-account>` 替换为本人GitHub账号：

```sh
git clone https://github.com/<your-account>/personal-agent.git
cd personal-agent
git remote add upstream https://github.com/luoyan96/personal-agent.git
git fetch upstream
git switch -c feat/your-task upstream/main
```

Fork场景中，`origin`指自己的仓库，`upstream`指主仓库；推送功能分支到origin，PR的目标仓库选luoyan96/personal-agent，目标分支选main。有主仓库写权限的协作者也可直接克隆主仓库、从origin/main开功能分支；仓库负责人本人新增功能同样开分支，通过PR汇总。

开始前核对实际Git状态与远端，不硬切分支、不丢弃已有修改。阅读 [AGENTS.md](AGENTS.md)、[当前状态](docs/current-state.md)、[项目日志](docs/project-log.md)最新记录、[README](README.md)和[路线图](docs/roadmap.md)；[产品规划](docs/product-plan.md)提供方向背景。当前状态区分本地代码与线上版本，旧日志只证明对应历史批次。给新AI接手可直接使用[交接prompt](docs/development/collaboration-handoff.md)，再补具体任务。

## 一个任务的流程

1. 在任务中写明问题、使用者、负责人和验收方法。
2. 获取主仓库最新 `main`，从该提交建立短期功能分支。每人及其 AI 助手使用自己的工作副本。
3. 完成一项可检查的改动，补充必要验证和说明。
4. 提交 Pull Request，描述新行为、验证结果和剩余限制；相关同伴检查后合并。

分支命名使用 `feat/<task>`、`feature/<task>`、`fix/<task>` 或 `docs/<task>`。任务说明记录负责人、功能范围与依赖；修改共享契约、数据库结构、锁文件或公共布局时，明确受影响模块，避免无关的大范围重构。前后端约定先更新 `packages/contracts`，分别说明谁修改哪些文件。合并前同步主仓库 `main`，在自己的分支解决冲突，保留双方意图，不用整文件覆盖他人的工作。验证遵循仓库要求及当次维护者指令，如实记录未执行部分。

```sh
git fetch upstream
git merge upstream/main
git add <changed-files>
git commit -m "fix: describe the change"
git push -u origin feat/your-task
```

上例适用于Fork；直接克隆主仓库时，将同步来源upstream/main换成origin/main。一个PR聚焦一个功能或修复，说明行为、验证情况、接口/迁移变化和剩余限制。

在GitHub创建目标为主仓库 `main` 的PR。负责人可以要求修改、暂缓或合并；AI收到“看一下PR”时先审阅，不自行认定已授权合并。明确要求合并时，核对双方最新代码并保留可追踪记录，不强推共享主线。需要撤销已合并改动时用 `git revert` 提交回退；数据库迁移与线上回退另外核对恢复说明，不能只换旧代码。

功能合并后，每个人重新获取主仓库main，下一个功能从更新后的main另开分支。已完成的旧功能分支不作为新任务起点。PR合并、Windows安装包制作、GitHub Release公开发布和阿里云后台部署是分别处理的动作；负责人统一决定整合与发布，合作者不自行覆盖生产服务或公开安装包。这些是团队约定，不表示已配置GitHub分支保护、自动合并或自动部署。

每天同步任务状态与阻碍，按完整的小改动提交，无需为了每日提交数量制造改动。运行环境部署单独安排。

## 检查

根工程使用 Node.js ≥22.19.0 和 `pnpm@11.21.0`。共享代码 / Skills 改动先执行 `pnpm install --frozen-lockfile`，再执行 `pnpm run ci`。现有 GitHub Actions 在 `main` 推送和 PR 时执行根检查，覆盖构建、类型、契约、合成模型测试和生产入口；真实模型、真实 IM 和线上部署要单独验收。纯文档执行 `pnpm run check:content` 和 `git diff --check` 即可。

正式 OpenIM 客户端在 `clients/openim`，有独立锁文件，使用 `pnpm@10.28.0`；根工程使用 `pnpm@11.21.0`。Windows安装包推荐从根目录执行以下命令，依次完成根依赖安装、两个共享包构建、客户端冻结安装和打包，默认 `--publish never`：

```sh
corepack pnpm@11.21.0 run desktop:win
```

只准备环境用 `corepack pnpm@11.21.0 run desktop:prepare`。入口显式选择两个固定pnpm版本；不要从根目录用 `pnpm --dir clients/openim install` 代替切换包管理器，它可能仍使用根pnpm11。

手动开发时按以下顺序执行，**contracts和research-skills都必须在客户端安装前build**。后者会生成Electron使用的 `dist/import.cjs` 和内置Skill资料，不能只构建契约。

```sh
# 根目录，pnpm 11.21.0
corepack pnpm@11.21.0 install --frozen-lockfile
corepack pnpm@11.21.0 run build:desktop-deps
# clients/openim，pnpm 10.28.0
cd clients/openim
corepack pnpm@10.28.0 install --ignore-workspace --frozen-lockfile
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run test:service
corepack pnpm@10.28.0 run test:auth
corepack pnpm@10.28.0 run build:web
```

两个本地包使用 `link:` 连接当前仓库产物，避免 `file:` 安装目录保留旧文件清单；链接包的依赖由根工程冻结安装负责。Web和Electron构建入口会先重新构建两个共享包，阻止旧快照/缺失模块，检查固定Electron22.3.27与electron-builder23.6.0内部组件，并将运行依赖复制成独立目录。Windows构建还核对成品app.asar中的启动入口、Skill CommonJS导入及YAML依赖，不把开发链接带到安装包。

不要用 `install --force` 作为共享包刷新步骤，也不要删除或浮动更新锁文件。正常冻结安装即可切换这两个链接；工具组件不一致时应先保留失败日志，再在独立干净目录使用同一固定提交和冻结锁文件重建。客户端构建环境与Windows安装后行为分开记录，不能据 `--force` 或某个报错单独判定NSIS故障根因。

[Windows desktop package](.github/workflows/desktop.yml)在相关PR和main改动上使用干净Windows checkout，执行上述准备、客户端类型/构建守卫、NSIS和成品/更新清单检查，并保存7天CI产物；不会自动发布Release。根Foundation CI继续覆盖科研后端与共享包，不等同于客户端打包检查。实际安装、原生启动与产品体验按维护者当次安排验证。

客户端改动还需验证实际交互和桌面 / 窄屏布局。现有根 Actions 不覆盖完整客户端构建，在 PR 中附上上述客户端检查的真实结果。构建成功不等于原生安装包、真实 SDK 或模型效果通过。

修改单个科研方法时，编辑 `agents/skills/<name>/SKILL.md` 及其参考文件，并在 `evaluations/` 补充对应情境。运行数据只提供可公开、可复现的最小示例。涉及文献、统计或实验的结论必须能够核对来源。

## 变更边界

产品范围与近期任务见[路线图](docs/roadmap.md)。新网页、账号、记忆和调度必须以实际行为验收。需要真实模型或外部服务的测试另行配置，普通代码检查不依赖个人 API key。

每批完成同步 [当前状态](docs/current-state.md)与[项目日志](docs/project-log.md)，写明受测源码、线上源码、证据和剩余事项。生产部署单独安排，GitHub合并不会自动更新阿里云。当前共同开发起点为主仓库最新main，2026-10-21已包含公开v0.10.29；v0.10.29固定229bf4d，main随后可以继续有文档和功能提交，不能把发布标签当成永久最新分支。原 `personal-agent-2026-10-06.1` 与 `personal-agent-2026-10-06` 仅保留为历史快照。部署使用固定SHA/标签，并依据[ECS记录](docs/deployment/openim-ecs.md)保留兼容数据库的回退路径。

仓库不收录真实 API Key、密码、邀请码、聊天 / 记忆数据库、用户材料、录音、运行证据或构建目录。`.env.example` 只放占位示例。沿用上游源码的归属和许可见 [NOTICE.md](NOTICE.md)，不要删去 OpenIM 的来源与许可文件。
