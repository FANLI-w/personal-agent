import { net } from "electron";
import {
  parsePeerRequest,
  peerResponseData,
  peerSessionMember,
  peerMembershipVersion,
} from "../utils/peerProtocol";
import { authority } from "./localFolderManage";
import { getResearchServiceStatus } from "./windowManage";
import { desktopSessionCookie } from "../utils/desktopServer";
import type { PeerScope } from "../../src/types/peerLibrary";

/** Read the actual current cookie in the main process; renderer identity is only a claim. */
export async function peerAuthority(
  event: Electron.IpcMainInvokeEvent,
  scope: PeerScope,
  requestId?: string,
) {
  const auth = authority(event),
    service = new URL(getResearchServiceStatus().address).origin,
    renderer = new URL(auth.contents.getURL()).origin;
  if (
    !scope ||
    ![scope.memberId, scope.labId].every(
      (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v),
    )
  )
    throw Error("资料身份无效。");
  const cookieName =
    renderer === service ? "rap_session" : desktopSessionCookie(service);
  const cookie = async () => {
    const values = await auth.contents.session.cookies.get({
      url: renderer,
      name: cookieName,
    });
    return values.find((v) => v.name === cookieName)?.value;
  };
  const token = await cookie();
  if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token))
    throw Error("请重新登录后使用同事资料。");
  const read = (suffix: string) =>
    new Promise<unknown>((resolve, reject) => {
      const request = net.request({
        url: service + "/api/v1/" + suffix,
        method: "GET",
        session: auth.contents.session,
        useSessionCookies: false,
        redirect: "error",
      });
      request.setHeader("Cookie", "rap_session=" + token);
      request.setHeader("Origin", service);
      const timer = setTimeout(() => {
        request.abort();
        reject(Error("资料权限核对超时。"));
      }, 10000);
      request.on("error", () => {
        clearTimeout(timer);
        reject(Error("资料权限核对失败。"));
      });
      request.on("response", (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 1048576) {
            request.abort();
            clearTimeout(timer);
            reject(Error("权限响应过大。"));
          } else chunks.push(Buffer.from(chunk));
        });
        response.on("error", () => {
          clearTimeout(timer);
          reject(Error("资料权限响应未完成。"));
        });
        response.on("end", () => {
          clearTimeout(timer);
          if (response.statusCode !== 200) {
            reject(Error("当前账号没有此资料请求权限。"));
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(Error("资料权限响应无效。"));
          }
        });
      });
      request.end();
    });
  const member = peerSessionMember(await read("session"));
  if (member.id !== scope.memberId || member.labId !== scope.labId)
    throw Error("当前账号或课题组已变化。");
  const version = peerMembershipVersion(
    await read("labs/" + encodeURIComponent(scope.labId) + "/membership"),
    scope.memberId,
  );
  const request = requestId
    ? parsePeerRequest(
        peerResponseData(
          await read("peer-library/requests/" + encodeURIComponent(requestId)),
        ),
      )
    : undefined;
  if ((await cookie()) !== token || authority(event).owner !== auth.owner)
    throw Error("登录或页面已变化，请重新操作。");
  return {
    auth,
    key: JSON.stringify([service, scope.memberId, scope.labId, version]),
    request,
  };
}
