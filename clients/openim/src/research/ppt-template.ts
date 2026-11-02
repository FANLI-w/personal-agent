/**
 * A PPT template is a lab rule with a fixed title prefix. Requirements and the
 * files to prepare live in its body, so a template is versioned, shareable and
 * publishable exactly like any other rule, without a second entity to maintain.
 */
export const PPT_TEMPLATE_PREFIX = "PPT 模板｜";

export type PptTemplate = {
  name: string;
  /** 受众、页数、配色、字体、结构这类每次都要重复说的要求。 */
  requirements: string;
  /** 这次要放进工作文件夹的文件名，按顺序列出。 */
  files: string[];
};

export function isPptTemplate(title: string) {
  return title.startsWith(PPT_TEMPLATE_PREFIX);
}

export function pptTemplateName(title: string) {
  return isPptTemplate(title) ? title.slice(PPT_TEMPLATE_PREFIX.length) : title;
}

export function pptTemplateTitle(name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  return PPT_TEMPLATE_PREFIX + clean.slice(0, 80 - PPT_TEMPLATE_PREFIX.length);
}

/** Keep the body readable in the rule list: requirements first, then a file list. */
export function composePptTemplate(template: PptTemplate) {
  const requirements = template.requirements.trim();
  const files = template.files.map((f) => f.trim()).filter(Boolean);
  return [
    requirements,
    ...(files.length ? ["", "需要准备的文件：", ...files.map((f) => `- ${f}`)] : []),
  ]
    .join("\n")
    .trim();
}

export function parsePptTemplate(title: string, content: string): PptTemplate {
  const lines = content.replace(/\r/g, "").split("\n");
  const start = lines.findIndex((line) => /^需要准备的文件[:：]\s*$/.test(line.trim()));
  const body = start < 0 ? lines : lines.slice(0, start);
  const files =
    start < 0
      ? []
      : lines
          .slice(start + 1)
          .map((line) => line.trim())
          .filter((line) => /^[-*·]\s*\S/.test(line))
          .map((line) => line.replace(/^[-*·]\s*/, "").trim());
  return {
    name: pptTemplateName(title),
    requirements: body.join("\n").trim(),
    files,
  };
}

/**
 * The message the assistant receives. It states the reused requirements and the
 * files to expect, so the person only adds what changed this time.
 */
export function pptStartPrompt(template: PptTemplate) {
  const requirements = template.requirements.trim();
  const files = template.files.map((f) => f.trim()).filter(Boolean);
  return [
    "用这套 PPT 模板做一份演示，先按下面的要求整理页面结构，再开始制作。",
    requirements ? `\n已确认的要求：\n${requirements}` : "",
    files.length
      ? `\n工作文件夹里会放这些文件，先读它们再动笔：\n${files
          .map((f) => `- ${f}`)
          .join("\n")}`
      : "",
    "\n本次变化：",
  ]
    .join("\n")
    .trim();
}
