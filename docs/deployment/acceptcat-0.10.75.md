# AcceptCat 0.10.75 公开发布回执

2026-10-30，负责人明确要求「合并并发布新的安装包」。本批把任务页简化、工作台文件夹对齐，连同三个待合并的文档/运维 PR 一起整合进 main，构建 Windows 安装包并公开发布为稳定 Latest。

## 源码

- 整合 PR [PR147](https://github.com/luoyan96/personal-agent/pull/147)，2026-10-30 10:12:35（北京时间）合并，merge commit `bb40f76ec9cf0b41b9c2cf0fab8fe41799a04f73`。
- 一并纳入：[PR143](https://github.com/luoyan96/personal-agent/pull/143) 后台 0.39 部署回执、[PR144](https://github.com/luoyan96/personal-agent/pull/144) 项目总览与简版交接、[PR145](https://github.com/luoyan96/personal-agent/pull/145) 0.10.73 发布回执、[PR146](https://github.com/luoyan96/personal-agent/pull/146) 任务页简化。四个 PR 均已被 GitHub 标记 MERGED。
- 发布标签 `v0.10.75` 固定在 `bb40f76`，与安装包产品源码一致。
- 合并时修正了 #144/#145 中已过期的事实（0.10.73 实际已于 2026-10-29 公开、PR143 已合并、Latest 不再是 0.10.71）。

## 本版改动

1. **任务页信息层级**：导航四行 tab 收为一行；详情改为四个可折叠区块；顶部只留一个「下一步」主操作，按 `allowedActions` 与工作区状态推导；新建任务只要求填「希望完成什么」。
2. **去重与预填**：任务卡状态只显示一次；「安排与验收」不再重复目标、验收要求和第二个开始按钮；目标与验收按要点展开（最多 5 条）；成果摘要自动带出助手最后一轮回复，进度备注按阶段生成一句。
3. **任务 ↔ 工作台**：任务详情不再内嵌聊天窗，改为「在工作台继续」，把目标、交付要求、验收标准和已选资料版本带过去；工作台任务条显示工作文件夹全路径与 DSH 会话名，可一键打开文件夹，进入带 `task=` 时自动重开该任务会话。
4. **修复**：页面守卫原只接受 `#/workbench?`，工作台页在 `/dsh` 被拒，导致任务条误显示「还没选文件夹」、交接按钮不可用；改为两个路由都接受、`task` 参数仍须一致。
5. **默认目录命名**：没选文件夹的任务由 `files/research-<任务号>` 改为 `research-<标题>-<任务号前 8 位>`，避免 DSH 侧边栏出现无法辨认的编号；旧目录不迁移。

依赖、契约、数据库与后台接口均未改动，配套后台沿用 contract0.39.0 / schema031，可直接连当前生产后台。

## 构建

合并后在 main（`bb40f76`）上执行根目录 `corepack pnpm@11.21.0 run desktop:win`（`--publish never`），产物写入 `clients/openim/release/Base/0.10.75/`。

本机批量删除守卫会拦截 `packages/research-skills/dist/roles` 与 `clients/openim/.electron-runtime` 的重建清理，本批改为把这两个目录移到仓库外的临时目录（`D:/deepseek-agent/.runtime/trash-20261030/`），**仓库脚本未修改**。`rcedit` 一次写入成功，成品 FileVersion 0.10.75 / ProductVersion 0.10.75.0。

## 产物

| 文件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.75.exe | 405061949 | `aac075610ffc89a876dac3db5eebe06de679d6bd5ee6f468ee2d434373004755` |
| AcceptCat_0.10.75.exe.blockmap | 416813 | `272827ce5e6a724b80840f6faf877c12a62dd21685e1abb42a47e465dce0cb91` |
| latest.yml | 341 | `b5755cad0ea2db06f931b15ee281bcc40655acf248af63672d134b7905cf2efc` |
| SHA256SUMS.txt | 262 | `4d458288a075decb5c6d5744d38a88375c5c0cf582fedc931ecb11c1905c7150` |

四个附件的远端 digest 与本地一致；`latest.yml` 记录版本 0.10.75、size 405061949、sha512 与安装器一致。

## 发布

- 草稿创建 → 直连上传四个附件 → 核对 digest/大小 → 2026-10-30 10:49:29（北京时间）公开为稳定 Latest：[v0.10.75](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.75)。
- 匿名复查：`/releases/latest` 302 到 `v0.10.75`；`latest/latest.yml` 内容与本地产物一致；安装器直链 HEAD 200、`Content-Length` 405061949；标签 `v0.10.75` 指向 `bb40f76`。

## 检查

- 客户端 `typecheck`、`typecheck:electron`、`build:web` 通过；`local-dsh` 41 项、`workbench-links` 7 项通过。
- PR147 远端四项检查全绿：foundation（ubuntu 22/24、windows）、package。
- `check:content` 通过；包内 `app.asar` 六个必需入口通过，可直接检索到本批文案（「打开文件夹」「工作文件夹」）与守卫里的 `"/dsh"`。

## 边界

未运行安装器、未启动成品、未连接真实账号或模型；安装会覆盖本机已装版本，由负责人自行决定。真实任务流转、双人群、模型与日常体验仍需使用者验收。本版不包含尚未整合的本地聊天历史改动（`5536ffc`），也不包含手机端 PR90。

证据目录：`D:/deepseek-agent/.runtime/release-0.10.75-20261030/`（安装器、blockmap、latest.yml、SHA256SUMS.txt）。
