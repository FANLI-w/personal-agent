import { GroupItem } from "@openim/wasm-client-sdk/lib/types/entity";

import OIMAvatar from "@/components/OIMAvatar";

const GroupListItem = ({
  source,
  showGroupCard,
  showGroupIdentifier,
}: {
  source: GroupItem;
  showGroupIdentifier: boolean;
  showGroupCard: (group: GroupItem) => void;
}) => {
  return (
    <button
      type="button"
      className="flex w-full flex-row rounded-md px-3.5 py-3 text-left transition-colors hover:bg-[var(--primary-active)]"
      onClick={() => showGroupCard(source)}
    >
      <OIMAvatar src={source?.faceURL} isgroup />
      <div className="ml-3 min-w-0">
        <p className="text-base">{source.groupName}</p>
        <p className="text-xs text-slate-500">
          {source.memberCount} 位成员
          {showGroupIdentifier && (
            <span title={source.groupID}> · 群号尾码 {source.groupID.slice(-12)}</span>
          )}
        </p>
        {source.introduction?.trim() && (
          <p className="truncate text-xs text-slate-500" title={source.introduction}>
            {source.introduction}
          </p>
        )}
      </div>
    </button>
  );
};

export default GroupListItem;
