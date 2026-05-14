export function excerptFirstParagraph(content: string): string {
  const lines = content.split('\n');
  const paragraph: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (paragraph.length > 0) break;
      continue;
    }
    if (line.startsWith('#')) continue;
    paragraph.push(line);
  }
  const text = paragraph.join(' ');
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}
