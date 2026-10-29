-- Preserve old versions/events. Restore only the current blocked projection.
CREATE TEMP TABLE task_upgrade_031 AS SELECT id,version,'upgrade031_'||lower(hex(randomblob(16))) event_id FROM tasks WHERE status='blocked';
UPDATE runtime_meta SET value=CAST(value AS INTEGER)+1 WHERE key='revision' AND EXISTS(SELECT 1 FROM task_upgrade_031);
UPDATE tasks SET
  status=COALESCE(json_extract(document,'$.blocker.resumeStatus'),'ready'),
  version=version+1,
  document=json_set(document,'$.status',COALESCE(json_extract(document,'$.blocker.resumeStatus'),'ready'),'$.blocker',NULL,'$.version',version+1,'$.updatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
WHERE id IN (SELECT id FROM task_upgrade_031);
INSERT INTO task_versions(task_id,version,document)
SELECT id,version,document FROM tasks WHERE id IN (SELECT id FROM task_upgrade_031);
INSERT INTO task_events(id,task_id,document)
SELECT u.event_id,t.id,
 json_object('id',u.event_id,'taskId',t.id,'actor',json_object('kind','system'),'kind','resumed','resourceVersion',t.version,'timestamp',json_extract(t.document,'$.updatedAt'),'summary','升级为依赖提示，恢复原任务状态；历史阻碍记录保留。')
FROM tasks t JOIN task_upgrade_031 u ON u.id=t.id;
DROP TABLE task_upgrade_031;

-- Explicit offer linkage prevents an old transfer from restoring the wrong lead.
CREATE TABLE task_handoffs (
  offer_id TEXT PRIMARY KEY REFERENCES assignments(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  from_assignment_id TEXT NOT NULL REFERENCES assignments(id),
  from_member_id TEXT NOT NULL REFERENCES members(id),
  prior_status TEXT NOT NULL CHECK(prior_status IN ('ready','in_progress','changes_requested','in_review')),
  prior_schedule TEXT NOT NULL CHECK(json_valid(prior_schedule)),
  prior_summary TEXT NOT NULL CHECK(json_valid(prior_summary)),
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled'))
) STRICT;
CREATE UNIQUE INDEX one_pending_handoff ON task_handoffs(task_id) WHERE status='pending';
