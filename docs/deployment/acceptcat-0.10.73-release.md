# AcceptCat 0.10.73 发布回执

2026-10-29，负责人明确要求公开 Release。本批只发布已经构建并整合的 Windows0.10.73，不重新编译产品、部署后台、合并其他PR或安装用户客户端。北京时间 **20:18:11** 已公开稳定Latest [v0.10.73](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.73)，Release ID **427820358**。

## 发布来源

[PR142](https://github.com/luoyan96/personal-agent/pull/142)已普通合并PR129、139、140、141，合并提交为 `ea7350ff75847c9af6ff5c0b96b83b006e436517`；四项受审head远端Foundation/Windows打包检查均成功。发布标签固定安装器实际产品源码 `79aaef163a50d7e26e180d1760fb91c6967633a7`，至合并提交只增加测试与交付文档，没有客户端运行代码变化。详细范围及原检查见[整合与安装包](acceptcat-0.10.73.md)。

本机再次核对现有成品SHA256及更新清单SHA512/大小，未重新打包。四附件先上传草稿，远端大小/摘要通过后才公开为稳定Latest；旧版保留。

20:18:23完成公开复查：四附件均为uploaded且远端SHA256/大小与本机逐项一致；匿名GitHub Latest为0.10.73，公开标签指向实际产品源码；未登录下载latest.yml与SHA256SUMS.txt的内容摘要一致，安装器公开HEAD为200、Content-Length为405064574。更新清单中的安装器SHA512与本机成品一致，既有成品更新源指向公开GitHub Releases。没有代用户触发下载更新或运行安装器。

| 附件 | 字节数 | SHA256 |
| --- | --- | --- |
| AcceptCat_0.10.73.exe | 405064574 | `acf55e015f87f6ce9ff4216c0ca6b79dabb3b872fc6d1989392bbc270968fbe9` |
| AcceptCat_0.10.73.exe.blockmap | 417673 | `52d3e03c3d522347eaf6314436dc7da8b150d36d805610431a10b95416172678` |
| latest.yml | 341 | `dd739485c2bb1db82cb23292762b75c510f3ed4e0cb6a9e58814de48a2059e8d` |
| SHA256SUMS.txt | 262 | `4736cc83d4a5411577f0b3adb6a1b59f6fc5dd1dcece302fb61207d40a97593f` |

## 后台与验收边界

发布前公网ready实际为contract0.39.0，数据库/存储/认证ok，harness仍not_verified。此前配对部署API/worker与031迁移已完成，镜像c12e3e42；完整部署记录在[PR143](https://github.com/luoyan96/personal-agent/pull/143)，本批不重复部署或迁移。公开网页资产未同步替换，原客户端兼容读取保持。

安装包含群身份与待接受邀请、任务转交、依赖展示、DSH原生文件/PDF预览和任务往返。内置DSH0.2.1-rc.3、Electron43.8.4；原生模型与推理菜单保留。真实私人材料、付费模型、多账号与双机科研体验仍由使用者验收，不以公开发布代替验收。

未纳入本地聊天历史WIP5536ffc、手机PR90或文档PR144。运维记录和总览文档分支的合并状态不会改变本安装包运行代码，不能因本次公开版本就声称本地历史已完成。

本机产物和发布证据位于 `D:/deepseek-agent/.runtime/release-chat-workbench-0.10.73-20261029`；安装包在 `windows/`，不提交Git。

证据包括release-notes.md、release-draft-verified.json、release-public-verified.json与公开下载的两个小附件。405 MB安装器使用直连上传，等待完成后才校验和公开；没有暴露缺少安装器的草稿。本批只执行发布核验与文档检查，不重复已经通过的产品CI。

发布文档检查通过：540份Markdown、19份方法定义，git diff --check通过；文档分支不包含产品改动。
