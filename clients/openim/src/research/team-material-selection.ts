import type {
  TeamLibraryEntry,
  TeamLibraryManifest,
} from "@research-agent-platform/contracts";

export function findTeamMaterials(
  manifest: TeamLibraryManifest,
  question: string,
): TeamLibraryEntry[] {
  const query = question.trim().toLowerCase();
  if (!query) return [];
  const wantsTemplate = /模板|版式|范文|样例/.test(query);
  const wantsFigure = /图|照片|素材/.test(query);
  const pairs = Array.from(
    new Set(Array.from(query.matchAll(/(?=([\p{L}\p{N}]{2}))/gu), (match) => match[1])),
  );
  return manifest.entries
    .map((entry) => {
      const text = [
        entry.name,
        entry.summary,
        manifest.projects.find((p) => p.id === entry.projectId)?.name,
      ]
        .join(" ")
        .toLowerCase();
      const purpose =
        (wantsTemplate && entry.purpose === "template") ||
        (wantsFigure && entry.purpose === "figure");
      const score =
        (purpose ? 10 : 0) +
        pairs.filter((pair) => text.includes(pair)).length +
        (entry.recommended ? 1 : 0);
      return {
        entry,
        score,
        matched: purpose || pairs.some((pair) => text.includes(pair)),
      };
    })
    .filter((value) => value.matched)
    .sort(
      (a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name, "zh-CN"),
    )
    .slice(0, 16)
    .map(({ entry }) => entry);
}

export function selectedTeamEntryIds(params: URLSearchParams): string[] {
  return Array.from(new Set(params.getAll("teamEntry").filter(Boolean))).slice(0, 19);
}
