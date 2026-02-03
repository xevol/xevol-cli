export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [];

  const lines: string[] = [];
  const paragraphs = text.split(/\r?\n/);

  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }

    const words = paragraph.trim().split(/\s+/);
    let current = "";

    for (const word of words) {
      if (current.length === 0) {
        if (word.length <= width) {
          current = word;
        } else {
          for (let i = 0; i < word.length; i += width) {
            lines.push(word.slice(i, i + width));
          }
          current = "";
        }
        continue;
      }

      if (current.length + 1 + word.length <= width) {
        current = `${current} ${word}`;
        continue;
      }

      lines.push(current);
      if (word.length <= width) {
        current = word;
      } else {
        for (let i = 0; i < word.length; i += width) {
          lines.push(word.slice(i, i + width));
        }
        current = "";
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines;
}
