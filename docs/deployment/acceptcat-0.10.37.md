# Windows 0.10.37：任务拆解、依赖图与构建修复公开版

2026-10-24，北京时间。负责人明确要求把构建优化与同事新提交一起合入main，并将Release设为最新版。本批完成源码合并、Windows本机交付及公开Latest；后台未部署。

## 整合与审阅

从fetch后的主仓库main **6c73af66cd7ba41bbee4c897415984fa8150e377**新建`release/acceptcat-0.10.37`，普通merge [PR93](https://github.com/luoyan96/personal-agent/pull/93)固定head **3290691a5e5d6b4bf8b70d62568154d4b4821688**与FANLI-w的[PR92](https://github.com/luoyan96/personal-agent/pull/92)固定head **18bb7483986b7855b62c37f9d324ca7bc42860f8**，分别为23f3122/732e6af，保留作者和全部提交。产品 **4c6ea18b5f31370ebac2f1af93e22c1fe5add785**，后续 **d4eb38ef97e036768841a241a18d6a3a2d69fb71**仅补文档/评价情境，不改变打包输入。

保留PR93的两共享包先构建、link依赖、固定包管理器/工具链、Husky monorepo边界及成品守卫；纳入任务拆解Skill、前端规划prompt和按前置顺序分层的依赖图。既有聊天、独立资料、课题组创建/邀请及PR91同组本机原件互传保留，无新第三方版本、业务接口、数据库迁移或后台源码改动。

审阅实际发现原planner-chat直接导入Vite原文别名，Node规划检查ERR_MODULE_NOT_FOUND；保留`planner-before.log`后，将原文导入留在UI，通过参数交给纯规划函数。方法建议仍使用原Plan字段、分工授权与8000字符预算。图新增循环/自引用/失效引用/重复ID提示，以Map避免特殊ID问题；橙色明确为待认领，尺寸变化重画箭头，实例marker和观察器分别管理。`evaluations`声明模型行为情境；结构测试不代替真实模型方法质量评价。

## 实际检查与main合并

- 本机最终根`pnpm run ci`通过：762项/59文件，另2项生产CLI/HTTP、B0及生产无夹具边界；canonical Skills共11份。
- renderer/Electron双类型与36项定向检查通过：原规划/创建与取消边界、真实Skill文本注入、5项图结构边界、原task-planning以及构建守卫/service/auth。最初Node导入失败保留，没有放宽断言或时限。
- 根`desktop:win`完整冻结准备/两共享包构建/客户端安装/生产Web/4SDK/55运行包/NSIS通过，成品ASAR4入口和安装器/更新清单版本、大小/SHA512、blockmap及公开更新源核对通过，未使用force安装。
- [PR94](https://github.com/luoyan96/personal-agent/pull/94)受审d4eb38e的[三平台Foundation](https://github.com/luoyan96/personal-agent/actions/runs/40055625514)与[干净Windows打包](https://github.com/luoyan96/personal-agent/actions/runs/40055625506)四项success后才合并。首轮产品4c6ea18两工作流也成功，未手动重跑已通过检查。

北京时间 **10:56:12**，PR94使用merge方法合入main，提交 **8dba29fb6715269ff3ef0bee5f26867f5ae3d050**，父提交为原main/6c73af6和受审head/d4eb38e；合并树与受审树逐文件相同。两原PR head、同事PR86聊天提交和原main均为祖先，无强推、squash或整文件覆盖。PR92/PR93于 **10:56:14**自动标记MERGED，本地main普通ff同步。后续文档不改变发布tag或成品。

## 本机与公开交付

桌面 **C:/Users/luo/Desktop/AcceptCat_0.10.37.exe**，87,410,751字节，复制后核对SHA256；原0.10.35/0.10.36和负责人提供的同事干净构建成功0.10.35附件保持。

北京时间 **10:59:09**，Release **422478602** / [v0.10.37](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.37)公开、非预发布并设为Latest；tag固定合并提交 **8dba29f**。先建唯一草稿、上传后校验四附件，再公开。按tag读取草稿一度404，列表/id确认草稿存在后继续，没有重复创建或覆盖附件；原响应保留。

| 附件 | 字节 | SHA256 |
| --- | ---: | --- |
| AcceptCat_0.10.37.exe | 87,410,751 | ecc17405bb3bf5e12ee7a28e934668dbce039b05ffbcc6482f3a2ae8d9529225 |
| AcceptCat_0.10.37.exe.blockmap | 91,395 | ba1064959055d07759c92cbb69c636d84fb8ecbfe389b23309fcb3b301e426ce |
| latest.yml | 340 | dffc04f39d63fd52a6b1146650af20297a1bed282b489b9ec04656609c27c072 |
| SHA256SUMS.txt | 265 | 2fa3e87379eca799e40a46b4fb68a0aaac869f7a8214f8025046afb314dd8d06 |

GitHub四附件均uploaded，size/digest与本机一致。未登录公开latest API实际返回v0.10.37/同一Release，公开latest.yml和SHA256SUMS逐字节与本机相同；未下载或运行87MB安装器作额外安装验收。旧Release和草稿保留，更新源仍公开GitHub Releases，无新凭据。

Git外 **D:/deepseek-agent/.runtime/release-0.10.37-20261024**保存初始Node失败、根/客户端/打包/内容日志、成品更新核对、PR94全成功回执、前后树/祖先保全、Release草稿/上传/公开与未登录下载回执及delivery.json。产物、证据与私人资料均不入Git。

## 后台与验收边界

本次没有后台部署、重启、迁移或新线上探测，沿前批已部署 **contract0.30.0/schema026**、镜像 **sha256:2677f6936ae5ff05c229a88a8a5c161c0f06570cb77096d57f60349d4304423c**，DSH0.2.1-rc.2/Cordis4.0.5与广场同步关闭记录，详见[资料互传部署](peer-library-20261023.md)。新拆解方法从桌面prompt进入，不声明后端Skill已升级。

按负责人安排，未追加浏览器产品/界面、真实账号/资料/模型、原生安装启动或双机直连验收；NSIS“无法关闭”循环未实际复现，构建修复和发布成功不等于该现场故障已验证消失。资料互传仍需双方在线并切同组，每份10MiB，无TURN/云原件兜底，NAT穿透不保证。飞书仍本人试点，入组不自动共享私人授权；注册超时未定因，负责人交接/解散边界保持。
