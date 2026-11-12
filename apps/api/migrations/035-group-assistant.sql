-- Parent tables are rebuilt by migrate() with FK enforcement restored and checked
-- before commit. Existing IDs, references, transport IDs and message bytes survive.
CREATE TABLE group35_contacts (
 id TEXT PRIMARY KEY, lab_id TEXT REFERENCES labs(id), kind TEXT NOT NULL CHECK(kind IN ('human','personal_agent','public_agent')),
 owner_id TEXT NOT NULL REFERENCES members(id), principal TEXT NOT NULL, UNIQUE(lab_id,kind,principal)
) STRICT;
INSERT INTO group35_contacts SELECT * FROM chat_contacts;
DROP TABLE chat_contacts;
ALTER TABLE group35_contacts RENAME TO chat_contacts;
CREATE INDEX chat_contact_owner ON chat_contacts(owner_id);
CREATE UNIQUE INDEX chat_group_assistant ON chat_contacts(principal) WHERE kind='public_agent' AND principal GLOB 'group:*';

CREATE TABLE group35_conversations (
 id TEXT PRIMARY KEY, lab_id TEXT REFERENCES labs(id), owner_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('personal','direct','group')), scope_key TEXT UNIQUE, document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
INSERT INTO group35_conversations SELECT id,CASE WHEN kind='group' AND lab_id IN (SELECT lab_id FROM personal_spaces) THEN NULL ELSE lab_id END,
 owner_id,kind,scope_key,CASE WHEN kind='group' AND lab_id IN (SELECT lab_id FROM personal_spaces) THEN json_set(document,'$.labId',NULL) ELSE document END FROM chat_conversations;
DROP TABLE chat_conversations;
ALTER TABLE group35_conversations RENAME TO chat_conversations;

CREATE TABLE group35_identities (
 contact_id TEXT PRIMARY KEY REFERENCES chat_contacts(id), lab_id TEXT REFERENCES labs(id), user_id TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')), profile_version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
) STRICT;
INSERT INTO group35_identities SELECT * FROM im_identities;
DROP TABLE im_identities;
ALTER TABLE group35_identities RENAME TO im_identities;
CREATE TABLE group35_im_conversations (
 conversation_id TEXT PRIMARY KEY REFERENCES chat_conversations(id), lab_id TEXT REFERENCES labs(id), im_conversation_id TEXT NOT NULL UNIQUE, group_id TEXT UNIQUE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')), synced_version INTEGER NOT NULL DEFAULT 0, members_hash TEXT, updated_at TEXT NOT NULL
) STRICT;
INSERT INTO group35_im_conversations SELECT i.conversation_id,c.lab_id,i.im_conversation_id,i.group_id,'pending',i.synced_version,i.members_hash,i.updated_at
 FROM im_conversations i JOIN chat_conversations c ON c.id=i.conversation_id;
DROP TABLE im_conversations;
ALTER TABLE group35_im_conversations RENAME TO im_conversations;

CREATE TABLE group_retired_agents (
 conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), contact_id TEXT NOT NULL REFERENCES chat_contacts(id), retired_at TEXT NOT NULL,
 PRIMARY KEY(conversation_id,contact_id)
) STRICT;
INSERT INTO group_retired_agents SELECT m.conversation_id,m.contact_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM chat_members m
 JOIN chat_contacts c ON c.id=m.contact_id JOIN chat_conversations g ON g.id=m.conversation_id
 WHERE g.kind='group' AND c.kind!='human';
UPDATE chat_members SET status='revoked',version=version+1 WHERE (conversation_id,contact_id) IN (SELECT conversation_id,contact_id FROM group_retired_agents);
UPDATE chat_invitations SET document=json_set(document,'$.status','revoked','$.version',COALESCE(json_extract(document,'$.version'),0)+1)
 WHERE (conversation_id,contact_id) IN (SELECT conversation_id,contact_id FROM group_retired_agents);
UPDATE chat_turns SET status='cancelled',fence=fence+1,lease_owner=NULL,lease_until=NULL,
 document=json_set(document,'$.status','cancelled','$.failure','AUTHORITY_CHANGED','$.version',json_extract(document,'$.version')+1,'$.updatedAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))
 WHERE status IN ('queued','running','waiting_input') AND conversation_id IN (SELECT id FROM chat_conversations WHERE kind='group');
INSERT INTO chat_contacts SELECT 'group_assistant_'||id,lab_id,'public_agent',owner_id,'group:'||id FROM chat_conversations WHERE kind='group';
INSERT INTO chat_members SELECT id,'group_assistant_'||id,'joined',1,'member' FROM chat_conversations WHERE kind='group';
UPDATE chat_conversations SET document=json_set(document,'$.version',json_extract(document,'$.version')+1) WHERE kind='group';

CREATE TABLE group_governance_events (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), actor_id TEXT NOT NULL REFERENCES members(id),
 kind TEXT NOT NULL CHECK(kind IN ('lab_changed','owner_changed','left')), created_at TEXT NOT NULL, document TEXT NOT NULL CHECK(json_valid(document))
) STRICT;
CREATE TABLE group_notices (
 id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES chat_conversations(id), from_member_id TEXT NOT NULL REFERENCES members(id),
 to_member_id TEXT NOT NULL REFERENCES members(id), kind TEXT NOT NULL CHECK(kind IN ('notify','ask')), text TEXT NOT NULL,
 content_hash TEXT NOT NULL, source_message_id TEXT NOT NULL REFERENCES chat_messages(id),
 message_id TEXT REFERENCES chat_messages(id), receipt_message_id TEXT REFERENCES chat_messages(id),
 status TEXT NOT NULL CHECK(status IN ('pending','delivered','responded','withdrawn','cancelled')),
 created_at TEXT NOT NULL, delivered_at TEXT, responded_at TEXT,
 delivery_attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, failure TEXT CHECK(failure IS NULL OR failure IN ('permission_changed','delivery_failed'))
) STRICT;
CREATE INDEX group_notice_delivery ON group_notices(status,created_at);
CREATE INDEX group_notice_dedup ON group_notices(conversation_id,to_member_id,content_hash,created_at);
