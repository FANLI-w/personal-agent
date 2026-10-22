import { z } from "zod";
import {
  Id,
  Instant,
  Version,
  ErrorResponse,
  errorStatus,
  data,
} from "./models.js";

const empty = z.strictObject({}),
  id = z.strictObject({ id: Id });
export const PeerFile = z.strictObject({
  id: Id,
  name: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\\/\u0000-\u001f]+$/),
  size: z.number().int().min(1).max(10485760),
  modifiedAt: Instant,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export type PeerFile = z.infer<typeof PeerFile>;
export const PeerRequest = z.strictObject({
  id: Id,
  labId: Id,
  requesterId: Id,
  providerId: Id,
  requesterName: z.string(),
  providerName: z.string(),
  requesterDeviceId: Id,
  providerDeviceId: Id.nullable(),
  query: z.string(),
  status: z.enum([
    "requested",
    "matched",
    "selected",
    "received",
    "declined",
    "cancelled",
    "unavailable",
  ]),
  files: z.array(PeerFile).max(10),
  selectedFileId: Id.nullable(),
  attemptId: Id.nullable(),
  version: Version,
  createdAt: Instant,
  expiresAt: Instant,
});
export type PeerRequest = z.infer<typeof PeerRequest>;
function route<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType
>(
  method: "GET" | "POST",
  path: string,
  params: P,
  query: Q,
  body: B,
  response: R,
  status = 200,
  idempotent = method !== "GET"
) {
  return {
    method,
    path: "/api/v1/peer-library" + path,
    stage: "PEER1" as const,
    status,
    access: "session",
    implemented: true,
    idempotent,
    rule: "Same current research-group members only. Device/session-bound requests and bounded WebRTC signaling; never file bytes, absolute paths or cloud file storage. Recheck live membership, device lease and request state before replay. Local sharing requires a separate explicit native directory grant.",
    request: z.strictObject({
      params,
      query,
      body,
      headers: idempotent
        ? z.strictObject({
            "Idempotency-Key": z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
          })
        : empty,
    }),
    response,
    errors: ErrorResponse,
    errorStatuses: errorStatus,
  };
}
export const peerLibraryRoutes = {
  peerDevice: route(
    "POST",
    "/devices",
    empty,
    empty,
    z.strictObject({ deviceId: Id, enabled: z.boolean() }),
    data(z.strictObject({ deviceId: Id, expiresAt: Instant })),
    200,
    false
  ),
  peerRequests: route(
    "GET",
    "/requests",
    empty,
    z.strictObject({ deviceId: Id }),
    z.null(),
    data(z.array(PeerRequest).max(100))
  ),
  createPeerRequest: route(
    "POST",
    "/requests",
    empty,
    empty,
    z.strictObject({
      deviceId: Id,
      providerId: Id,
      query: z.string().trim().min(1).max(300),
    }),
    data(PeerRequest),
    201
  ),
  peerRequest: route(
    "GET",
    "/requests/{id}",
    id,
    empty,
    z.null(),
    data(PeerRequest)
  ),
  updatePeerRequest: route(
    "POST",
    "/requests/{id}",
    id,
    empty,
    z.strictObject({
      deviceId: Id,
      expectedVersion: Version,
      action: z.enum([
        "match",
        "select",
        "decline",
        "cancel",
        "received",
        "retry",
      ]),
      files: z.array(PeerFile).max(10).optional(),
      fileId: Id.optional(),
    }),
    data(PeerRequest)
  ),
  peerSignals: route(
    "GET",
    "/requests/{id}/signals",
    id,
    z.strictObject({ deviceId: Id, attemptId: Id }),
    z.null(),
    data(
      z
        .array(
          z.strictObject({
            kind: z.enum(["offer", "answer"]),
            sdp: z.string().max(24576),
          })
        )
        .max(2)
    )
  ),
  sendPeerSignal: route(
    "POST",
    "/requests/{id}/signals",
    id,
    empty,
    z.strictObject({
      deviceId: Id,
      attemptId: Id,
      kind: z.enum(["offer", "answer"]),
      sdp: z.string().min(1).max(24576),
    }),
    data(z.strictObject({ stored: z.literal(true) })),
    200,
    false
  ),
} as const;
