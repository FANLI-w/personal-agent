# 第一步：任务工作页接入本机 DSH

日期：2026-10-28。分支 `feat/dsh-task-workspace`，产品提交 `97e8720`，客户端候选 0.10.68。该分支依赖尚待审阅的 PR130/cb68a1e，基于实际 main/93da480；没有合并到主线。

## 用户能做什么

原“工作台”改为“任务”，默认打开任务列表。原任务、计划、群协作和验收继续保留，旧 `/workbench` 链接仍有效。任务列表与既有聊天任务链接进入同一工作页：

- **执行**：查看目标与交付要求，在本机 DSH 中继续处理这项任务，查看文字回答和工具记录，停止本轮，保存进度/下一步。
- **资料与成果**：选入有权限的任务附件或资料库文件版本；在独立任务目录处理，预览文本成果，勾选文件并提交摘要。
- **安排与验收**：沿用原负责人、承接、邀请、开始、阻碍、提交和验收操作。DSH 本轮结束不会自动将任务验收完成。

首批重点是科研任务文献对照闭环。个人协作任务也可建立本机工作区，当前只向既有个人任务结果接口提交文字；其文件留在本机。独立 DSH 页面保留，用于完整插件、工具确认、交互提问和轨迹；任务页提供入口，并提示按带任务 ID 前缀的会话标题查找。当前没有向上游 UI 注入点击脚本或承诺自动定位会话。

## 接口与保存

使用固定 **DSH 0.2.1-rc.3** 发行包中的公开 session/workspace Remote API：`workspace/create`、`session/create/rename/projections/page/list/prompt/cancel`。通过已经鉴权的隔离 BrowserView Session 调用本机 HTTP RPC；`session/list` 的参数名是 `_request`，其余这里使用的端点为 `request`。`turn/end.reason.kind` 读取实际完成/中断原因。未复制上游源码到 Git。

`integrations/deepseek-harness/desktop/task-workspace.ts` 处理本地绑定、恢复与提交回执；Electron 主进程固定白名单业务操作，重新核对 Cookie 会话、任务权限及来源版本。渲染进程不能指定任意服务 URL、模型 Key 或任意本机绝对路径。

本机数据位于 AcceptCat userData 下：

```text
task-workspaces/<服务及账号身份摘要>/
  research-<taskId>.json                 # 会话、设备、资料版本、备注、待核对操作
  research-<taskId>.delivery.<id>.json    # 固定提交内容、上传回执、幂等键
  files/research-<taskId>/               # 默认任务工作目录
```

也可首次建立时选择已有文件夹。DSH 原始会话/工具日志仍在既有按账号隔离的 DSH_HOME 内。绑定记录指向稳定 sessionId；真实执行轮次由该会话的事件序列记录，不创建第二套服务端运行状态。当前不进行多设备排他领取；这是第三步范围。

模型仍使用当前 AcceptCat 账号默认配置，通过已部署的受限模型转发接口；工具和文件执行在本机，提供方 Key 不下发。**本批没有新增后台接口、数据库迁移或后台部署。** 前提是后台已有 PR130 的本地 DSH 配置/模型接口；2026-10-28 已记录部署 f58bf538/contract0.34/schema027，不能把最新 main 的 schema028 视为线上状态。

共享读写继续使用现有任务、artifacts、research-library、personal work API：

- 资料复制前后重新读取权限与版本，核对 SHA256；继续执行与提交时再次检查来源是否可访问。下载过的本地副本不会因服务器撤回而远程销毁；已撤回来源的本任务后续请求会拒绝。
- 仅显式选定的成果文件上传。交付同时记录来源名称/版本，已有任务附件引用加入交付关联；私人资料库原文不会自动上传或扩大共享范围。
- 上传和提交前先保存固定字节、版本及幂等键。超时/丢失响应重试原操作；已上传文件不因重试再次上传。确定收到版本冲突后，用户核对最新安排，再显式重新提交这一版，复用已上传文件。
- 本机消息只发送给该任务的 DSH 会话；页面切换不改变执行归属。账号退出/失效沿用 DSH 清理，旧账号不能继续读取本地回执。

## 当前限制

- 任务页每 3.5 秒读取已落盘记录，显示最近 100 条消息；不是逐 token 流式 UI。完整历史在 DSH 页面。
- 工具批准仍在完整 DSH 页面处理。任务页识别待批准记录并提供入口，保留“停止本轮”；不会自动批准。高级工具交互尚未内嵌到任务页。
- 资料选择每类最多读取 100 项，本任务最多选入 95 个版本；成果每次最多 5 个文件、每个 10 MiB。支持 TXT/MD/CSV/TSV/JSON/PDF/PNG 提交；文本页内预览，PDF/PNG 本机查看。
- 工作目录不是操作系统沙箱。手选目录与 DSH 工具权限沿用用户实际授权；工作页的上传/预览检查拒绝目录外路径和符号链接。
- 规则编辑、长期记忆、统一索引、按任务自动装载 Agent 人设/Skill，以及群内本机 Agent 调度尚未实现。绑定中的 agentId 仅保留关联，不伪称已应用该 Agent 的角色或私人记忆。

