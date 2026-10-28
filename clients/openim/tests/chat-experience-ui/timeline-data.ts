export const sdkCalls: any[] = [];
export const sdkBehavior = { loseAck: false };
export const nativeMessages: any[] = [];
export function seedTimeline() {
  const now = Date.now();
  nativeMessages.splice(
    0,
    nativeMessages.length,
    ...Array.from({ length: 65 }, (_, i) => ({
      clientMsgID: `native_${i}`,
      sendID: i % 2 ? "im_peer" : "im_me",
      recvID: "",
      groupID: "test_group",
      senderNickname: i % 2 ? "测试同事" : "测试老师",
      contentType: 101,
      status: 2,
      sendTime: now - (65 - i) * 1500,
      seq: i + 1,
      textElem: {
        content:
          i === 2
            ? "检索锚点：实验对照组设置"
            : `第 ${i + 1} 条交流：对照组与样本准备，下一步核对方法。`,
      },
    })),
  );
}
