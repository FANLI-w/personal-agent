# 群成员邀请、附件恢复与 0.10.92 候选（2026-11-04）

本批负责人要求：不纳入 PR #35，修好被邀请同事继续邀请自己的助理和其他人的能力，同时整合待审的附件恢复、测试及交接文档。

## 源码与公开状态

- 基线：`origin/main = 445b8ec5c1e3ba289d19ca68c9d6ae89e153e435`，公开 Latest `v0.10.91` 与该提交一致。
- 独立工作目录：`D:\deepseek-agent\acceptcat-group-invite-fix`；分支 `fix/group-member-invites`，原开发目录未切分支或覆盖。
- 普通 merge 整合 #167 的提交链（含 #165 发布记录与 #166 CI 超时修复）。#36 只提取当前版本需要的三个附件恢复文件；#35 的私有 Skill 发现逻辑未改，其他历史 PR 未批量合并或关闭。
- 本说明记录功能分支和本机候选。main 合并、后台部署、公开 Release、真实账号验收分别处理。

## 根因与行为

旧代码不仅在会话 `allowedActions` 隐藏普通成员的邀请入口，还在 `authorize(imInviteContact)` 和邀请动作验证中只放行群主。跨空间社交群又用群主的通讯录过滤全部成员，因此只改一个按钮仍会拒绝同事自己的助理。

现在已经加入的真人成员具有 `send` / `invite`，群主额外具有 `manage`；私人记忆管理仍按原来的所有者权限。邀请目标必须是邀请人当前有权使用的联系人/智能体，不能以知道 ID 代替授权。群版本冲突继续返回 409，幂等重试不重复拉人；被移除或失去有效关系后，缓存回执也不能恢复权限。旧 `invited` 成员重新选择可转为 `joined`，不新建等待接受的记录。

`apps/api/src/group-membership.ts` 只在社交群使用：从已经加入的群主真人出发，沿当前有效联系人关系遍历已加入真人，附带这些真人自己拥有或获准使用的已加入智能体。未加入的身份不会因关系存在自动入群；只有 Agent 加入也不让它的真人所有者读取群历史；脱离群主的关系环不自行授权。关系撤回、禁用账号、删除智能体仍实时失效，未增加表或迁移。群成员身份不等于任务承接、资料权限、课题组身份或私人记忆访问。

客户端继续复用「联系人 / 智能体」选择器和后台权限，不新增另一套成员状态。提示语改为直接入群；错误时明确当前邀请权限未同步，重新打开可刷新。工作台原生模型选择、PDF 与文件预览不在本批改动中。

## 附件恢复

从 #36 保留适用修复：读取回执超时与异常 JSON 响应可以重试，权限/格式/大小等永久错误不盲目重试。重试使用原始字节和同一幂等键，不重新发送 IM 文件。初次读取、重读、重试与状态查询都传递会话操作的取消信号；切换会话/账号后不能写回旧结果。文件下载仍沿用原有第一方来源和大小校验，没有扩大后台上传或模型读取上限。

## 检查与证据

证据目录（不进 Git）：`D:\deepseek-agent\.runtime\group-member-invites-20261104`。

| 检查 | 结果 / 证据 |
| --- | --- |
| 两套冻结依赖安装 | 根 pnpm 11.21.0、客户端 pnpm 10.28.0 通过，锁文件未改 |
| 修复前后定向回归 | `before.log` 三项失败；`after-focused.log` 三项通过 |
| 根完整 CI | `root-ci-serial.log` / `.exit` 为 0；70 文件、869 项及生产入口检查通过 |
| 首次 CI 失败 | `root-ci.log`：两项附件解析相关测试失败，首项返回 FILE_PARSE_TIMEOUT，另项未得到 turn；未改解析预算，按现有 Windows CI 串行配置复跑通过 |
| 普通成员邀请后同步 IM | `member-im-sync.log`，1 项通过；真实业务写入/同步路径和合成管理适配器回调，不是线上 IM 验收 |
| 客户端双类型 | `client-typecheck.log`、`electron-typecheck.log` 通过 |
| 聊天、成员、附件、传输 | `client-chat-gate.log`，56 项通过，含 3 项附件恢复测试 |
| 打包守卫 / 本地 DSH | `client-build-guards.log` 9 项、`client-local-dsh.log` 41 项通过 |
| 隔离组件交互 | `qa-result.json` 通过；1440×900、1024×726；普通成员邀请、同事助理/联系人加入、防重复选择、附件重试原内容/原键、切换会话取消请求 |

