# Windows 0.10.20：飞书只读接入候选包

2026-10-20，产品代码固定 **2bbcfbce2e369fe8b64a92caf0dd22350a22b870**，分支 `feat/feishu-readonly-pilot`，从干净0.10.19/b497bde接续。实现见[飞书选定文档试点](../development/feishu-readonly-pilot.md)。

在资料与素材库连接本人飞书，预览选定新版文档或知识库内新版文档的纯文本，确认保存到私人集合；可选一段连续原文带入新的任务规划对话，编辑并发送后继续规划，正式任务仍需确认。个人Agent通过已有集合显式绑定读取副本，不随导入自动获得资料。原文继续在飞书维护，没有整库同步、文档写回或群消息。

**Windows x64 NSIS候选安装包已制作并复制桌面** `C:/Users/luo/Desktop/AcceptCat_0.10.20.exe`，**87,422,226字节**，SHA256 **7abe46bad498dd58eac626b4325d8f966c666d83e38454d8de00909dca2eb9ad**。未代安装、关闭现装、删除旧包或改用户数据。保留同一安装身份、Electron22.3.27与55个装配运行包。

生产17JS/8CSS与ASAR逐字节一致，ASAR顶层52个运行包均核验；飞书入口与旧模型预览/规划/课题组功能在载荷中，QA合成内容与接口未混入生产。ASAR SHA256 **a2d8bcb54ec37725adcc7a06bfc777e2e09269d152483cdfaede21fecb2ead7d**。实际NSIS内的EXE/ASAR与受测目录匹配，EXE SHA256 **6d2bd192942ddaa30f7b59222b987011db655a09765057ceb39917fc6f687500**。隔离数据目录、隐藏窗口启动出现OPENIM_ELECTRON_READY，原生冒烟通过；旧electron-log重复initialize警告保留。

693项/55文件CI、2项生产CLI/HTTP、构建/类型/契约/缺DB与进程检查通过；客户端类型、6项规划helper和实际React/HTTP/SQLite合成飞书流程通过。证据在Git外 `.runtime/feishu-pilot-20261020`，含首败、迁移夹具修复、最终CI、构建、真实安装载荷、启动与界面截图。合成提供方不等同飞书真实组织联调，没有真实模型或私人资料试读。

**代码、候选安装包已完成；后台未部署，飞书应用未上线，AcceptCat未公开发布。** 后台新功能需contract0.26.0与schema023，三张新增表，服务启动不会自动迁移；API/worker须配对更新。用户已独立批准的飞书企业自建应用与三项用户身份只读权限、精确回调已配置，App Secret仍留飞书后台，尚未引入服务器或绑定真实用户。试点范围只准备本人，不面向全机构发布。

部署须另行同意：先备份和恢复副本演练，再验证schema022→023旧表/原件/凭据不变，配对更新API/worker，挂载服务器受限App Secret文件后验证OAuth。沿用生产原公共目录种子，不把候选分支的独立目录变化一起上线；旧镜像不能直接启动在schema023库上，回退必须先停写并根据实际数据状态决定，不盲目覆盖新业务数据。

本次只做公网readiness检查，返回contract0.25.1、database/storage/authentication ok、Harness not_verified。旧镜像和schema022的准确已部署组合仍见[Key预览部署](key-preview-20261020.md)。GitHub latest实际再次核对仍为v0.6.0，未创建Release、上传包、改更新源或公共目录。
