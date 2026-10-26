# 联系人和Agent删除配套后台：2026-10-26

负责人在0.10.53安装包、PR113均已完成后，另行明确回复“现在升级后台”。通过已登录阿里云Workbench核对当前API/worker为acf4b711、running/restart0、公网ready200/contract0.32、约8.9GB可用空间，再固定本批产品提交 **e947fb26c42a94d5401974e11428ecbe5200245e**，叠加现有角色后台，不用整个main覆盖生产运营基线。

## 部署结果

北京时间 **12:01:00—12:01:26**完成排空、停写备份、恢复验证、显式迁移和API/worker配对切换。新镜像 **research-openim-api:contact-agent-removal-20261026**，ID **sha256:b9901ac52ec7822e04a5944cac7be464f34d6d30235b06ab42204b1ed3a85c63**；contract **0.33.0/schema027**。deploy.exit0/DEPLOY_OK，API healthy、worker running、均restart0，公网ready200；四个既有受保护接口及格式完整的新删除POST匿名均401，未替用户执行真实删除。

删除接口/逻辑删除、停止该Agent后续回复和绑定规划/定时工作、清除外部连接密钥及只解绑私人Skill的配套已进入后台。历史/既有任务/资料保留规则见[功能设计](../development/contact-agent-removal.md)。本机[0.10.53安装包](acceptcat-0.10.53.md)未重新制作，真实安装和删除体验仍由负责人检查。

## 源码、隔离检查与失败保留

- 本机与服务器固定codeload源码归档 **37,240,769字节**，SHA256 **cd8aa38c887242d9a546672dc0195447f44e2cd2c5373ea8f248f8b67b44cff8**。14文件部署包48,236字节，SHA2564166d26b59ee8c7eba22b46866e1dbf736499ebde922496af927c4026f2f2abb；解包前验证摘要、普通文件类型与限定路径。
- 离线构建前 **555份基线**摘要守卫，构建后 **15份叠加源/187份编译文件、76份角色/48份方法**核对通过，生产运营种子保持；18角色/37历史档案/19方法保持。两服务使用同一镜像，原密钥、模型/角色/私人偏好、飞书及其他功能配置不替换。
- 服务器无生产数据挂载、network none的合成隔离检查累计 **184项/16文件**。首轮15文件177项通过，外部Agent测试文件因部署包漏带support模块未加载；补齐同一提交的external-wire.ts及synthetic-external-tls.ts两个公开合成夹具、逐字摘要验证后，仅重跑受影响文件，实际7项全部通过。没有重跑通过的15文件，没有改产品/测试/预算/时限或跳过断言。
- 运维汇总初稿错误假定补充8项，测试已通过后被汇总断言阻止；按实际7项修正，累计177+7。首次汇总脚本传输被LF/CRLF摘要差异守卫拒绝，规范字节后重新验证，未执行未通过摘要的脚本。这些失败均在停写前，first-summary/首轮测试、汇总和摘要失败证据保留。
- 独立合成迁移审计演练覆盖026快照/原样恢复、027重复迁移、原有表/行/文件完整保持、新增空表及027后再次核对，未挂生产数据。最终PREPARATION_OK和迁移演练通过才进入部署。

## 备份、恢复与保全

备份 **/srv/research-openim-backups/contact-agent-removal-20261026-20261026T040103Z/research.tar.gz**；SHA256 **12d67365153c44c2c696b08f0163b9ed6f3cffc179cbb115663c4f0704efb3cd**。同ECS受限目录，未冒称异地灾备。旧备份/镜像保留，不清理用户文件。

停写时先证明没有queued/running工作，备份原库/原件及 **23份配置/密钥输入**，独立恢复逐表逐行摘要、结构、迁移历史/checksum、文件摘要/权限、完整性与外键均通过。恢复副本先验证schema026的 **103表/7原件**与原库相同，再迁移027，证明仅增加第104张deleted_personal_agents空表和第27条迁移记录；全部原表/原件/运行密钥保持。副本HTTP ready200/.33及匿名401，HTTP后再核对副本没有新增账号/会话；原库迁移前后同样核对，再启服务。

API/worker运行设置、23配置输入摘要/权限、账号/档案/私人记忆/模型默认值、飞书连接/集合和其他6服务保持。已有1个lab_shared飞书集合没有自动扩散。广场同步仍enabledfalse/statedisabled/nextCheckAt=null、11收录19候选；DSH0.2.1-rc.2/Cordis4.0.5、Harness not_verified保持，不把健康检查当作真实模型验证。

## 恢复限制与证据

schema027已经生效；旧0.32镜像严格要求schema026，即使删除表为空也不能直接启动在027数据库。保留027和新API/worker约束，采用前滚修复；禁止删除迁移记录/表来绕过检查、使旧Agent复活，也禁止回灌旧DB覆盖后续消息/任务。部署未触发回退。成功后运维复核发现原备用分支只查删除记录、未覆盖旧镜像严格schema边界，保留原执行脚本deploy-executed.sh，并将留存deploy.sh恢复守卫收紧为遇到任何027状态均保留新镜像前滚；仅维护恢复脚本，没有再次切服务或改数据库。

服务器 **/opt/research-openim/ops/contact-agent-removal-20261026**保留原始manifest/日志/JSON/迁移核对、失败修正及备份回执。Git外 **D:/deepseek-agent/.runtime/contact-agent-backend-20261026**保留准备包、源码/摘要、失败说明和三张完成截图，deployment-observed.json是按可见终端整理的回执，不冒称下载原始服务器JSON。空白中间preparation截图也保留，不作为通过证明。computer-use技能用于浏览器Workbench，未用Windows原生终端自动化。

本批只部署配套后台并维护文档，未合PR113或发布v0.10.53，公开Latest仍v0.10.52。PR113的bf97137四项GitHub检查已success，后续仅交付文档变化的检查须看实际head。未代安装/界面/真实联系人或Agent删除、真实模型/私人材料/飞书或双机验收。他人注册超时仍未定因。
