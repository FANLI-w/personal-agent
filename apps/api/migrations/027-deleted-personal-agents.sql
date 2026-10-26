-- Keep stable contacts and their messages/tasks; deletion revokes future use.
CREATE TABLE deleted_personal_agents (
 contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id),
 owner_id TEXT NOT NULL REFERENCES members(id),
 profile_version INTEGER NOT NULL CHECK(profile_version>=1),
 deleted_at TEXT NOT NULL
) STRICT;
