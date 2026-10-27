# AcceptCat 0.10.60：图片与正文统一发送

产品/安装包源码 **fc9d51112464d72364f70ba77a6e5be47d551ecb**，从main/d70cd64新建fix/unified-chat-attachments，[PR122](https://github.com/luoyan96/personal-agent/pull/122)待审，未合main。[行为与恢复边界](../development/unified-chat-attachments.md)。后续交接文档不改变产品，不据文档提交重复打包。

选择、粘贴或拖入图片后，图片缩略图和正文使用同一主发送按钮/Enter；仅图可发，不再另点发送图片。工具栏移至输入框底部。真人/群聊仍为SDK原图及文字消息，不宣称原子事务或同一气泡；本机Agent普通私聊将多图本机OCR文字和用户问题合成一次已有文件请求。仍为OCR文字能力，未新增视觉模型或群图片/外部附件转发。

## 安装包

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.60.exe。
- 构建目录：clients/openim/release/Base/0.10.60/AcceptCat_0.10.60.exe。
- 大小：**88,220,838字节**。
- SHA256：**732261095dbb34247d2a72356f3c3e1c3356185f8566743536e2ebef2ef2bbd7**。
- 桌面副本与原包摘要一致，旧0.10.59等包保留。publish never，没有创建公开Release、tag或上传更新资产；当前公开Latest核对仍v0.10.56/423959199。

## 实际检查

相关77项/9文件、renderer/Electron双类型、376份Markdown/19技能内容检查通过。新增管线覆盖整批顺序、逐图回执与原SDK标识重试、OCR失败恢复、切换会话、图片空正文、刷新缺原图拒绝和已准备请求重放；存储测试覆盖File/中间OCR不进入sessionStorage及换账号清理。首轮30项通过后扩展相关检查；首次renderer TS2322已收紧实际文字请求返回类型并修复，原失败保留。

根desktop:win按固定pnpm版本、冻结锁文件和共享包先build顺序完成，未使用force。Web资源完整性、固定Electron22.3.27/electron-builder23.6.0组件、NSIS、既有4项入口及本地更新元数据守卫通过。构建中的第三方use client/bundle体积提示保留在日志，构建退出0。客户端改动没有本机重跑根822项；远端检查以PR实际head为准，不能把已部署后台的822/130项冒称本批重跑。

Git外D:/deepseek-agent/.runtime/unified-chat-attachments-20261027保存typecheck-attempt1、最终类型、相关测试、desktop-build与退出码、installer-receipt和PR依据。未执行安装、产品UI、原生剪贴板/图片保存、真实SDK送达、真实模型或私人图片验收，体验由负责人检查。

## 后台与权限

本批没有API、共享契约、角色或数据库改动，沿用已部署798f77c / sha256:28ee6231937556fda148308d9ee8576e859e7f0595fd99b50e1cca3af6874e21 / contract0.34/schema027，无迁移、无需升级后台。没有重启服务、改变文件授权或新增自动转发；原图仅在明确点击发送时交给原SDK会话。代码合并和公开发布另行处理。

## 合并与公开发布准备

负责人本轮已明确授权。原head b3721b5的Linux两项和Windows打包通过，Windows Foundation819通过/3个既有foundation磁盘迁移/HTTP用例超过默认5秒；本机复核也有HTTP一项5.7秒超时。仅这三项测试等待上限改为20秒，保留断言和生产时限，随后同文件10项通过。原失败及回执保留Git外release-0.10.60-20261027。测试/文档改动不改变安装包产品fc9d511，不重新打包；最终head CI、合并和公开结果另记，计划tag固定原包源码fc9d511。

## 实际合并与公开回执

2026-10-27 **16:32:23（北京时间）**，PR122以 **8b67e93a85dccd547abf89dc7d8a362b7519ef9d**合main，受审head **f9bacaed450c0e0bbf9e99afd76666cefa7e48ba**四项检查全部success，Windows根822项/64文件通过。普通merge保留提交与同事归属，合并树一致，本机main已快进。首次失败、定向复核失败与修正后10项全部通过日志保留；修改范围仅三个测试用例的有限等待上限，无运行时代码或安装包变化。

**16:34:22（北京时间）**公开[v0.10.60](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.60)，Release **425192746**，非草稿/非预发布并设为Latest。tag固定实际包源码 **fc9d51112464d72364f70ba77a6e5be47d551ecb**；[安装包直链](https://github.com/luoyan96/personal-agent/releases/download/v0.10.60/AcceptCat_0.10.60.exe)。先创建唯一草稿并上传核验四附件，代码合并后才公开；没有覆盖旧版本。匿名Latest API、tag源码、公开latest.yml及SHA256SUMS逐字节摘要检查通过，没有下载运行EXE追加原生验收。发布后仅跟进下载入口和交接文档。

| 附件 | 字节 | SHA256 |
| --- | ---: | --- |
| AcceptCat_0.10.60.exe | 88,220,838 | 732261095dbb34247d2a72356f3c3e1c3356185f8566743536e2ebef2ef2bbd7 |
| AcceptCat_0.10.60.exe.blockmap | 92,374 | 98892b581062f3494c2143fa065fdab4160bdb62e55b84eac4fff63738aaee8c |
| latest.yml | 340 | 86f11d136050f6684f419227f323acee2f8a7adaa1f8127849c32ed23d4b92c6 |
| SHA256SUMS.txt | 262 | 85a5cea3007ef8e75a18ff24214893ae4cacc1d4ff59ceef0b29b075895db297 |

Git外release-0.10.60-20261027保留原始CI失败及最终成功、定向10项、同一草稿/公开JSON、四附件摘要及匿名核验文件。GitHub连接器没有二进制上传入口且既有写权限受限，使用本机已有gh登录完成合并与发布；未新增凭据或权限。没有后台操作，继续798f77c/28ee6231/contract0.34/schema027；未代安装、产品UI、真实SDK/模型或私人图片验收。
