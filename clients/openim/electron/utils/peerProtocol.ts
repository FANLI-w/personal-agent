import type { PeerFile, PeerRequest } from "@research-agent-platform/contracts";
import { safePeerFilename } from "./peerFiles";

// Electron22 runs Node16. Keep main-process validation independent of the ESM
// contracts runtime; these narrow checks only admit the fields used by native IO.
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("资料响应无效。");
  return value as Record<string, unknown>;
};
const id = (value: unknown) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const instant = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
export function parsePeerFile(value: unknown): PeerFile {
  const v = object(value);
  if (
    !id(v.id) ||
    typeof v.name !== "string" ||
    !safePeerFilename(v.name) ||
    !Number.isSafeInteger(v.size) ||
    Number(v.size) < 1 ||
    Number(v.size) > 10485760 ||
    typeof v.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(v.sha256) ||
    !instant(v.modifiedAt)
  )
    throw Error("资料文件信息无效。");
  return v as unknown as PeerFile;
}
export function parsePeerRequest(value: unknown): PeerRequest {
  const v = object(value);
  if (
    ![v.id, v.labId, v.requesterId, v.providerId, v.requesterDeviceId].every(id) ||
    !(v.providerDeviceId === null || id(v.providerDeviceId)) ||
    !(v.selectedFileId === null || id(v.selectedFileId)) ||
    !(v.attemptId === null || id(v.attemptId)) ||
    !text(v.requesterName, 200) ||
    !text(v.providerName, 200) ||
    !text(v.query, 300) ||
    !Number.isSafeInteger(v.version) ||
    Number(v.version) < 1 ||
    !instant(v.createdAt) ||
    !instant(v.expiresAt) ||
    ![
      "requested",
      "matched",
      "selected",
      "received",
      "declined",
      "cancelled",
      "unavailable",
    ].includes(String(v.status)) ||
    !Array.isArray(v.files) ||
    v.files.length > 10
  )
    throw Error("资料请求信息无效。");
  v.files.forEach(parsePeerFile);
  return v as unknown as PeerRequest;
}
export function peerResponseData(value: unknown) {
  return object(object(value).data);
}
export function peerSessionMember(value: unknown) {
  const data = peerResponseData(value),
    member = object(data.member);
  if (!id(member.id) || !id(member.labId) || data.spaceKind !== "laboratory")
    throw Error("资料身份无效。");
  return member as { id: string; labId: string };
}
export function peerMembershipVersion(value: unknown, memberId: string) {
  const data = peerResponseData(value);
  if (!Array.isArray(data.members) || data.members.length > 500)
    throw Error("成员响应无效。");
  const member = data.members.map(object).find((m) => m.id === memberId);
  if (!member || !Number.isSafeInteger(member.version) || Number(member.version) < 1)
    throw Error("课题组成员权限已变化。");
  return Number(member.version);
}
