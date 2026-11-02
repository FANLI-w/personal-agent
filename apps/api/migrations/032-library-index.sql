-- Files stay on the lab's own disks. The server keeps only what is needed to
-- find them: which project, which relative path, what it is for, and who keeps
-- it current. No original bytes, no extracted text.
CREATE TABLE library_index_entries (
  id TEXT PRIMARY KEY,
  lab_id TEXT NOT NULL,
  project TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  document TEXT NOT NULL
) STRICT;

CREATE UNIQUE INDEX library_index_entries_path
  ON library_index_entries(lab_id, project, rel_path);

CREATE INDEX library_index_entries_lab
  ON library_index_entries(lab_id, updated_at);
