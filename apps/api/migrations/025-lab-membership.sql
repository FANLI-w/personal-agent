-- Account home IDs remain immutable: IM IDs, private files and OAuth encryption
-- continue using members.lab_id. Team contexts are separate, revocable grants.
CREATE TABLE lab_memberships (
 lab_id TEXT NOT NULL REFERENCES labs(id), member_id TEXT NOT NULL REFERENCES members(id),
 status TEXT NOT NULL CHECK(status IN ('active','removed')), joined_at TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(lab_id,member_id)
) STRICT;
CREATE VIEW effective_lab_memberships AS
 SELECT lab_id,member_id FROM lab_memberships WHERE status='active'
 UNION
 SELECT m.lab_id,m.id FROM members m WHERE NOT EXISTS(SELECT 1 FROM personal_spaces p WHERE p.lab_id=m.lab_id)
 AND NOT EXISTS(SELECT 1 FROM lab_memberships x WHERE x.lab_id=m.lab_id AND x.member_id=m.id);
CREATE TABLE member_lab_contexts (
 member_id TEXT PRIMARY KEY REFERENCES members(id), lab_id TEXT NOT NULL REFERENCES labs(id),
 version INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE lab_member_invitations (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id), inviter_id TEXT NOT NULL REFERENCES members(id),
 member_id TEXT NOT NULL REFERENCES members(id), status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','revoked')),
 version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, updated_at TEXT NOT NULL
) STRICT;
CREATE UNIQUE INDEX one_pending_lab_invitation ON lab_member_invitations(lab_id,member_id) WHERE status='pending';
CREATE INDEX incoming_lab_invitations ON lab_member_invitations(member_id,status);
-- Storage lab remains the original account home. Sharing identifies a team
-- independently, without re-encrypting or moving the owner's private source.
CREATE TABLE research_collection_labs (
 collection_id TEXT PRIMARY KEY REFERENCES research_collections(id), lab_id TEXT NOT NULL REFERENCES labs(id)
) STRICT;
INSERT INTO research_collection_labs SELECT id,lab_id FROM research_collections WHERE scope='lab_shared';

CREATE TABLE chat_turn_lab_contexts (
 turn_id TEXT PRIMARY KEY REFERENCES chat_turns(id), lab_id TEXT NOT NULL REFERENCES labs(id)
) STRICT;
