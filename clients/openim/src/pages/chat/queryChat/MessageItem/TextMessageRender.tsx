import { FC } from "react";

import { readableMessage, useCoordinatorSdkSender } from "@/research/chat-reply";
import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const TextMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const coordinator = useCoordinatorSdkSender(message.sendID);
  return (
    <div className={`${styles.bubble} chat-plain-message${coordinator ? " chat-assistant-reply" : ""}`}>
      <SafeMessageMarkdown text={readableMessage(message, coordinator)} />
    </div>
  );
};

export default TextMessageRender;
