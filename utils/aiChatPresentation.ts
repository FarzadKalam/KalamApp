type ModelMessage = { role: string; model?: string | null; provider?: string | null };
export function getAiModelTransitions(messages: ModelMessage[]) {
  const transitions = new Map<number, { from: string; to: string }>();
  let previous: string | null = null;
  messages.forEach((message, index) => {
    const model = message.role === 'assistant' ? message.model?.trim() : null;
    if (!model) return;
    if (previous && previous !== model) transitions.set(index, { from: previous, to: model });
    previous = model;
  });
  return transitions;
}
/** Derive from actual persisted responses, never from a selector/default-model refresh. */
export function getAiModelTransition(messages: ModelMessage[], index: number) {
  return getAiModelTransitions(messages).get(index) || null;
}
