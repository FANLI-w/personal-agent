CREATE TABLE team_work (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL,
 task_id TEXT NOT NULL UNIQUE, agent_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 document TEXT NOT NULL,
 UNIQUE(conversation_id, source_message_id, agent_id)
);
CREATE TABLE work_executions (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, task_id TEXT NOT NULL,
 request_id TEXT NOT NULL, actor_id TEXT NOT NULL, device_id TEXT NOT NULL,
 phase TEXT NOT NULL, document TEXT NOT NULL,
 UNIQUE(kind,task_id,request_id)
);
CREATE UNIQUE INDEX work_execution_active ON work_executions(kind,task_id)
 WHERE phase IN ('claimed','running','uncertain');
CREATE TABLE work_devices (
 actor_id TEXT NOT NULL, device_id TEXT NOT NULL, seen_at TEXT NOT NULL,
 PRIMARY KEY(actor_id,device_id)
);
