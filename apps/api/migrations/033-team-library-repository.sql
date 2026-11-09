-- Repository content remains on Git. This row binds one portable workspace to
-- a live lab; access to individual originals remains in the existing services.
CREATE TABLE team_library_repositories (
  lab_id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  document TEXT NOT NULL
) STRICT;
