-- The assistant now reads assistant_memories. Legacy personal-memory tables are
-- removed; conversation memory remains in chat_memories until group memory is built.
DROP TABLE IF EXISTS personal_memory_revisions;
DROP TABLE IF EXISTS personal_memories;
DROP TABLE IF EXISTS personal_memory_settings;
DELETE FROM chat_memory_revisions
WHERE memory_id IN (SELECT id FROM chat_memories WHERE scope='private_agent');
DELETE FROM chat_memories WHERE scope='private_agent';
