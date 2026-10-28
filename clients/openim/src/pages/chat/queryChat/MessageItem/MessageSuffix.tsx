import { ExclamationCircleFilled, LoadingOutlined } from "@ant-design/icons";
import { MessageStatus } from "@openim/wasm-client-sdk";
import { Spin } from "antd";
import { FC } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

const MessageSuffix: FC<IMessageItemProps> = ({ message, isSender }) => {
  if (!isSender) return null;
  return (
    <div className={styles.suffix}>
      {message.status === MessageStatus.Sending && (
        <Spin
          aria-label="正在发送，尚未确认送达"
          className="flex"
          indicator={<LoadingOutlined style={{ fontSize: 16 }} spin rev={undefined} />}
        />
      )}
      {message.status === MessageStatus.Failed && (
        <ExclamationCircleFilled
          title="发送失败，请在输入区重试原消息核对结果"
          className="text-base text-[var(--warn-text)]"
          rev={undefined}
        />
      )}
    </div>
  );
};

export default MessageSuffix;