## 开发与验证命令

根目录先按仓库约定准备依赖；客户端使用 pnpm 10，根目录使用 pnpm 11。

```powershell
# 根目录
corepack pnpm@11.21.0 run ci

# clients/openim
corepack pnpm@10.28.0 run dev
corepack pnpm@10.28.0 run typecheck
corepack pnpm@10.28.0 run typecheck:electron
corepack pnpm@10.28.0 run test:local-dsh
corepack pnpm@10.28.0 run test:planner-task-creation
$env:ACCEPTCAT_DSH_INSTALLER='D:\deepseek-agent\.runtime\dsh-integrated-20261028\vendor-installer.exe'
corepack pnpm@10.28.0 run build:win
corepack pnpm@10.28.0 run electron:smoke
```

## 本批检查与交付

证据目录：`D:\deepseek-agent\.runtime\dsh-task-workspace-20261028`，不入 Git。

- 17 项 DSH 定向检查通过，含本批 8 项任务隔离/恢复、来源 hash/路径、丢失回执幂等、真实契约引用、版本冲突和审批状态投影，以及一项 Windows 退出时序回归；4 项既有聊天确认建任务、3 项桌面工作流程回归通过。
- 实际 Electron22 + 内置 DSH + 本机真实业务 API/SQLite 的 27 项闭环通过：实际 read/write 工具生成合成文献对照表，页面选择文件提交、下载、明确验收完成；切任务、重启、重复请求、资料库版本读取、撤回后阻断和另一账号私人文件不可访问均验证。另 3 项实际预览按钮、完成任务历史及正常退出通过。模型传输为合成，未调用真实模型或私人资料。
- UI 使用实际 TaskWorkPage/ResearchTaskPanel 与合成账号。测试边界替代 OpenIM 和外层导航，不冒称完成真实聊天双机测试。Browser plugin not available，使用自有隔离 Electron 窗口和 DOM 驱动；1350/1040 宽度截图在证据目录。
- 初次完整测试发现交付引用未加入 artifactRefs（已修）；后续测试脚本 Node16 无 fetch、测试代理 Origin 不匹配导致验收失败（修正夹具后通过）。退出曾报停止失败，补上 taskkill 返回早于 Node exit 事件时的有界等待；仍存活的进程继续报错，未吞掉真实失败。测试需先离开任务页再停止，避免轮询重新连接；最终退出通过，不能据此宣称所有 Windows 退出异常均已消除。
- 一次根构建重写了测试页监听的依赖，导致原生测试页面重载、DSH 启动取消；中止这一轮并在依赖稳定后重测通过。预览测试首次误选同名已上传附件按钮，修正到本机成果行后通过。失败/中止日志均保留；既有 Ant Design findDOMNode 弃用警告单独记录。
- 最终根 CI 837 项/66 文件、生产 3 项、B0 进程和 Web 生产检查通过；客户端和 Electron 类型检查通过。Windows NSIS 构建、包内 5 个归档入口、任务适配/IPC/三栏 UI、固定 DSH 运行包及更新 SHA512 核验通过，独立空数据目录的成品 Electron 启动通过（保留既有 electron-log 重复初始化告警）。安装到用户环境、真实账号/模型、真实多人协作仍由负责人验收。

候选安装器（未公开发布）：`D:\deepseek-agent\.runtime\dsh-task-workspace-20261028\windows\AcceptCat_0.10.68.exe`，366,868,820 字节，SHA256 `8ec3d67cbc911acebeaf237cc76fa9f20251be31860705574cb82b7ca7ee4b8f`。同目录保留 blockmap、latest.yml 和 SHA256SUMS；这些更新文件仅归档，未上传更新通道。纯 Node 的包检查首次不能按 Electron 虚拟目录读取 ASAR，改为 asar.extractFile 后通过；不涉及产品代码修改。

交付：[PR131](https://github.com/luoyan96/personal-agent/pull/131) 和候选安装包。20:27核对 PR 可合并，远端 Foundation/Windows 打包仍在运行；本地上述检查已通过。没有合并、公开 Release、后台部署或代用户安装。先前中止的打包日志保留；以上校验针对最终 `windows-build-release.log` 的成品。

测试结束后归档安装器触发测试 Vite 对新 EXE 的 EBUSY 监听错误，未影响已完成的原生测试或安装包；后续夹具忽略 windows 构建输出目录。合成 API 与测试窗口已清理，不操作用户客户端。

下一步：先验收这个任务闭环，再进入三步计划的第二步（规则与记忆）。不并行扩大到手机和多 Agent 调度。
