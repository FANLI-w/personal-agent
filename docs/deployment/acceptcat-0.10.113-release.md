# AcceptCat 0.10.113 正式发布回执

Windows x64 正式版 0.10.113 已发布。[发布说明](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.113) · [PR #229](https://github.com/luoyan96/personal-agent/pull/229)。团队资料显示所连 Git 仓库的根目录与子目录；清单外的新文件在同步后可见。 正式构建 fc2cc2f。55 项资料测试和四项 PR 检查通过。Windows CI 曾在长缓存路径读取目录时失败，修正 Git 目录参数后使用相同场景通过。正式包全新缓存实读 luoyan96/files 的 main，并比对目录与读取 README；上一轮登录态界面验证包含目录导航及正文预览。已从安装包解出并核对 137 个编译文件，打包启动通过。公开 release 的四项附件均与本机 SHA-256 一致。安装包 SHA-256 为 2c699f1e1c7388bfe82e966d13089c7722467026bb8d970bd390099fefd314bc。本次仅更新客户端。构建、测试和初始失败记录见本机 D:/deepseek-agent/.runtime/release-0.10.113/。
