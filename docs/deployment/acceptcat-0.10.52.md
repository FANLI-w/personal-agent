# AcceptCat 0.10.52：科研同伴团队

2026-10-26，北京时间。Windows版本现已合main、公开并设为Latest；角色默认目录的配套后台升级仍单独待办。本机制作时记录保留如下，合并和发布回执见末节。

## 受测代码与行为

从fetch后的main/fb2150b另开feat/research-colleague-team，普通快进保留PR111/8f82e23及PR110至PR105。产品 **f9122fe580bf88fbfac4eaed1155241b89ecd41c**。

18类角色、19方法，按基础/论文/项目/知识产权/协作组织。补选题、实验设计、写作、润色、项目申请、PPT、专利、软著角色，打磨既有角色的具体判断、接话例子和交付。新meta分类/分工/方法引用经过构建校验，前端不再从描述关键词推断默认模板分类。详细方法独立，技能库按需加载内置目录，预览后沿既有接口确认私人安装，再明确绑定和本次选择；普通聊天不自动安装或执行。原7个历史模板及上一版10默认档案、所有用户编辑和私人偏好保持，历史精确表共37份，不重写数据库。设计与固定参考来源见[科研同伴团队](../development/research-colleague-team.md)。

没有增加普通聊天的浏览器、脚本、图像或PPTX导出工具。绘图/PPT助手先提供有用的结构、内容或代码；只有实际调用工具并得到文件才能称生成，实际检查渲染才能称视觉验证。项目申请依当年官方规则辅助作者，国自然等禁止直接使用AI生成申请书的场景不能交付整份代写申报稿；专利/软著不编事实、承诺批准或擅自提交。

## 实际检查

- 根ci：**789项/62文件**、2项生产CLI/HTTP、B0及生产边界通过，包含固定Harness适配器构建/类型与缺凭据边界，无真实模型调用。
- 客户端：**107项**，包含角色导入/编辑/复用、内置方法建议与私人副本、分类、资料、规划/依赖、聊天/通知及9项构建守卫；renderer/Electron双类型通过。
- 实际本机HTTP/SQLite合成模型检查：15类专门角色与个人助理的当前档案进入有预算的模型输入；方法安装私人、绑定前拒绝、明确选择后仅加载所选正文/参考，他人无法读取。
- 首轮客户端测试因将当前角色总数限定为旧7个而51通过/1失败，证据保留。保留旧7份历史模板逐一复用断言，新增角色独立覆盖；修复旧VM夹具缺失角色目录加载，旧文案匹配断言改为真实接口/权限行为。没有提高预算/业务时限、跳过测试或改真实权限。
- Windows冻结顺序两个共享包先build、客户端冻结安装、Web/4SDK/55运行包/NSIS/4启动入口及更新清单通过，无force安装。ASAR **76份角色、48份方法、3个生成模块**与源码/构建产物逐字节一致；方法单独在dist/assets/builtin-methods-fe0c2d13.js，前批12处已删说明不再出现，图标/完整署名保持。

未代安装、原生启动、浏览器产品、真实模型、私人材料、飞书、双机或真正的绘图/PPT文件导出验收。人工写的角色示例及公开合成情境用于设计，没有当作真实模型交流质量评分。

## 安装包与证据

- 桌面：C:/Users/luo/Desktop/AcceptCat_0.10.52.exe；源包clients/openim/release/Base/0.10.52/AcceptCat_0.10.52.exe。
- 大小：**88,222,587字节**；SHA256：**7484a4b4a1b86718438b4d063748ad070f5b511d81143bbbe3cc456e4ece7e4a**。
- 桌面复制摘要一致，旧包保留；EXE/blockmap/latest.yml及包内更新源通过，已按末节核对上传Release。
- Git外证据：D:/deepseek-agent/.runtime/research-colleague-team-20261026，含原默认快照、来源与既有PR状态、root-ci、roles-focused、builtin-http、client-focused首轮及最终107项、双类型、desktop-win、asar-inspection/asar-icons.json、windows-update、delivery。源码组织与公开评价情境在仓库中，运行记录/安装包在Git外。

## 制作时的后台、合并与公开状态（后续回执见下节）

共享角色/方法包改变，配套API/worker需单独重建升级才采用新版默认目录、历史投影与共同加载。新建或显式保存的角色/文字Skill继续走原接口。contract0.32/schema026、数据库、依赖锁及权限边界保持，无迁移。本批没有后台部署、备份或新线上探测，线上仍0e78530/7d75165a；此前真实注册超时未确定根因。

