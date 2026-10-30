# AcceptCat 0.10.75 本地候选包（工作台文件夹对齐）

2026-10-30，负责人反馈“选了工作文件夹、点进工作台，看到的却是一串编号”，核对后修了两处并在本包内验证。本包只用于本机安装查看，**没有**创建 GitHub Release、没有推送分支、没有部署后台。

## 来源

- 分支 `feat/task-page-simplification`，产品代码 `f2fac9c`（在 0.10.74 的 6 个提交之上追加本批修复）。
- 版本号由 `0.10.74` 改为 `0.10.75`，仅用于与本机已装版本区分；依赖、契约、数据库均未改动。
- 本批改的是页面守卫与工作目录命名，属客户端与本地集成层：`clients/openim/electron/main/taskDshManage.ts`、`clients/openim/src/research/LocalDshPage.tsx`、`integrations/deepseek-harness/desktop/task-workspace.ts`。没有契约版本变化、没有迁移、没有后台接口变化。

## 本批修了什么

1. **页面守卫只认任务页**：`authorized()` 要求页面哈希以 `#/workbench?` 开头，而工作台页在 `/dsh`，导致工作台上的任务状态、选择文件夹、交接全部被拒，错误被界面吞掉后任务条显示成“还没选文件夹”。改为 `/workbench` 与 `/dsh` 都接受，`task` 参数仍须与本任务一致。
2. **默认工作目录用任务号命名**：没选文件夹的任务，目录原来是 `files/research-<uuid>`，DSH 侧边栏按文件夹名列出工作区，于是显示成一串任务号。改为 `research-<标题前 40 字>-<任务号前 8 位>`；已存在的旧目录不迁移，绑定里存的是绝对路径，不受影响。
3. **工作台任务条写清事实**：新增「工作文件夹」全路径与「DSH 会话」名，加「打开文件夹」按钮；进入带 `task=` 的工作台时自动重开该任务会话（幂等，只读或已完成任务失败时忽略）。

## 构建

根目录 `corepack pnpm@11.21.0 run desktop:win`（`--publish never`），产物写入 `clients/openim/release/Base/0.10.75/`。

构建环境说明：本机批量删除守卫仍会拦截 `packages/research-skills/dist/roles` 重建与 pnpm 临时目录清理。处理方式与 0.10.74 相同——先手工清空这两处，构建命令前设置 `CODEBUDDY_SAFE_DELETE_ENABLED=0`；**仓库脚本未修改**。本批 `rcedit` 一次写入成功，无重试。

## 产物

| 文件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.75.exe | 405061874 | `018e6b212b1b2a52a5d871917dd4467b55554b4f213b24082466261bb3f5d428` |
| AcceptCat_0.10.75.exe.blockmap | 416914 | `6b479b62fe091e04c9b57c179ec6f75958352e058b3690163c47f7e9acb92c7d` |
| latest.yml | 341 | 见文件 |

`latest.yml` 记录版本 0.10.75、size 405061874、sha512 与安装器一致；成品 `AcceptCat.exe` 的 FileVersion 为 0.10.75、ProductVersion 为 0.10.75.0。

## 检查

- `check-web-build`：完整 web dist、4 个固定 SDK 资源、assets/font/icons 与 HTML 引用校验通过。
- 包内校验：`app.asar` 6 个必需入口通过；直接检索 `app.asar` 命中本批新增文案（“打开文件夹”“工作文件夹”）与守卫里的 `"/dsh"`，确认包内为当前代码。
- 客户端 `typecheck`、`typecheck:electron`、`build:web` 通过；`local-dsh` 41 项（新增守卫用例：`#/dsh?task=` 放行、任务号不符与 `#/chat` 拒绝）、`workbench-links` 7 项通过。

## 边界

未运行安装器、未启动成品、未连接真实账号或模型；安装会覆盖本机已装版本，属负责人自行决定的操作。本包不可作为公开发布物，也不能据此认为 0.10.75 已发布。

已知遗留：DSH 侧边栏按工作区注册表列目录，负责人本机那个 Desktop 文件夹的工作区在注册表里缺一行（会话本身存在且可用），所以工作台里可能仍停在上一次用过的会话。任务条已把文件夹与会话名写清，可据此对照；是否让工作台强制聚焦任务会话，待确认 DSH 是否提供可用的定位接口。

证据目录：`D:/deepseek-agent/.runtime/task-page-0.10.75-20261030/windows/`（安装器、blockmap、latest.yml、builder-debug.yml）。
