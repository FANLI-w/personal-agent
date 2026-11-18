-- Assistant topics are the personal-assistant domain's topic sub-item. They stay
-- separate from personal_memory preferences and from assistant_memories notes:
-- one assistant has one conversation, so topics are owner+agent scoped and are
-- not bound to a conversation. Conversations and turns only address curator jobs.
-- Preferences remain authoritative in personal_memories; assistant notes remain
-- authoritative in assistant_memories. This migration only adds topic storage.
CREATE TABLE assistant_topics (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 assistant_id TEXT NOT NULL REFERENCES chat_contacts(id),
 title TEXT NOT NULL,
 title_status TEXT NOT NULL CHECK(title_status IN ('provisional','final')),
 summary TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 state TEXT NOT NULL CHECK(state IN ('active','paused','closed')),
 origin TEXT NOT NULL CHECK(origin IN ('curator','owner')),
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 last_active_at TEXT NOT NULL
) STRICT;
-- One active topic per owner and assistant; paused and closed topics stay readable.
CREATE UNIQUE INDEX assistant_topic_active ON assistant_topics(owner_id,assistant_id) WHERE state='active';
CREATE INDEX assistant_topic_recent ON assistant_topics(owner_id,assistant_id,state,last_active_at);

CREATE TABLE assistant_topic_revisions (
 topic_id TEXT NOT NULL REFERENCES assistant_topics(id),
 version INTEGER NOT NULL,
 document TEXT NOT NULL CHECK(json_valid(document)),
 at TEXT NOT NULL,
 PRIMARY KEY(topic_id,version)
) STRICT;

CREATE TABLE assistant_topic_curator_jobs (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES members(id),
 assistant_id TEXT NOT NULL REFERENCES chat_contacts(id),
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
 turn_id TEXT NOT NULL UNIQUE REFERENCES chat_turns(id),
 status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,
 result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
 failure TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX assistant_topic_job_queue ON assistant_topic_curator_jobs(status,created_at);
