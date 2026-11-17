CREATE TABLE assistant_projects (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 work_task_id TEXT NOT NULL UNIQUE REFERENCES personal_work_tasks(id),
 source_turn_id TEXT NOT NULL UNIQUE REFERENCES chat_turns(id),
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
 source_message_id TEXT NOT NULL REFERENCES chat_messages(id),
 status TEXT NOT NULL CHECK(status IN ('active','awaiting_review','blocked','completed','cancelled')),
 due_at TEXT,
 next_at TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version>=1),
 document TEXT NOT NULL CHECK(json_valid(document)),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX assistant_project_due ON assistant_projects(status,next_at);
CREATE TABLE assistant_project_commitments (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES assistant_projects(id),
 position INTEGER NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('agent','human')),
 contact_id TEXT REFERENCES chat_contacts(id),
 status TEXT NOT NULL CHECK(status IN ('pending','running','waiting','ready','blocked','cancelled')),
 due_at TEXT,
 next_at TEXT NOT NULL,
 turn_id TEXT REFERENCES chat_turns(id),
 message_id TEXT REFERENCES chat_messages(id),
 run_conversation_id TEXT REFERENCES chat_conversations(id),
 output_message_id TEXT REFERENCES chat_messages(id),
 failure TEXT,
 document TEXT NOT NULL CHECK(json_valid(document)),
 updated_at TEXT NOT NULL,
 UNIQUE(project_id,position)
) STRICT;
CREATE INDEX assistant_project_commitment_due ON assistant_project_commitments(project_id,status,next_at);
CREATE TABLE assistant_project_events (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES assistant_projects(id),
 commitment_id TEXT REFERENCES assistant_project_commitments(id),
 event_key TEXT NOT NULL,
 kind TEXT NOT NULL,
 message_id TEXT REFERENCES chat_messages(id),
 document TEXT NOT NULL CHECK(json_valid(document)),
 created_at TEXT NOT NULL,
 UNIQUE(project_id,event_key)
) STRICT;
