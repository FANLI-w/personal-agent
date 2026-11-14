export const deliveryFilename = (name: string) => name.split(/[\\/]/).at(-1) || name;
export function prepareTaskDelivery(
  text: string,
  title: string,
  outputs: string[],
  attached: string[],
) {
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
  const exact = candidates.filter((name) => text.includes(deliveryFilename(name)));
  const mentioned = [
    ...text.matchAll(
      /([^\s"“”「」,，、;；]+?\.(?:pptx?|docx?|xlsx?|pdf|png|jpe?g|txt|md|csv|tsv|json|zip))(?![a-zA-Z0-9])/gi,
    ),
  ].map((match) => match[1]);
  if (
    mentioned.some(
      (token) =>
        !exact.some(
          (name) =>
            token.endsWith(deliveryFilename(name)) ||
            deliveryFilename(name).endsWith(token),
        ),
    )
  )
    return { question: "有文件还没找到，请附齐文件后再提交。", names: [] };
  if (exact.length) {
    if (new Set(exact.map(deliveryFilename)).size < exact.length)
      return { question: "有几份同名文件，请选择要交的那一份。", names: [] };
    return { question: "", names: exact };
  }
  if (/[\p{L}\p{N}_-]+\.[a-zA-Z0-9]{2,8}/u.test(text))
    return { question: "没有找到这份文件，请附上它，或选择已有文件。", names: [] };
  if (attached.length) return { question: "", names: attached };
  if (outputs.length === 1) return { question: "", names: outputs };
  return {
    question: outputs.length
      ? "要交哪份？选择下方文件，或附上新文件。"
      : "把要交的文件附给我，就可以提交。",
    names: [],
  };
}
