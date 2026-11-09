-- 个人层规则独立成表：与课题组规则同形，但按成员隔离。
-- 单独建表而不是改 029 的 CHECK：SQLite 改不了 CHECK，重建带外键的表风险更高；
-- 个人规则本就不应出现在课题组查询里，分表同时解决了隔离问题。
CREATE TABLE personal_work_rules (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE INDEX personal_work_rules_member ON personal_work_rules(member_id);
CREATE TABLE personal_work_rule_revisions (
  record_id TEXT NOT NULL REFERENCES personal_work_rules(id),
  version INTEGER NOT NULL,
  document TEXT NOT NULL,
  PRIMARY KEY(record_id, version)
) STRICT;
