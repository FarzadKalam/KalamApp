/** GFM-style tables; text only, with pipes inside inline code and escaped pipes preserved. */
export const splitAiTableRow = (line: string): string[] => {
  const cells: string[] = []; let value = ''; let code = false;
  const trimmed = line.trim();
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
    if (char === '\\' && !code && ['|', '\\'].includes(trimmed[index + 1])) { value += trimmed[++index]; continue; }
    if (char === '`') code = !code;
    if (char === '|' && !code) { cells.push(value.trim()); value = ''; } else value += char;
  }
  cells.push(value.trim());
  if (line.trim().startsWith('|')) cells.shift();
  if (line.trim().endsWith('|') && cells.at(-1) === '') cells.pop();
  return cells;
};

export function parseAiMarkdownTable(lines: string[], start: number) {
  if (!lines[start]?.includes('|') || !lines[start + 1]?.includes('|')) return null;
  const headers = splitAiTableRow(lines[start]);
  const separators = splitAiTableRow(lines[start + 1]);
  if (!headers.length || headers.length > 64 || headers.length !== separators.length || !separators.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  const rows: string[][] = []; let end = start + 1;
  for (let index = start + 2; index < lines.length && rows.length < 200; index++) {
    if (!lines[index].trim() || !lines[index].includes('|')) break;
    const cells = splitAiTableRow(lines[index]);
    // Preserve malformed/wider rows as ordinary text instead of discarding cell data.
    if (cells.length > headers.length) break;
    rows.push(headers.map((_, column) => cells[column] || '')); end = index;
  }
  return { headers, rows, end };
}
