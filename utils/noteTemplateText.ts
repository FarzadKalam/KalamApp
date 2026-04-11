export type NoteTemplateTextSegment = {
  text: string;
  bold: boolean;
};

export const parseNoteTemplateTextSegments = (value: unknown): NoteTemplateTextSegment[] => {
  const text = String(value ?? '');
  if (!text) return [];

  const segments: NoteTemplateTextSegment[] = [];
  const regex = /\*\*(.+?)\*\*/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(text);

  while (match) {
    const fullMatch = match[0] || '';
    const innerText = match[1] || '';
    const start = Number(match.index || 0);
    const end = start + fullMatch.length;

    if (start > lastIndex) {
      segments.push({ text: text.slice(lastIndex, start), bold: false });
    }
    if (innerText) {
      segments.push({ text: innerText, bold: true });
    }

    lastIndex = end;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }

  if (segments.length === 0) {
    return [{ text, bold: false }];
  }
  return segments;
};
