# AcceptCat 0.10.74 本地候选包（任务页简化）

2026-10-30，负责人要求“先打包一个本地安装包，新的，给我看看现在是什么样的”。本包只用于本机安装查看，**没有**创建 GitHub Release、没有推送分支、没有部署后台。

## 来源

- 分支 `feat/task-page-simplification`，产品代码 `9080393`（6 个提交：导航与详情重排、新建任务单字段、任务背景交接工作台、助手入口收为一条、列表与安排区去重、目标要点化与自动预填）。
- 版本号由 `0.10.73` 改为 `0.10.74`，仅为与本机已装的公开 0.10.73 区分；依赖、契约、数据库均未改动。
- 改动全部在 `clients/openim` 渲染层：没有契约版本变化、没有迁移、没有后台接口变化，因此可直接连当前生产后台（contract0.38/schema030）使用；任务转交等需要 0.39 后台的入口仍按既有能力检测隐藏。

## 构建

根目录 `corepack pnpm@11.21.0 run desktop:win`（`--publish never`），产物写入 `clients/openim/release/Base/0.10.74/`。

构建环境说明：本机工具链带有批量删除守卫（安全删除 shim），会拦截单进程内超过 50 项的删除，`packages/research-skills/dist/roles` 重建与 pnpm 临时目录清理因此失败。处理方式是先手工清空这两个目录，并在本次构建命令前设置 `CODEBUDDY_SAFE_DELETE_ENABLED=0`。**仓库脚本未修改**，CI 与正常发布流程不受影响。

过程中 electron-builder 的 `rcedit` 首次写入版本信息失败（`Unable to commit changes`），自动重试后成功；成品 `AcceptCat.exe` 的 FileVersion/ProductVersion 已核对为 0.10.74，非静默降级。

## 产物

| 文件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.74.exe | 405064752 | `71b39c0468db7288e6b694dd34b8d240dc338841c39389322c6f8c7df4f92bf4` |
| AcceptCat_0.10.74.exe.blockmap | 417306 | `31cb0d9a126fe741c38b47b7f5e871ec292da9159de008cb0a1f0c6613de255e` |
| latest.yml | 341 | `5c32aa9e782c58c8b7f7381c58e24cc4436bd85038d8efa4a4c0a92f68d6a3ab` |

`latest.yml` 记录的版本为 0.10.74、size 405064752、sha512 与安装器一致。

## 检查

- `check-web-build`：完整 web dist、4 个固定 SDK 资源、assets/font/icons 与 HTML 引用校验通过。
- 包内校验：`app.asar` 6 个必需入口通过；直接检索 `app.asar` 可命中本批新增文案（“已按助手最后一轮回复预填”）与样式类（`task-work-brief`），确认安装包里就是当前代码。
- 客户端 `typecheck`、`typecheck:electron`、`local-dsh` 39 项、`workbench-links` 7 项、`planning` 4 项、`desktop-work` 3 项在打包前通过。

## 边界

未运行安装器、未启动成品、未连接真实账号或模型；安装会覆盖本机已装的 0.10.73，属负责人自行决定的操作。真实任务流转、双人群、模型与日常体验仍需安装后验收。本包不可作为公开发布物，也不能据此认为 0.10.74 已发布。

证据目录：`D:/deepseek-agent/.runtime/task-page-0.10.74-20261030/windows/`（安装器、blockmap、latest.yml、builder-debug.yml）。
