import type { Contact } from "@research-agent-platform/contracts";
import { forwardRef, type ComponentPropsWithoutRef } from "react";

import OIMAvatar from "@/components/OIMAvatar";
import personalAssistantAvatar from "@/assets/avatar/dafeiyu.png";
import { useResearchStore } from "./store";

type Props = ComponentPropsWithoutRef<typeof OIMAvatar> & {
  contact?: Contact;
  userID?: string;
};

/** Resolve the built-in assistant by identity, including old messages and SDK caches. */
const ResearchAvatar = forwardRef<HTMLSpanElement, Props>(
  ({ contact, userID, ...props }, ref) => {
    const personalAssistant = useResearchStore((state) => {
      if (props.isgroup) return false;
      const identity = contact ?? (userID
        ? state.contacts.find((entry) => entry.userID === userID)?.contact
        : undefined);
      if (identity)
        return identity.identity.kind === "personal_agent" &&
          identity.profile.role === "coordinator" && !identity.agentRuntime;
      // The fixed assistant can render before its contact list has synchronized.
      return Boolean(userID && state.session?.status === "available" &&
        state.sessionActorId === state.actor?.member.id &&
        state.session.coordinator?.peerUserID === userID);
    });

    return (
      <OIMAvatar
        {...props}
        ref={ref}
        src={personalAssistant ? personalAssistantAvatar : props.src}
        bgColor={personalAssistant ? "#edf4ff" : props.bgColor}
        alt={personalAssistant ? (props.alt || props.text || "个人助理") : props.alt}
      />
    );
  },
);

export default ResearchAvatar;
