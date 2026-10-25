import { MessageReceiveOption } from "@openim/wasm-client-sdk";
import { useEffect } from "react";
import { useConversationStore, useUserStore } from "@/store";

/** One process-wide subscription; unread counts remain SDK-owned. */
export function useMessageNotifications() {
  useEffect(() => {
    const update = () => {
      void window.electronAPI?.setMessageUnreadCount?.(
        useUserStore.getState().selfInfo.globalRecvMsgOpt === MessageReceiveOption.ReceiveWithoutNotification
          ? 0 : useConversationStore.getState().unReadCount,
      ).catch(() => console.warn("桌面消息提醒暂未同步"));
    };
    update();
    const unsubscribe = useConversationStore.subscribe((state, previous) => {
      if (state.unReadCount !== previous.unReadCount) update();
    });
    const unsubscribeUser = useUserStore.subscribe((state, previous) => {
      if (state.selfInfo.globalRecvMsgOpt !== previous.selfInfo.globalRecvMsgOpt) update();
    });
    return () => {
      unsubscribe();
      unsubscribeUser();
      void window.electronAPI?.setMessageUnreadCount?.(0).catch(() => {});
    };
  }, []);
}
