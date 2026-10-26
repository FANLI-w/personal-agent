# AcceptCat 0.10.47：私人助理大肥鱼头像

2026-10-25，北京时间。本机候选安装包，合并、后台部署及公开Release另行处理。

## 实现

从fetch后的main/fb2150b新建feat/personal-assistant-avatar，普通快进保留PR106/fc6be83和PR105单任务修复；本批产品 **0ef32388828e6f051f023a03438db86ff2c793b7**。ResearchAvatar集中按personal_agent/coordinator或本人已绑定IM身份识别，覆盖联系人列表/卡片、会话列表、聊天抬头/历史消息/详情/设置、生成中回复和已知Agent群成员。联系人未同步时可沿本人会话映射显示，不以昵称匹配，不写回旧SDK头像。真人、自建专家、外部Agent与群头像沿原逻辑。

采用作者 **YunYueSama** 的 [codex-deepseek-pet](https://github.com/YunYueSama/codex-deepseek-pet) 固定7661c8b的独立蓝发鲸鱼娘头像build/icon.png；PNG原样保存，随包本地加载，无重绘/裁切。完整自定义署名许可、上游第三方边界及来源进入public/third-party/dafeiyu，关于页提供署名。[来源与校验值](../../clients/openim/public/third-party/dafeiyu/ORIGIN.md)，NOTICE/migration同步。不引入桌宠代码、人设或台词，不改变科研助手能力、权限、任务或私人偏好。

## 实际检查

本批renderer类型、内容/链接、git diff --check通过。固定pnpm顺序执行desktop:win：两个共享包在客户端冻结安装前构建，Web/4SDK/55运行包/NSIS/4成品启动入口及check-windows-update通过。成品ASAR的头像与LICENSE.txt、ASSET_LICENSE.txt、ORIGIN.md均逐字节相同，并核对renderer引用，复制桌面摘要相同。

头像属低影响客户端改动，未新增长期镜像测试或重复完整根CI。保留的角色产品ccbc411此前787项根CI/61文件、2生产入口、60客户端及双类型通过；本批重新读取PR106/fc6be83，三环境Foundation和Windows package四项GitHub检查均success。新PR检查另记，不能把前批结果当新界面体验通过。

早期内容检查遇原样上游Markdown的相对链接，许可正文原样保存为ASSET_LICENSE.txt并注明原名后通过；补充ASAR探针首次使用正斜杠导致Windows asar提取失败，改为本机分隔符后通过，安装包未变。失败/修正记录及既有Vite/use-client/chunk警告保留于Git外日志。未代安装、原生启动、浏览器产品、真实模型/私人材料或双机体验，实际外观由负责人检查。

## 安装包

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.47.exe。
- 源包：clients/openim/release/Base/0.10.47/AcceptCat_0.10.47.exe。
- 大小：**87,793,560字节**。
- SHA256：fb69b87b2a0c7376690aec4b2c879219a136fc4ce3be20af756134e076bdb31a。
- EXE、blockmap、latest.yml及包内更新地址核对通过；尚未上传Release，旧包保留。
- 证据：D:/deepseek-agent/.runtime/personal-assistant-avatar-20261025，含baseline.json、renderer-types、content/content-final、desktop-win、windows-update.json、asar-avatar.json、early-check-failures.txt及delivery.json。

## 后台与发布

本批头像无API/worker、角色正文、契约、数据库或依赖锁变化，无数据库迁移，无需为头像部署。保留的0.10.46统一角色API/worker仍需单独升级后线上采用；本批未做后台探测/部署、合并main或公开发布。线上继续0e78530/7d75165a、contract0.32/schema026，公开Latest重新读取仍v0.10.37/422478602。十类统一Markdown角色及前台编辑保留，用户自改档案和私人记忆不覆盖。
