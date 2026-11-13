CREATE TABLE assistant_feedback (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id TEXT NOT NULL REFERENCES members(id),
  lab_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('chat','planning','review')),
  source_id TEXT NOT NULL,
  available_at INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  UNIQUE(kind,source_id)
) STRICT;
CREATE INDEX assistant_feedback_due ON assistant_feedback(available_at,seq);
CREATE INDEX assistant_feedback_scope ON assistant_feedback(member_id,scope,seq);

CREATE TABLE group_dialogue_preferences (
  member_id TEXT NOT NULL REFERENCES members(id),
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  content TEXT NOT NULL,
  PRIMARY KEY(member_id,conversation_id)
) STRICT;
