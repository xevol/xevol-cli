import { pickValue } from "../../lib/utils";

export function buildMarkdownFromAnalysis(data: Record<string, unknown>): string {
  const title = pickValue(data, ["title", "videoTitle", "name"]) ?? "Untitled";
  const channel = pickValue(data, ["channel", "channelTitle", "author"]) ?? "";
  const url = pickValue(data, ["url", "youtubeUrl", "videoUrl"]) ?? "";
  const lang = pickValue(data, ["lang", "outputLang", "language"]) ?? "";
  const status = pickValue(data, ["status", "state"]) ?? "";
  const content =
    (data.cleanContent as string | undefined) ??
    (data.content as string | undefined) ??
    (data.transcript as string | undefined) ??
    "";

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  const meta: string[] = [];
  if (channel) meta.push(`- **Channel:** ${channel}`);
  if (url) meta.push(`- **URL:** ${url}`);
  if (lang) meta.push(`- **Language:** ${lang}`);
  if (status) meta.push(`- **Status:** ${status}`);
  if (meta.length > 0) {
    lines.push(...meta);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  if (content) {
    lines.push(content);
  } else {
    lines.push("*No transcript content available.*");
  }

  return lines.join("\n");
}