PR111/8f82e23四项GitHub检查重新读取success，本批新PR另记。未合main、公开或部署，公开Latest重新读取仍v0.10.37/422478602。内容/链接和git diff --check通过。

[PR112](https://github.com/luoyan96/personal-agent/pull/112)已创建并挂接，OPEN/MERGEABLE，目标main；首次head5740bf4三项GitHub检查in_progress、Windows Foundation queued，未确认通过，github-created.json保留。未合并、公开或部署。

## 09:37合并与09:39公开发布

负责人本轮明确授权合并和上传安装包。重新fetch后main仍fb2150b、功能分支干净；最终受审head **d1f913acc3fc92326eae6d842051172c0e9c6e7a**的[三平台Foundation](https://github.com/luoyan96/personal-agent/actions/runs/40215380180)及[Windows打包](https://github.com/luoyan96/personal-agent/actions/runs/40215380190)四项检查均success。GitHub连接器合并返回403 Resource not accessible by integration，保留响应后改用原已登录gh CLI，同样指定merge方法和expected head，没有更改权限或绕过检查。

北京时间 **09:37:08**，merge commit **667bc34fea851fea0c929e975f3467474eedcc71**合main。父提交精确为fb2150b9055520bdf7ad1386aa7a9a27f09b582b与d1f913acc3fc92326eae6d842051172c0e9c6e7a；树 **9234f800291e85b5e7d5f906aa3ad9ab4528f0bf**与受审head相同，产品f9122fe之后仅5份文档变化，因此上传原通过检查的包，没有重建或混用其他版本。PR105至PR111于09:37:10自动MERGED；普通快进本机main，保留作者、同事聊天及全部既有功能，没有强推或覆盖。

北京时间 **09:39:41**，Release **423781483** / [v0.10.52](https://github.com/luoyan96/personal-agent/releases/tag/v0.10.52)公开、非预发布并设为Latest；tag固定上述合并提交。先确认无同名tag/Release，再创建唯一草稿、上传四附件，对照本机大小/SHA256与GitHubuploaded状态及digest后公开。后续状态文档不修改tag或成品。

| 附件 | 字节 | SHA256 |
| --- | ---: | --- |
| AcceptCat_0.10.52.exe | 88,222,587 | 7484a4b4a1b86718438b4d063748ad070f5b511d81143bbbe3cc456e4ece7e4a |
| AcceptCat_0.10.52.exe.blockmap | 92,278 | b15718af30ded02d276b7e4bc666faf83ba636dba7c1da00732c7585d5378ba3 |
| latest.yml | 340 | c9c80680a8a8718fda88019c4f084aaf83ae6c77d9982bfc52403725e4982e0d |
| SHA256SUMS.txt | 262 | 2c53c71434df8882699dcfa12bdfc69bb947b6ff0ed44abf4e99b0e181bc71f5 |

未登录公开latest API返回同一v0.10.52/Release；公开tag精确指向667bc34，下载公开latest.yml与SHA256SUMS逐字节相同。没有下载或运行88MB安装器追加体验验收，原公开Release、旧包及其他草稿均保留。合并667bc34的[新Foundation运行](https://github.com/luoyan96/personal-agent/actions/runs/40255102374)三项现均success；[新Windows打包](https://github.com/luoyan96/personal-agent/actions/runs/40255102397)也success，合并提交与PR最终head各自四项检查全通过。发布文档内容/链接及git diff --check通过。

Git外 **D:/deepseek-agent/.runtime/release-0.10.52-20261026**保存合并前状态/PR检查、前后树与父提交、8个PR合并回执、草稿/上传/公开和公开下载核对、原安装包摘要与SHA256SUMS。本批前置回执脚本曾遇functions无btoa及Windows命令过长，改为精简字段后保存；一次gh只读列表请求了不支持的databaseId字段，改用支持字段，均发生在相应操作前，未导致重复创建或覆盖，原错误说明保留。

**后台不随本次发布升级**，仍0e78530/7d75165a、contract0.32/schema026。共享角色/方法目录仍需单独升级API/worker，新建或显式保存的角色/文字Skill沿原接口。没有新后台检查、备份、重启或迁移；原真实注册超时仍未确定根因，未代用户安装、真实模型/私人材料/双机或绘图/PPT实际导出验收。
