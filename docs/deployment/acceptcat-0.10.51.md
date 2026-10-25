# AcceptCat 0.10.51：资料页界面精简

2026-10-26，北京时间。本机Windows候选安装包，实际安装体验由负责人检查。

从fetch后的main/fb2150b新建fix/library-copy-cleanup，普通快进保留PR110/54cc54d（含PR109/108/107/106/105）。产品提交 **d321556504bc54fda7bdf28f0869bc9cf5ffc731**。

按截图删除资料页/资料库介绍、集合抬头下说明、飞书共享和查询解释、连接与查询范围折叠块、资料助手闲置介绍及输入区固定说明、模型设置和快捷键小字，清理闲置依赖/样式。集合说明数据保留，仍在集合设置中编辑；飞书表名/共享范围、打开/复制/提问、集合设置/撤回、发送/停止与键盘发送、真实状态及失败反馈保持。资料选择继续使用顶部“资料范围”，模型设置仍在“我的”。保留0.10.50工作台精简、原聊天恢复/通知、角色、单任务及大肥鱼图标/头像和署名。

## 实际检查

renderer/Electron双类型、19项现有资料对话/飞书范围/原件下载隔离回归通过。首轮旧资料对话VM夹具没有注入已统一的角色目录而不能启动（其他12项通过、1文件失败）；仅补接真实role-catalog导出，保持原断言和业务源码，重新运行19项通过。失败和最终日志分别保留。

冻结顺序先构建两个共享包、再客户端冻结安装，Windows Web/4SDK/55运行包/NSIS/4启动入口与更新清单通过，未force安装。ASAR核对本批7处及前批5处已删文字不在renderer、资料与规划发送/飞书打开/复制/集合设置入口仍在，六份公共图标/renderer图标及3份署名原样保存。

前批PR110/54cc54d重新读取三项检查success、Windows Foundation原registration迁移008幂等用例15000ms超时（786通过/1失败）；原日志保留。本机同一用例在原时限下1通过、16未选，没有改变后端、时限或断言；没有重复根全量CI。本批新PR检查另计，未宣称前批GitHub全通过。此前他人真实注册超时仍未确定根因。

没有代安装、原生启动、浏览器产品、真实模型、私人材料、飞书账号或双机体验验收；包内资源检查不等于实际观感或外部权限验收。

## 安装包、部署与公开状态

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.51.exe；源包clients/openim/release/Base/0.10.51/AcceptCat_0.10.51.exe。
- 大小：**88,156,281字节**；SHA256：**faf9cda60758bee088911ac3375b1c74c5e0a4a28493e739884627e148a32ba0**。复制摘要一致、旧包保留。
- EXE/blockmap/latest.yml与包内更新源通过，未上传Release。
- Git外证据：D:/deepseek-agent/.runtime/library-copy-cleanup-20261026，包含类型、首轮与最终library-regression、desktop-win、windows-update、asar-inspection、delivery、PR110 Windows原日志及registration-migration-recheck。

本批仅客户端显示和旧测试夹具修改，无API/worker、契约、数据库、角色正文或依赖锁变化，无迁移或本批后台部署需求。前批角色后台仍待单独安排。未合main、公开或部署，线上0e78530/7d75165a、contract0.32/schema026和重新读取的公开Latest v0.10.37/422478602保持。内容/链接和PR回执另记。
