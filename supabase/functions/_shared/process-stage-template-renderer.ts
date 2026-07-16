const EXACT_TOKEN = /^\{\{\s*([^}]+?)\s*\}\}$/;
const INLINE_TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

type StageTemplateInput = {
  stageName: string;
  metadata: Record<string, any>;
};

const renderTextKeepingUnresolvedTokens = async (
  template: string,
  renderText: (template: string) => Promise<string>,
  resolveRaw: (fieldKey: string) => Promise<any>,
) => {
  const tokens = Array.from(template.matchAll(INLINE_TOKEN));
  if (tokens.length === 0) return await renderText(template);
  let protectedTemplate = template;
  const protectedTokens: Array<{ marker: string; token: string }> = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index]?.[0] || '');
    const fieldKey = String(tokens[index]?.[1] || '').trim();
    const resolved = await resolveRaw(fieldKey);
    if (resolved !== null && resolved !== undefined) continue;
    const marker = `__TAZE_UNRESOLVED_PROCESS_TOKEN_${index}__`;
    protectedTemplate = protectedTemplate.replace(token, marker);
    protectedTokens.push({ marker, token });
  }
  let rendered = await renderText(protectedTemplate);
  protectedTokens.forEach(({ marker, token }) => {
    rendered = rendered.replace(marker, token);
  });
  return rendered;
};

const renderTemplateData = async (
  value: any,
  renderText: (template: string) => Promise<string>,
  resolveRaw: (fieldKey: string) => Promise<any>,
): Promise<any> => {
  if (typeof value === 'string') {
    const exact = value.match(EXACT_TOKEN);
    if (exact) {
      const resolved = await resolveRaw(String(exact[1] || '').trim());
      return resolved === null || resolved === undefined ? value : resolved;
    }
    return await renderTextKeepingUnresolvedTokens(value, renderText, resolveRaw);
  }
  if (Array.isArray(value)) {
    return await Promise.all(value.map((item) => renderTemplateData(item, renderText, resolveRaw)));
  }
  if (value && typeof value === 'object') {
    const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [
      key,
      await renderTemplateData(item, renderText, resolveRaw),
    ] as const));
    return Object.fromEntries(entries);
  }
  return value;
};

export const renderProcessStageForTaskCreation = async (
  input: StageTemplateInput,
  renderText: (template: string) => Promise<string>,
  resolveRaw: (fieldKey: string) => Promise<any>,
) => {
  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const renderedStageName = String(await renderTextKeepingUnresolvedTokens(String(input.stageName || ''), renderText, resolveRaw)).trim()
    || String(input.stageName || '').trim()
    || 'فعالیت فرآیند';

  const renderedDescription = typeof metadata.description === 'string'
    ? String(await renderTextKeepingUnresolvedTokens(metadata.description, renderText, resolveRaw)).trim() || null
    : metadata.description ?? null;
  const renderedCustomFields = Array.isArray(metadata.process_task_custom_fields)
    ? await Promise.all(metadata.process_task_custom_fields.map(async (field: any) => {
        if (!field || typeof field !== 'object') return field;
        const next = { ...field };
        if (Object.prototype.hasOwnProperty.call(next, 'defaultValue')) {
          next.defaultValue = await renderTemplateData(next.defaultValue, renderText, resolveRaw);
        }
        if (Object.prototype.hasOwnProperty.call(next, 'default_value')) {
          next.default_value = await renderTemplateData(next.default_value, renderText, resolveRaw);
        }
        return next;
      }))
    : metadata.process_task_custom_fields;
  const renderedCustomValues = metadata.process_task_custom_field_values
    && typeof metadata.process_task_custom_field_values === 'object'
      ? await renderTemplateData(metadata.process_task_custom_field_values, renderText, resolveRaw)
      : metadata.process_task_custom_field_values;

  return {
    stageName: renderedStageName,
    metadata: {
      ...metadata,
      description: renderedDescription,
      ...(renderedCustomFields !== undefined ? { process_task_custom_fields: renderedCustomFields } : {}),
      ...(renderedCustomValues !== undefined ? { process_task_custom_field_values: renderedCustomValues } : {}),
      template_rendered_server_side: true,
    },
  };
};
