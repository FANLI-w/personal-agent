CREATE TABLE work_context_records (
 id TEXT PRIMARY KEY,
 lab_id TEXT NOT NULL REFERENCES labs(id),
 scope TEXT NOT NULL CHECK(scope IN ('lab','project')),
 scope_id TEXT NOT NULL,
 document TEXT NOT NULL
) STRICT;
CREATE INDEX work_context_scope ON work_context_records(lab_id, scope, scope_id);
CREATE TABLE work_context_revisions (
 record_id TEXT NOT NULL REFERENCES work_context_records(id),
 version INTEGER NOT NULL,
 document TEXT NOT NULL,
 PRIMARY KEY(record_id,version)
) STRICT;
