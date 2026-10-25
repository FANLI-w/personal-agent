# AcceptCat 0.10.48：聊天返回、简化操作与未读提醒

2026-10-25，北京时间。负责人要求一起修复消息入口总回个人助理、辅助小字拥挤以及缺少消息提醒；本批只交付客户端候选包。

## 代码与行为

从最新main/fb2150b另开fix/chat-return-and-notifications，普通快进PR107/fe79016，保留统一角色、单任务创建和大肥鱼头像及既有同事聊天、资料/课题组功能。本批产品 **e4c411fc2fc4027c42790780b2e80f1e3a6e33f4**。

原QueryChat卸载会清理currentConversation，而消息入口只进/chat，入口Hook因此再次默认打开个人助理。现在实时选择和lastConversationID分开：点击侧栏“消息”直接恢复本次登录上次聊天；置顶不改变记忆，SDK刷新不抢选择。登出和删除对应会话清除记忆；不把会话历史或联系人标识新增持久保存到本机文件。

聊天去掉联系人介绍、重复助手名和输入框底部快捷键小字，把协作、文件报告、索取同事资料放入“更多”，保留实际授权/报告/协作操作。没有可用扩展动作时不显示空菜单。聊天抬头改紧凑单行，列表名称/摘要调大、日期缩短，避免长日期挤掉姓名。文件读取范围、失败状态等真实回执继续保留。

原已读检查只判断会话和SDK连接，没有判断窗口焦点，可在后台清掉未读。现在仅可见且有焦点的当前聊天标已读，焦点/可见性恢复再检查；离开页面卸载监听。SDK总未读同步侧栏角标和新增受限桌面IPC，Windows任务栏显示红点，后台未读增加调用flashFrame，已有窗口focus监听停止闪烁、未读归零清除覆盖图标。全局免打扰不触发桌面提醒，单会话免打扰沿SDK统计，不自行累加数量；旧计数查询不能覆盖更新事件或另一个账号。

IPC只接受当前主窗口、同源主框架和非负安全整数，不发送正文、联系人、头像或外部通知内容。使用已固定Electron22的setOverlayIcon/flashFrame及原有focus处理，无新依赖。[Electron接口](https://www.electronjs.org/docs/latest/api/browser-window#winsetoverlayiconoverlay-description-windows)，[闪烁接口](https://www.electronjs.org/docs/latest/api/browser-window#winflashframeflag)；实际颜色/呈现由Windows和系统设置决定。SDK免打扰统计行为参考[官方实现](https://github.com/openimsdk/openim-sdk-core/blob/main/pkg/db/conversation_model.go)，未复制其源码。

## 实际检查

- 27项客户端代码级隔离回归通过：6项新增覆盖保留/清理会话记忆、迟到计数、窗口焦点与已读、模拟Windows覆盖图标/闪烁调用、IPC拒绝和渲染端订阅/全局免打扰/清理；原置顶/免打扰/删除/导航/引用恢复、文件选择与报告流程保持。
- 文件/报告回归包含合成本机HTTP/SQLite与选定临时文件，入口日志client-final2.log指向其实际Git外证据目录；没有运行真实模型或读取用户材料。
- renderer/Electron双类型、9项构建守卫、内容/链接和git diff --check通过。根共享代码和角色/Skill未变，本批未重复完整根CI；前批PR107/fe79016三环境Foundation与Windows package四项重新读取均success，新PR结果另计。
- 固定pnpm冻结顺序：两共享包先构建，再客户端安装、Web/4SDK/55运行包/NSIS与4启动入口、更新清单通过。ASAR通知模块、IPC注册与preload三文件逐字节核对，renderer通知引用、新原头像及3份署名文件核对通过。
- 未代安装、原生启动、浏览器产品、真实双机收信/任务栏闪烁、真实模型/私人材料或界面效果验收。模拟Electron调用只能证明程序逻辑，系统实际提醒和体验由负责人安装查看。

## 安装包与实际状态

桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.48.exe**；源包clients/openim/release/Base/0.10.48/AcceptCat_0.10.48.exe，**87,798,284字节**，SHA256 **c55ff31af665002cafa78869efb612f2ad7279fa08de670929370f1bf309c389**。桌面复制摘要一致，旧包保留；EXE、blockmap、latest.yml和包内更新地址核对通过，没有上传Release。

证据：D:/deepseek-agent/.runtime/chat-return-notifications-20261025，包含product-revision、client-final2、build-guards、renderer-types-final2、electron-types、desktop-win、windows-update.json、asar-chat.json、delivery.json和前批PR107检查回执。前期代码检查与最终检查均保留。

本批仅客户端和Windows CI，无API/worker、契约、数据库、角色正文、锁文件或数据迁移，无需为本批部署。前批角色API/worker仍需单独升级后线上生效。线上沿0e78530/7d75165a、contract0.32/schema026；本批未合main、公开发布或部署，公开Latest重新读取仍v0.10.37/422478602。
