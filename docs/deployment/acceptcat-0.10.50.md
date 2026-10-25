# AcceptCat 0.10.50：工作台界面精简

2026-10-26，北京时间。本机Windows候选安装包，负责人检查实际安装体验。

## 本批修改

从fetch后的main/fb2150b新建fix/workbench-copy-cleanup，普通快进保留PR109/1e07441（含PR108/107/106/105）。产品提交 **690a86983820a807c04fd1a7e02d9549eedfa956**。

按截图移除工作台副标题、研究方向副标题、空任务解释、整个“任务范围与进度说明”、规划助手闲置介绍及输入区模型设置和快捷键小字，并删除闲置样式。标题、任务筛选和操作保留；发送/停止按钮、键盘发送、真实回复状态、连接/错误/授权及创建回执保持。模型设置仍在“我的”页面，角色档案/私人偏好、任务创建逻辑和已有任务均未改变。

前批恢复上次聊天、未读通知、同事角色、单任务、大肥鱼头像及应用图标和完整署名保留。本批无API/worker、契约、数据库、默认角色正文或依赖锁修改，无迁移或后台升级需求。

## 实际检查与安装包

renderer/Electron双类型、38项现有规划/依赖回归通过；Windows冻结顺序先构建两个共享包，再冻结安装客户端，Web/4SDK/55运行包/NSIS/4启动入口及更新清单通过，未使用force安装。ASAR确认五处被删除说明不在renderer、发送入口仍在，六份公共图标、renderer图标和3份署名文件逐字节一致。

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.50.exe。
- 源包：clients/openim/release/Base/0.10.50/AcceptCat_0.10.50.exe。
- 大小：**88,155,412字节**；SHA256：**555ddfb2bab93ff1a1acec5064ac8a4961a03b2a942134ba0ddbeb9e6953067b**。
- 桌面复制摘要一致，旧包保留；EXE/blockmap/latest.yml及包内更新源检查通过，未上传Release。
- Git外证据：D:/deepseek-agent/.runtime/workbench-copy-cleanup-20261026，含双类型、planner-regression、desktop-win、windows-update、asar-inspection、delivery及GitHub状态记录。

内容/链接及git diff --check通过。低影响界面删减未新增镜像测试或重跑完整根CI；未代安装、原生启动、浏览器产品、真实模型、私人材料或双机体验，没有把包内资源检查视为实际观感验收。PR回执另记。

## 合并、部署与公开发布

重新读取PR109/1e07441与PR108/a670787的四项GitHub检查均success，前批Windows超时和重跑记录保留；本批PR检查另计。没有合main、公开Release或后台部署。前批统一角色API/worker仍需单独升级，线上继续0e78530/7d75165a、contract0.32/schema026；公开Latest重新读取仍v0.10.37/422478602。

[PR110](https://github.com/luoyan96/personal-agent/pull/110)已创建并挂接，OPEN/MERGEABLE，目标main；首次读取head7242876四项GitHub检查in_progress，未宣称通过。回执github-created.json保留，未合并、发布或部署。
