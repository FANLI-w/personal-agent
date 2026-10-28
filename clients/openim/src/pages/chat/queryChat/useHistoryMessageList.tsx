import { MessageItem, MessageViewType } from "@openim/wasm-client-sdk";
import { useLatest, useRequest } from "ahooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { useResearchStore } from "@/research/store";
import { useUserStore, useConversationStore } from "@/store";
import { matchesLocator, type MessageLocator } from "@/research/chat-timeline";
import { withRequestDeadline } from "@/research/request-deadline";
import emitter, { emit } from "@/utils/events";

const START_INDEX = 10000;
const SPLIT_COUNT = 20;
const INITIAL_LOAD_STATE = {
  initLoading: true,
  hasMoreOld: true,
  messageList: [] as MessageItem[],
  firstItemIndex: START_INDEX,
};

export function useHistoryMessageList() {
  const { conversationID } = useParams();
  const [loadState, setLoadState] = useState(INITIAL_LOAD_STATE);
  const latestLoadState = useLatest(loadState);
  const latestConversationID = useLatest(conversationID);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const loadingPage = useRef(false);
  const [historyError, setHistoryError] = useState("");
  const sdkReady = useUserStore(
    (state) =>
      !state.isLogining &&
      state.connectState === "success" &&
      state.syncState === "success" &&
      Boolean(state.selfInfo.userID),
  );
  const latestSdkReady = useLatest(sdkReady);
  const actorGeneration = useResearchStore((state) => state.generation);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadGeneration.current++;
    };
  }, []);

  const { loading: moreOldLoading, runAsync: getMoreOldMessages } = useRequest(
    async (loadMore = true) => {
      if (!conversationID || !latestSdkReady.current) return;
      if (loadingPage.current) return;
      loadingPage.current = true;
      const reqConversationID = conversationID;
      const generation = useResearchStore.getState().generation;
      const historyGeneration = loadGeneration.current;
      const userID = useUserStore.getState().selfInfo.userID;
      const isCurrent = () =>
        mounted.current &&
        latestSdkReady.current &&
        latestConversationID.current === reqConversationID &&
        historyGeneration === loadGeneration.current &&
        generation === useResearchStore.getState().generation &&
        userID === useUserStore.getState().selfInfo.userID;
      try {
        const { data } = await withRequestDeadline(
          () =>
            IMSDK.getAdvancedHistoryMessageList({
              count: SPLIT_COUNT,
              startClientMsgID: loadMore
                ? latestLoadState.current.messageList[0]?.clientMsgID
                : "",
              conversationID: reqConversationID,
              viewType: MessageViewType.History,
            }),
          30000,
        );
        if (!isCurrent()) return;
        setHistoryError("");
        const preState = latestLoadState.current;
        const nextState = (() => {
          // SDK live events can arrive before the history promise settles.
          // Keep them, and merge overlapping locators exactly once.
          const existing = new Set(preState.messageList.map((m) => m.clientMsgID));
          const merged = new Map(
            [...data.messageList, ...preState.messageList].map((m) => [
              m.clientMsgID,
              m,
            ]),
          );
          return {
            ...preState,
            initLoading: false,
            hasMoreOld: !data.isEnd,
            messageList: [...merged.values()].sort(
              (a, b) => a.sendTime - b.sendTime || (a.seq || 0) - (b.seq || 0),
            ),
            firstItemIndex:
              preState.firstItemIndex -
              data.messageList.filter((m) => !existing.has(m.clientMsgID)).length,
          };
        })();
        latestLoadState.current = nextState;
        setLoadState(nextState);
      } catch (error) {
        // A route reload can mount this hook before SDK login. Also consume
        // failures of requests that belonged to a closed route or prior actor.
        if (!isCurrent()) return;
        setLoadState((previous) => ({ ...previous, initLoading: false }));
        setHistoryError("历史消息读取失败，可以重试；已加载内容保留。");
      } finally {
        if (historyGeneration === loadGeneration.current) loadingPage.current = false;
      }
    },
    { manual: true },
  );

  const loadHistoryMessages = useCallback(() => {
    loadGeneration.current++;
    loadingPage.current = false;
    setHistoryError("");
    latestLoadState.current = INITIAL_LOAD_STATE;
    setLoadState(INITIAL_LOAD_STATE);
    void getMoreOldMessages(false);
  }, [getMoreOldMessages]);

  useEffect(() => {
    if (sdkReady && conversationID) loadHistoryMessages();
  }, [conversationID, sdkReady, actorGeneration, loadHistoryMessages]);

  useEffect(() => {
    const pushNewMessage = (message: MessageItem) => {
      const current = useConversationStore.getState().currentConversation;
      if (
        current?.conversationID !== conversationID ||
        (current?.groupID
          ? message.groupID !== current.groupID
          : !!message.groupID ||
            ![message.sendID, message.recvID].includes(current?.userID || ""))
      )
        return;
      setLoadState((preState) =>
        preState.messageList.some((item) => item.clientMsgID === message.clientMsgID)
          ? preState
          : {
              ...preState,
              messageList: [...preState.messageList, message],
            },
      );
    };
    const updateOneMessage = (message: MessageItem) => {
      setLoadState((preState) => {
        const tmpList = [...preState.messageList];
        const idx = tmpList.findIndex((msg) => msg.clientMsgID === message.clientMsgID);
        if (idx < 0) {
          return preState;
        }

        tmpList[idx] = { ...tmpList[idx], ...message };
        return {
          ...preState,
          messageList: tmpList,
        };
      });
    };
    emitter.on("PUSH_NEW_MSG", pushNewMessage);
    emitter.on("UPDATE_ONE_MSG", updateOneMessage);
    return () => {
      emitter.off("PUSH_NEW_MSG", pushNewMessage);
      emitter.off("UPDATE_ONE_MSG", updateOneMessage);
    };
  }, [latestLoadState, conversationID]);

  const seekMessage = async (locator: MessageLocator) => {
    const epoch = loadGeneration.current;
    for (let page = 0; page < 100; page++) {
      if (epoch !== loadGeneration.current || !mounted.current) return undefined;
      const found = latestLoadState.current.messageList.find((m) =>
        matchesLocator(m, locator),
      );
      if (found) return found;
      if (!latestLoadState.current.hasMoreOld || loadingPage.current) break;
      const before = latestLoadState.current.messageList.length;
      await getMoreOldMessages(true);
      if (before === latestLoadState.current.messageList.length) break;
    }
    return undefined;
  };

  return {
    SPLIT_COUNT,
    loadState,
    latestLoadState,
    conversationID,
    moreOldLoading,
    getMoreOldMessages,
    seekMessage,
    historyError,
  };
}

export const pushNewMessage = (message: MessageItem) => emit("PUSH_NEW_MSG", message);
export const updateOneMessage = (message: MessageItem) =>
  emit("UPDATE_ONE_MSG", message);
