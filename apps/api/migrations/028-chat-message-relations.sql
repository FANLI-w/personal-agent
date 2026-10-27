-- Relations and tombstones are additive; immutable message bodies remain audit records.
CREATE TABLE chat_message_relations (
  message_id TEXT PRIMARY KEY REFERENCES chat_messages(id),
  reply_to_id TEXT NOT NULL REFERENCES chat_messages(id)
);
CREATE TABLE chat_message_retractions (
  message_id TEXT PRIMARY KEY REFERENCES chat_messages(id),
  actor_id TEXT NOT NULL REFERENCES members(id),
  created_at TEXT NOT NULL
);
