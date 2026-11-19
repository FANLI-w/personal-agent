export const deliveryFilename = (name: string) => name.split(/[\\/]/).at(-1) || name;
export const maxTaskDeliveryFiles = 5;

export function deliveryFileDetails(name: string, size?: number) {
  const parts = name.split(/[\\/]/);
  const snapshot = /^delivery-([a-f0-9]{64})$/.exec(parts[0]);
  const folder = parts.slice(0, -1).join("/");
  const origin = snapshot
    ? "从电脑选入"
    : folder
    ? `工作文件夹 / ${folder}`
    : "工作文件夹";
  return [
    origin,
    size === undefined
      ? undefined
      : size < 1024
      ? `${size} B`
      : size < 1048576
      ? `${(size / 1024).toFixed(1)} KiB`
      : `${(size / 1048576).toFixed(1)} MiB`,
    snapshot && `版本 ${snapshot[1].slice(0, 12)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Internal staging folders carry integrity hashes; show only the delivered filename. */
export function deliveryDisplaySummary(summary: string) {
  return summary.replace(/delivery-[a-f0-9]{64}[\\/]/g, "");
}
export function deliveryReceiptLabel(status: string) {
  if (["in_review", "awaiting_review"].includes(status)) return "已提交，等待验收";
  if (status === "completed") return "成果已验收";
  if (status === "changes_requested") return "上版已退回，请修改后再提交";
  if (status === "cancelled") return "任务已结束 · 上次提交记录";
  return "上次提交记录";
}
type PreparedTaskDelivery = {
  question: string;
  names: string[];
  alternatives?: string[][];
};

const instructionPrefix =
  /^(?:(?:请|麻烦|能不能|可以)\s*)?(?:(?:帮我|给我)\s*)?(?:(?:把|将|提交|交一下|交上|交给|交|上传)\s*(?:文件\s+)?)?/;
const connectorPrefix = /^(?:以及|还有|和|与|及|再|加上)\s*/;

/** Remove only whole instruction prefixes. The remainder must match a filename
 * exactly, even when a second filename happens to be a suffix of the first. */
function deliveryMentions(text: string, known: Set<string>, title: string) {
  const mentions: string[] = [];
  for (const match of text.matchAll(
    /["“「]([^"”」]+)["”」]|([^"“”「」,，、;；。\n]+?\.[a-z0-9]{1,12})(?![a-z0-9_-]|\.[a-z0-9])/gi,
  )) {
    let token = (match[1] ?? match[2]).trim();
    if (match[1]) {
      const followsDestination = /交到\s*$/.test(text.slice(0, match.index));
      if (
        (followsDestination && token === title) ||
        (!known.has(token) && !/\.[a-z0-9]{1,12}$/i.test(token))
      )
        continue;
    } else if (!known.has(token)) {
      if (mentions.length) token = token.replace(connectorPrefix, "");
      if (!known.has(token)) token = token.replace(instructionPrefix, "");
    }
    if (token) mentions.push(token);
  }
  return [...new Set(mentions)];
}

export function prepareTaskDelivery(
  text: string,
  title: string,
  outputs: string[],
  attached: string[],
): PreparedTaskDelivery {
  const candidates = [...new Set([...outputs, ...attached])];
  if (/不要|别交|先不|取消|不交|暂不|停止/.test(text))
    return { question: "这次先不提交。", names: [] };
  if (!/提交|交给|交到|帮我交|交一下|交上|发给/.test(text))
    return { question: "告诉我要提交哪份文件，或点附上文件。", names: [] };
  if (
    /交到/.test(text) &&
    !text.includes(title) &&
    !/交到(?:这项任务|这项|这个任务|当前任务|这里|本任务)/.test(text)
  )
    return {
      question: `这里对应「${title}」。请确认任务，或打开要提交的那项任务。`,
      names: [],
    };
  const mentioned = deliveryMentions(
    text,
    new Set(candidates.map(deliveryFilename)),
    title,
  );
  const exact = mentioned.map((token) =>
    candidates.filter((name) => deliveryFilename(name) === token),
  );
  if (exact.some((matches) => !matches.length))
    return { question: "有文件还没找到，请附齐文件后再提交。", names: [] };
  if (exact.length) {
    if (exact.length > maxTaskDeliveryFiles)
      return { question: "每次最多提交 5 份文件，请减少后再准备。", names: [] };
    const names = exact.flatMap((matches) => (matches.length === 1 ? matches : []));
    const alternatives = exact.filter((matches) => matches.length > 1);
    return alternatives.length
      ? { question: "请选择每个同名文件要提交的版本。", names, alternatives }
      : { question: "", names };
  }
  if (/[\p{L}\p{N}_-]+\.[a-zA-Z0-9]{2,8}/u.test(text))
    return { question: "没有找到这份文件，请附上它，或选择已有文件。", names: [] };
  if (attached.length > maxTaskDeliveryFiles)
    return { question: "附上的文件超过 5 份，请说明本次要交哪几份。", names: [] };
  if (attached.length) return { question: "", names: attached };
  if (outputs.length === 1) return { question: "", names: outputs };
  return {
    question: outputs.length
      ? "要交哪份？从工作文件夹选择，或附上新文件。"
      : "把要交的文件附给我，就可以提交。",
    names: [],
  };
}
