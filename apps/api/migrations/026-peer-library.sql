-- File bytes and local paths never enter these coordination tables.
CREATE TABLE peer_library_devices (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id),
 lab_id TEXT NOT NULL REFERENCES labs(id), session_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX peer_library_devices_owner ON peer_library_devices(member_id,lab_id);
CREATE TABLE peer_library_requests (
 id TEXT PRIMARY KEY, lab_id TEXT NOT NULL REFERENCES labs(id),
 requester_id TEXT NOT NULL REFERENCES members(id), provider_id TEXT NOT NULL REFERENCES members(id),
 requester_device_id TEXT NOT NULL, provider_device_id TEXT,
 requester_membership_version INTEGER NOT NULL, provider_membership_version INTEGER NOT NULL,
 query TEXT NOT NULL, status TEXT NOT NULL, files_json TEXT NOT NULL DEFAULT '[]',
 selected_file_id TEXT, attempt_id TEXT, version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX peer_library_requests_inbox ON peer_library_requests(lab_id,provider_id,created_at);
CREATE TABLE peer_library_signals (
 request_id TEXT NOT NULL REFERENCES peer_library_requests(id), attempt_id TEXT NOT NULL,
 sender_id TEXT NOT NULL REFERENCES members(id), kind TEXT NOT NULL, sdp TEXT NOT NULL,
 PRIMARY KEY(request_id,attempt_id,kind)
) STRICT;
