import { randomUUID, createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  PeerRequest,
  peerLibraryRoutes,
  type RequestFor,
} from "@research-agent-platform/contracts";
import type { Actor } from "./auth.js";
import { hasLabMembership, teamLabId } from "./lab-access.js";
import type { Config } from "./config.js";
import { ChatService } from "./chat.js";
import { serviceFor } from "./execution-worker.js";
import { fail } from "./errors.js";

type Command = keyof typeof peerLibraryRoutes;
type Row = Record<string, string | number | null>;
const now = () => new Date().toISOString();
export class PeerLibraryService {
  constructor(
    readonly db: DatabaseSync,
    readonly actor: Actor,
    readonly sessionHash: string,
    readonly config?: Config,
    readonly muteCreate = false
  ) {}
  private membership(member: string, lab: string) {
    return Number(
      this.db
        .prepare(
          "SELECT version FROM lab_memberships WHERE member_id=? AND lab_id=?"
        )
        .get(member, lab)?.version ?? 1
    );
  }
  private lab() {
    const lab = teamLabId(this.actor);
    if (
      !hasLabMembership(this.db, this.actor.id, lab) ||
      this.db.prepare("SELECT 1 FROM personal_spaces WHERE lab_id=?").get(lab)
    )
      fail("FORBIDDEN");
    return lab;
  }
  private pair(provider: string) {
    const lab = this.lab();
    if (provider === this.actor.id || !hasLabMembership(this.db, provider, lab))
      fail("NOT_FOUND");
    return lab;
  }
  private device(id: string) {
    const row = this.db
      .prepare(
        "SELECT * FROM peer_library_devices WHERE id=? AND member_id=? AND lab_id=? AND session_hash=? AND expires_at>?"
      )
      .get(id, this.actor.id, this.lab(), this.sessionHash, now());
    if (!row) fail("INVALID_STATE");
  }
  private row(id: string) {
    const r = this.db
      .prepare(
        "SELECT * FROM peer_library_requests WHERE id=? AND lab_id=? AND (requester_id=? OR provider_id=?)"
      )
      .get(id, this.lab(), this.actor.id, this.actor.id) as Row | undefined;
    if (
      !r ||
      !hasLabMembership(this.db, String(r.requester_id), String(r.lab_id)) ||
      !hasLabMembership(this.db, String(r.provider_id), String(r.lab_id))
    )
      fail("NOT_FOUND");
    if (
      this.membership(String(r.requester_id), String(r.lab_id)) !==
        r.requester_membership_version ||
      this.membership(String(r.provider_id), String(r.lab_id)) !==
        r.provider_membership_version
    )
      fail("NOT_FOUND");
    return r;
  }
  private view(id: string) {
    const r = this.row(id),
      name = (member: unknown) =>
        String(
          this.db
            .prepare("SELECT display_name FROM members WHERE id=?")
            .get(String(member))!.display_name
        );
    return PeerRequest.parse({
      id: r.id,
      labId: r.lab_id,
      requesterId: r.requester_id,
      providerId: r.provider_id,
      requesterName: name(r.requester_id),
      providerName: name(r.provider_id),
      requesterDeviceId: r.requester_device_id,
      providerDeviceId: r.provider_device_id,
      query: r.query,
      status: r.status,
      files: JSON.parse(String(r.files_json)),
      selectedFileId: r.selected_file_id,
      attemptId: r.attempt_id,
      version: r.version,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    });
  }
  private note(id: string) {
    const request = this.view(id),
      config = this.config!;
    const s = new ChatService(
      serviceFor(this.db, request.requesterId, config, request.labId).c,
      config
    );
    s.ensureContacts();
    const personal = (
      s.handle("personalConversation", {
        params: {},
        query: {},
        headers: {},
        body: {},
      }) as { data: { conversation: { id: string }; agent: { id: string } } }
    ).data;
    const labels = {
      requested: "请求已保存，等待同事设备上线或本人同意。",
      matched: `找到${request.files.length}份匹配资料，请选择接收到本机。`,
      selected: "已选择文件，等待双方设备建立直连。",
      received: "原件已在接收设备校验并保存，可打开文件。",
      declined: "对方未同意本次请求。",
      cancelled: "请求已取消。",
      unavailable: "在获准目录中未找到匹配文件，可调整关键词重新查找。",
    };
    s.message(personal.conversation.id, {
      senderContactId: personal.agent.id,
      origin: "service",
      text: `向${request.providerName}索取“${request.query}”：${
        labels[request.status]
      }\n在“资料 → 同事资料”查看。请求 ${request.id}`,
      mentions: [],
      resources: [],
      actionIds: [],
      turnId: null,
    });
  }
  run(
    name: Command,
    req: {
      params: { id?: string };
      query: { deviceId?: string; attemptId?: string };
      body: unknown;
      headers: Record<string, string | undefined>;
    }
  ) {
    peerLibraryRoutes[name].request.parse(req);
    const lab = this.lab(),
      body = (req.body ?? {}) as Record<string, any>,
      id = (req.params as { id?: string }).id,
      key = req.headers["Idempotency-Key"],
      resource = id ?? lab;
    if (name === "peerDevice") {
      const old = this.db
        .prepare("SELECT * FROM peer_library_devices WHERE id=?")
        .get(body.deviceId);
      if (
        old &&
        (old.member_id !== this.actor.id ||
          old.lab_id !== lab ||
          old.session_hash !== this.sessionHash)
      )
        fail("FORBIDDEN");
      this.db
        .prepare("DELETE FROM peer_library_devices WHERE expires_at<?")
        .run(now());
      this.db
        .prepare(
          "DELETE FROM peer_library_signals WHERE request_id IN (SELECT id FROM peer_library_requests WHERE expires_at<?)"
        )
        .run(now());
      if (
        !old &&
        Number(
          this.db
            .prepare(
              "SELECT count(*) n FROM peer_library_devices WHERE member_id=?"
            )
            .get(this.actor.id)!.n
        ) >= 5
      )
        fail("RATE_LIMITED");
      const expiresAt = new Date(
        Date.now() + (body.enabled ? 45000 : 0)
      ).toISOString();
      this.db
        .prepare(
          "INSERT INTO peer_library_devices VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at"
        )
        .run(body.deviceId, this.actor.id, lab, this.sessionHash, expiresAt);
      return { data: { deviceId: body.deviceId, expiresAt } };
    }
    if (name === "peerRequests") {
      this.device((req.query as { deviceId: string }).deviceId);
      const rows = this.db
        .prepare(
          "SELECT id FROM peer_library_requests WHERE lab_id=? AND expires_at>? AND (requester_id=? OR provider_id=?) ORDER BY CASE WHEN status IN ('requested','matched','selected') THEN 0 ELSE 1 END,created_at DESC,id LIMIT 100"
        )
        .all(lab, now(), this.actor.id, this.actor.id);
      const values = [];
      for (const r of rows) {
        try {
          values.push(this.view(String(r.id)));
        } catch {
          /* Departed peers are no longer readable. */
        }
      }
      return { data: values };
    }
    if (name === "peerRequest") return { data: this.view(id!) };
    if (name === "createPeerRequest") this.pair(body.providerId);
    else this.row(id!);
    const deviceId =
      name === "peerSignals"
        ? (req.query as { deviceId: string }).deviceId
        : body.deviceId;
    this.device(deviceId);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(req.body))
      .digest("hex");
    if (key) {
      const prior = this.db
        .prepare(
          "SELECT * FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?"
        )
        .get(this.actor.id, name, resource, key);
      if (prior) {
        if (prior.request_hash !== fingerprint) fail("IDEMPOTENCY_CONFLICT");
        const result = JSON.parse(String(prior.response_json));
        return { data: this.view(result.data.id) };
      }
    }
    let result: unknown;
    if (name === "createPeerRequest") {
      if (
        Number(
          this.db
            .prepare(
              "SELECT count(*) n FROM peer_library_requests WHERE requester_id=? AND expires_at>? AND status IN ('requested','matched','selected')"
            )
            .get(this.actor.id, now())!.n
        ) >= 30
      )
        fail("RATE_LIMITED");
      if (
        Number(
          this.db
            .prepare(
              "SELECT count(*) n FROM peer_library_requests WHERE requester_id=? AND created_at>?"
            )
            .get(this.actor.id, new Date(Date.now() - 86400000).toISOString())!
            .n
        ) >= 100
      )
        fail("RATE_LIMITED");
      const created = now(),
        requestId = randomUUID(),
        expiry = new Date(Date.now() + 7 * 86400000).toISOString();
      this.db
        .prepare(
          "INSERT INTO peer_library_requests (id,lab_id,requester_id,provider_id,requester_device_id,requester_membership_version,provider_membership_version,query,status,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,'requested',?,?)"
        )
        .run(
          requestId,
          lab,
          this.actor.id,
          body.providerId,
          deviceId,
          this.membership(this.actor.id, lab),
          this.membership(body.providerId, lab),
          body.query,
          created,
          expiry
        );
      result = { data: this.view(requestId) };
    } else {
      const r = this.row(id!),
        provider = r.provider_id === this.actor.id;
      if (String(r.expires_at) <= now()) fail("INVALID_STATE");
      if (name === "peerSignals" || name === "sendPeerSignal") {
        const attempt =
          name === "peerSignals"
            ? (req.query as { attemptId: string }).attemptId
            : body.attemptId;
        if (
          r.status !== "selected" ||
          attempt !== r.attempt_id ||
          deviceId !== (provider ? r.provider_device_id : r.requester_device_id)
        )
          fail("INVALID_STATE");
        if (name === "peerSignals")
          return {
            data: this.db
              .prepare(
                "SELECT kind,sdp FROM peer_library_signals WHERE request_id=? AND attempt_id=? AND sender_id!=? ORDER BY kind"
              )
              .all(id!, attempt, this.actor.id),
          };
        if (body.kind !== (provider ? "answer" : "offer")) fail("FORBIDDEN");
        const old = this.db
          .prepare(
            "SELECT sdp FROM peer_library_signals WHERE request_id=? AND attempt_id=? AND kind=?"
          )
          .get(id!, attempt, body.kind);
        if (old && old.sdp !== body.sdp) fail("VERSION_CONFLICT");
        this.db
          .prepare(
            "INSERT INTO peer_library_signals VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING"
          )
          .run(id!, attempt, this.actor.id, body.kind, body.sdp);
        return { data: { stored: true } };
      }
      if (r.version !== body.expectedVersion) fail("VERSION_CONFLICT");
      if (["received", "declined", "cancelled"].includes(String(r.status)))
        fail("INVALID_STATE");
      if (body.action === "match") {
        if (
          !provider ||
          r.status !== "requested" ||
          !body.files ||
          body.files.length !==
            new Set(body.files.map((f: { id: string }) => f.id)).size
        )
          fail("INVALID_STATE");
        this.db
          .prepare(
            "UPDATE peer_library_requests SET provider_device_id=?,files_json=?,status=? WHERE id=?"
          )
          .run(
            deviceId,
            JSON.stringify(body.files),
            body.files.length ? "matched" : "unavailable",
            id!
          );
      } else if (body.action === "select") {
        if (
          provider ||
          r.status !== "matched" ||
          !JSON.parse(String(r.files_json)).some(
            (f: { id: string }) => f.id === body.fileId
          )
        )
          fail("INVALID_STATE");
        this.db
          .prepare("DELETE FROM peer_library_signals WHERE request_id=?")
          .run(id!);
        this.db
          .prepare(
            "UPDATE peer_library_requests SET requester_device_id=?,selected_file_id=?,attempt_id=?,status='selected' WHERE id=?"
          )
          .run(deviceId, body.fileId, randomUUID(), id!);
      } else if (body.action === "retry") {
        if (provider || !["selected", "unavailable"].includes(String(r.status)))
          fail("INVALID_STATE");
        this.db
          .prepare("DELETE FROM peer_library_signals WHERE request_id=?")
          .run(id!);
        this.db
          .prepare(
            "UPDATE peer_library_requests SET requester_device_id=?,provider_device_id=NULL,files_json='[]',selected_file_id=NULL,attempt_id=NULL,status='requested' WHERE id=?"
          )
          .run(deviceId, id!);
      } else if (body.action === "received") {
        if (
          provider ||
          r.status !== "selected" ||
          deviceId !== r.requester_device_id
        )
          fail("INVALID_STATE");
        this.db
          .prepare(
            "UPDATE peer_library_requests SET status='received' WHERE id=?"
          )
          .run(id!);
      } else {
        if (body.action !== (provider ? "decline" : "cancel"))
          fail("FORBIDDEN");
        this.db
          .prepare("UPDATE peer_library_requests SET status=? WHERE id=?")
          .run(provider ? "declined" : "cancelled", id!);
      }
      this.db
        .prepare(
          "UPDATE peer_library_requests SET version=version+1 WHERE id=?"
        )
        .run(id!);
      if (body.action !== "select")
        this.db
          .prepare("DELETE FROM peer_library_signals WHERE request_id=?")
          .run(id!);
      result = { data: this.view(id!) };
    }
    const parsed = peerLibraryRoutes[name].response.parse(result);
    if (this.config && !(this.muteCreate && name === "createPeerRequest"))
      this.note((parsed as { data: { id: string } }).data.id);
    if (key)
      this.db
        .prepare("INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)")
        .run(
          this.actor.id,
          name,
          resource,
          key,
          fingerprint,
          JSON.stringify(parsed),
          peerLibraryRoutes[name].status,
          now()
        );
    return parsed;
  }
}