界面检查用 Playwright headless Edge：当前工具中没有 Browser 插件，采用本机 Playwright。复用真实组件、样式和操作 hook，仅在边界提供合成身份/响应；没有读取私人资料、连接真实模型或操作正在使用的客户端。`qa-*.mjs` 与截图保存在证据目录，前几次夹具/定位器失败也保留；最终无页面异常，保留了现有 React Router / AntD 弃用告警。它证明组件交互，不冒充生产全链路验收。

## 构建和部署

Windows 候选版本 **0.10.92**，沿用 Electron 43.8.4、内置 DSH 0.2.1-rc.3、tectonic 0.17.0、科研插件 0.3.3。固定 DSH 缓存复制前后验证整棵目录校验；工具归档按固定 SHA256 重新校验。日志：`runtime-cache.log`、`tools-stage.log`、`windows-build.log`。

本机已完成两套冻结安装和工具准备后，在 `clients/openim` 执行：

```powershell
corepack pnpm@10.28.0 run build:win
node scripts/check-windows-update.mjs
node scripts/electron-smoke.mjs "release/Base/0.10.92/win-unpacked/AcceptCat.exe"
```

新工作副本完整准备入口仍为仓库根目录 `corepack pnpm@11.21.0 run desktop:win`，默认不发布。

构建已完成，产品代码提交 `8faaa91`（后续提交仅更新回执）：

- 安装包：`D:\deepseek-agent\acceptcat-group-invite-fix\clients\openim\release\Base\0.10.92\AcceptCat_0.10.92.exe`，418,881,147 字节，FileVersion 0.10.92。
- SHA256：`353876f3939e4a31d2eab1031391077900bc58abf291b76ffbd0d7f0d4ebd5ba`；同目录含 `.exe.blockmap`、`latest.yml`、`SHA256SUMS.txt`。
- `windows-build.exit = 0`；`windows-update-check.log` 通过；`electron-smoke.log` 显示 `OPENIM_ELECTRON_READY` 和启动检查通过，使用独立临时配置并隐藏窗口，未安装到负责人真实客户端。
- 包内 DSH、科研插件与 tectonic 齐全，后者实际输出 `Tectonic 0.17.0`，无 rcedit 残留 tmp，见 `package-assets.json`。启动日志保留既有 electron-log 重复 initialize 告警，没有将其算作本批修复。
- 仅已提交源码的归档：证据目录 `source-8faaa91.tar.gz`，SHA256 `95553bdaac4a51afb51ff81e86dad3fa09ed347d3bceb70689d94c80001f75da`，供后续独立后台部署准备，不含本机配置或构建产物。

**后台独立部署已完成**：负责人授权后，**2026-11-04 11:08:52（北京时间）已从 PR168 / 6359c20 成对更新 API/worker**，沿用完整 Compose 覆盖链、停写一致备份与恢复副本核验；契约 **0.41.0**、schema **032** 不变，025 字节校验、ready、匿名 401、两容器版本与其他六容器保全均通过。实际镜像、备份和失败探针记录见 [部署回执](../deployment/group-member-invites-20261104.md)。main 合并与公开 Release 仍未执行。

## 负责人真实验收

1. A 建群加入 B；B 重新打开聊天详情，确认有「邀请成员」。
2. B 分别选择自己的助理和自己有权邀请的 C，确认直接加入；C 在自己的会话列表看到该群并能正常发消息。
3. B 的助理在原群被明确 @ 后回答，A/B/C 看到归属正确；不自动获得 B 私聊或资料权限。
4. B 不能移除群主；被移出后不能继续邀请，旧页面/旧请求也不能绕过。
5. 聊天文件读取回执超时后单独重试，确认不重复发送附件；中途切换会话，不串入另一会话。

上述真实账号、真实 OpenIM、真实模型项目均为待验收，未创建合成生产数据。
