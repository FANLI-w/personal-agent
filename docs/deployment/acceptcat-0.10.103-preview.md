# AcceptCat 0.10.103 本机试用记录

日期：2026-11-12（北京时间）。本批于11月11日开始，负责人选择第一张完整页面图稿后实施。**已构建并放到桌面，未代安装、未真实私人账号/模型验收、未合并 main、未公开 Release、未部署后台。**

| 项目 | 结果 |
| --- | --- |
| 固定产品源码 | `de2e29d4e0eb0cb618bdf591b46905bf498ccd89` |
| 功能分支 / PR | `feat/lab-rules-planning-pages` / [PR201](https://github.com/luoyan96/personal-agent/pull/201) |
| 本地安装包 | `C:/Users/luo/Desktop/AcceptCat_0.10.103.exe` |
| 构建原件 | `D:/deepseek-agent/acceptcat-group-invite-fix/clients/openim/release/Base/0.10.103/AcceptCat_0.10.103.exe` |
| 大小 | 421237693 字节 |
| SHA256 | `a460c682f0876eab55e9e24b215f0e97af31d43b0c034aa9018d46b2b67d8a11` |
| 包内 / PE 版本 | `0.10.103` / `0.10.103` |
| 线上保持 | Windows Latest0.10.100；后台0.45/034，无本批服务代码变化 |

## 改变的体验

规范不再从页脚打开巨型混合抽屉：资料侧栏提供可发现的主入口，规则列表/阅读区、平台只读、PPT模板和可复用方法分别访问；独立编辑窗口保留失败正文、allowedActions和expectedVersion。生效记录不重复确认，短时保存回执可关闭；本地文件夹设置回到本地资料与索引入口。

计划记录改为完整页面，默认显示草案；搜索明确限本页、可分页，真实getPlan加载选中方案。续聊/生成请求返回精确原ID，已确认任务只使用planTasks提供的授权关联。待明确事项在步骤前，续聊固定底部。没有因浏览创建任务，没有改两态规划、模型或提示词。

与图稿的必要差异：课题组规范没有独立历史读取接口，本批只提供真实当前「版本信息」，明确历史未接入；计划显示创建时间，不伪造更新时间。任务/聊天/资料前批修复随PR200/PR199全部保留。

## 检查与证据

- 386项客户端检查执行（含不同脚本的重复覆盖），渲染/Electron双类型通过。新回归运行实际页面handlers，覆盖生效不重复确认、候选准确版本提交、普通成员无写入口、失败草稿保留、平台只读、搜索清除隐藏详情、原计划续聊及缺失授权任务不伪造链接。
- IAB检查实际规范/计划/导航/读取hooks，业务API、身份、IM外壳、非目标规划/任务详情叶组件为合成夹具。覆盖搜索、保存/失败、权限变化、10秒超时/恢复、模板交接、原计划与请求续聊、任务关联，以及1440×900和较窄桌面窗口。不是私人账号或真实模型验收。
- 图稿与实际全图放在同一图片比较，另有标题/正文/动作重点放大对照；发现首屏动作不可见、重复标题和列表过高后已修正。根目录`design-qa.md`最终为passed，明确了实际接口约束差别。不是单凭截图、构建或HTTP成功断言体验通过。
- 根`desktop:win`使用固定pnpm版本和冻结锁，Web/NSIS通过。11项生产必要入口/固定DSH检查通过；65份应打包Web文件摘要与dist一致，新页面与原读取修复标记在app.asar内。原生桌面按原配置排除根Web WASM两份，不是丢失native缓存。
- 更新清单、EXE、SHA512和blockmap核验通过；本地latest.yml未上传。桌面副本与构建原件SHA256一致。PE与asar版本均0.10.103。
- `electron:smoke`使用临时user-data，收到`OPENIM_ELECTRON_READY`，退出码0；未操作正在使用的私人客户端。已有electron-log重复preload提示、Antd弃用和Router未来提示保留，未声称零警告。

运行证据：`D:/deepseek-agent/.runtime/record-pages-20261111`，包含`client-checks.log`、`check-summary.json`、图稿对照/实际截图、`final-browser-console.json`、`windows-build.log`、`artifact-proof.json`、`update-check.log`、`electron-smoke.log`与`failed-attempts.md`。虚拟API转义/外壳依赖、VM测试宿主和浏览器定位等中途失败已记录，修正后重验；运行文件不进Git。

## 下一步

退出原客户端后由负责人安装桌面包，重点体验资料→课题组规范，以及任务→计划记录→继续讨论/查看关联任务。若需完整规范历史，需要另接对应接口；本批无需后台更新。是否合并、公开发布与后台部署分别决定。
