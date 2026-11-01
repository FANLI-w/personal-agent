import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        throw Error("Unexpected import: " + name);
      },
    },
    { filename: file },
  );
  return module.exports;
}

const {
  isPptTemplate,
  pptTemplateName,
  pptTemplateTitle,
  composePptTemplate,
  parsePptTemplate,
  pptStartPrompt,
} = await load("../src/research/ppt-template.ts");

test("a template is a lab rule with a fixed prefix", () => {
  const title = pptTemplateTitle("  组会汇报  ");
  assert.equal(title, "PPT 模板｜组会汇报");
  assert.equal(isPptTemplate(title), true);
  assert.equal(pptTemplateName(title), "组会汇报");
  assert.equal(isPptTemplate("引用格式"), false);
  // Long names are cut, not rejected, so saving never fails on length alone.
  assert.equal(pptTemplateTitle("长".repeat(100)).length, 80);
});

test("requirements and the file list survive a round trip", () => {
  const content = composePptTemplate({
    name: "组会汇报",
    requirements: "受众：课题组\n页数：12\n配色：深蓝主色",
    files: ["组会母版.pptx", "  ", "成果统计.xlsx"],
  });
  assert.match(content, /^受众：课题组/);
  assert.match(content, /需要准备的文件：/);
  const parsed = parsePptTemplate("PPT 模板｜组会汇报", content);
  assert.equal(parsed.name, "组会汇报");
  assert.equal(parsed.requirements, "受众：课题组\n页数：12\n配色：深蓝主色");
  // The module runs in another realm, so compare the values, not the prototypes.
  assert.equal(parsed.files.join("|"), "组会母版.pptx|成果统计.xlsx");
});

test("a template without files keeps the whole body as requirements", () => {
  const parsed = parsePptTemplate("PPT 模板｜答辩", "页数 15，面向企业");
  assert.equal(parsed.requirements, "页数 15，面向企业");
  assert.equal(parsed.files.length, 0);
});

test("the prepared message carries requirements, files and leaves room for this run", () => {
  const prompt = pptStartPrompt({
    name: "组会汇报",
    requirements: "页数 12",
    files: ["母版.pptx"],
  });
  assert.match(prompt, /已确认的要求：\n页数 12/);
  assert.match(prompt, /工作文件夹里会放这些文件/);
  assert.match(prompt, /- 母版\.pptx/);
  assert.match(prompt, /本次变化：/);
});

test("the standards page reads templates out of the same lab rules", async () => {
  const page = await readFile(
    new URL("../src/research/LabStandards.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /isPptTemplate\(r\.title\)/);
  assert.match(page, /pptTemplateTitle\(draft\.title\)/);
  assert.match(page, /composePptTemplate\(/);
  assert.match(page, /用它开始/);
  // Starting a deck hands the assistant a prepared message, not a new form.
  assert.match(page, /draft: pptStartPrompt\(template\)/);
});
