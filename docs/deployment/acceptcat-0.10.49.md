# AcceptCat 0.10.49：大肥鱼应用图标

2026-10-25，北京时间。本机Windows候选安装包；负责人要求应用图标也使用私人助理同款大肥鱼。

## 代码与来源

从fetch后的main/fb2150b新建feat/dafeiyu-app-icon，普通快进保留PR108/a670787（含PR107/106/105）的聊天返回/通知、统一角色、单任务与私人助理头像。本批产品 **5b441ffcf5394c095a26ee0ad195359188e5981d**。

作者YunYueSama，[codex-deepseek-pet](https://github.com/YunYueSama/codex-deepseek-pet)固定7661c8b的build/icon.png及build/icon.ico原样使用，无重绘/像素修改。ICO含16/32/48/256px四档，用于Windows应用、安装/卸载/快捷方式、窗口/任务栏及托盘；NSIS安装、卸载与页头显式指定该ICO。PNG用于标题栏、登录/关于/启动页、Mac/Linux图标、托盘资源和README；非Windows托盘显示时适配20px。源文件、摘要、完整自定义许可及上游第三方边界见[来源](../../clients/openim/public/third-party/dafeiyu/ORIGIN.md)，关于页署名同步。

AcceptCat名称、appId、package.name、账号、用户数据目录和GitHub更新源不变，不采用上游桌宠程序或人设。历史Catnap橘猫来源和报告保留，仅描述旧版。

## 实际检查

renderer/Electron双类型、内容链接和git diff --check通过。冻结顺序两个共享包先构建、客户端冻结安装、Web/4SDK/55运行包/NSIS/4启动入口及check-windows-update通过。实际程序EXE和安装EXE均解析到四档图标资源组，位图摘要逐字节匹配原ICO；ASAR六份公共图标、renderer打包PNG及3份署名文件原样核对，版本0.10.49和原package.name保持。

ICO已在Git外只读解码查看，原始资源未修改。补充EXE探针首次生成Python时包含错误NUL转义、解析失败，保留记录并修正探针后通过，应用代码和包未因此变化。

图标属低影响资源改动，未新增镜像测试或重复完整根CI。读取前批PR108/a670787发现三项success、Windows Foundation原长对话用例30000ms超时（786通过/1失败）；本机原条件复核该文件7项通过，未提高时限或删除断言，原失败保留。该Windows job已重新派发，attempt2首次读取仍in_progress，不能视为成功；新PR检查单独记录。

未代安装、原生启动、实际桌面快捷方式/任务栏/托盘显示或图标缓存验收，没有删除系统缓存、修改已安装程序或旧快捷方式。卸载器已配置同图，但没有实际安装/卸载核验；Mac/Linux只更新资源与托盘显示代码，未打包或运行验收。

## 安装包与状态

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.49.exe；源包clients/openim/release/Base/0.10.49/AcceptCat_0.10.49.exe。
- 大小：**88,154,141字节**；SHA256：**5565fe5a58d66673b0426ddcc3c392e42416dbc5cc683282c90d64a25b0596d4**。桌面复制摘要一致，旧包保留。
- EXE、blockmap、latest.yml和包内更新源核对通过，尚未上传Release。
- Git外证据：D:/deepseek-agent/.runtime/dafeiyu-app-icon-20261025，包含source-assets.json、renderer-types、electron-types、desktop-win、asar-icons.json、exe-icons.json、windows-update.json、delivery.json、只读图标预览、早期探针记录、PR108失败/重跑与dialogue-context-recheck原时限7项结果。

本批无API/worker、契约、数据库、角色正文或依赖锁变化，无迁移或后台部署需求；前批角色API/worker升级仍需单独处理。尚未合main、公开Release或部署，线上0e78530/7d75165a、contract0.32/schema026及公开Latest v0.10.37/422478602保持。
