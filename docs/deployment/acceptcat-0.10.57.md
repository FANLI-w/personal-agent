# AcceptCat 0.10.57 本机候选

2026-10-26，图片与文字右键操作修复。从main/c3f7d0f新建fix/chat-image-context-actions，产品及安装包源码 **0a2afb629b4315cb6c6867a2db45a40490dcba0d**，后续交付文档不改变包内产品代码。[PR118](https://github.com/luoyan96/personal-agent/pull/118)待审，未合main。

## 交付

- 图片气泡、放大预览和待发送图片：复制图片、另存为、Windows本机提取文字；消息引用继续保留。预览工具栏提供复制与另存入口。
- 文字消息：复制整条消息文字，或仅复制当前消息内的选中文字。图片/文件/语音的占位词不再作为可复制文字。
- 保存原图字节和格式，取消文件对话框不写入。提取文字只在本机展示与复制，不自动发送Agent。[实现与边界](../development/chat-image-context-actions.md)。

## 检查与成品

相关客户端 **61项/8文件**通过，包含新增 **19项**；最后小调整后19项再次通过。renderer与Electron类型通过，内容及diff检查通过。新增检查接入Windows CI，GitHub实际状态另看PR，不能将本机检查冒称远端CI已完成。没有共享/API/角色变化，本机未重跑根完整CI。

根入口 **corepack pnpm@11.21.0 run desktop:win**成功：根冻结安装→contracts及research-skills构建→客户端pnpm10冻结安装→工作区/工具守卫→Web/Electron/NSIS（publish never）。构建日志确认图片桥及纯格式JS进入dist-electron；既有Web资源和4项成品启动入口守卫通过。随后check-windows-update.mjs核对本地版本、EXE/blockmap/latest.yml与SHA512一致；其输出的provider只是更新配置，不表示已经公开上传。

**C:/Users/luo/Desktop/AcceptCat_0.10.57.exe**，**88,218,163字节**，SHA256 **7afb5b71e594dd20a5ca886fb34514c46b450edff35b2be8570dca4b2676c8b3**。与构建目录的摘要一致，旧包保留。源码内与桌面包均为0.10.57；安装包、blockmap、latest.yml和证据保留Git外。

初次16项中一个测试因VM/宿主Error跨realm而失败，修正测试环境后通过；一次共用TS模块引发renderer TS6305，改为单一JS实现及.d.ts，双类型和61项重新通过。失败类型日志、测试说明、完整构建/更新检查和安装包回执在 **D:/deepseek-agent/.runtime/chat-image-context-20261026**。

本批**未执行安装器、产品UI、真实系统剪贴板/保存窗口、私人材料或真实模型体验验收**，按负责人要求由本人检查。自动测试使用合成数据与模拟原生桥，构建成功不代表上述实际体验已验收。

## 发布与后台

此为本机候选，**没有发布v0.10.57、上传Release或覆盖公开更新清单**，公开Latest仍为v0.10.56。没有后台、共享契约或数据库改动，无需后台升级；沿用已记录的7720ec9b / contract0.33/schema027。本次没有部署、重启或迁移，保留同事任务与此前资料、课题组、通讯录功能。
