const normalizeText = (value: unknown) => String(value || '').trim();

const getValueByPath = (record: Record<string, any> | null | undefined, path: string) => {
  const normalizedPath = normalizeText(path);
  if (!record || !normalizedPath) return undefined;
  const segments = normalizedPath.split('.').map((segment) => segment.trim()).filter(Boolean);
  let current: any = record;
  for (const segment of segments) {
    current = current?.[segment];
    if (current === null || current === undefined) break;
  }
  return current;
};

const buildModuleAliasCandidates = (moduleId: string) => {
  const normalizedModuleId = normalizeText(moduleId).toLowerCase();
  if (!normalizedModuleId) return [] as string[];

  const aliases = new Set<string>([normalizedModuleId]);
  if (normalizedModuleId.endsWith('ies') && normalizedModuleId.length > 3) {
    aliases.add(`${normalizedModuleId.slice(0, -3)}y`);
  }
  if (normalizedModuleId.endsWith('s') && normalizedModuleId.length > 1) {
    aliases.add(normalizedModuleId.slice(0, -1));
  }
  return Array.from(aliases).filter(Boolean);
};

export const assignProcessTemplateModuleAliases = (
  target: Record<string, any>,
  moduleId: string | null | undefined,
  record: Record<string, any> | null | undefined,
) => {
  const aliases = buildModuleAliasCandidates(String(moduleId || ''));
  if (!record || aliases.length === 0) return;

  Object.entries(record).forEach(([fieldKey, value]) => {
    const normalizedFieldKey = normalizeText(fieldKey);
    if (!normalizedFieldKey) return;
    aliases.forEach((alias) => {
      target[`${alias}_${normalizedFieldKey}`] = value;
    });
  });
};

export const resolveProcessTemplateTokenValue = (
  record: Record<string, any> | null | undefined,
  tokenKey: string,
) => {
  const normalizedTokenKey = normalizeText(tokenKey);
  if (!record || !normalizedTokenKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(record, normalizedTokenKey)) {
    return record[normalizedTokenKey];
  }
  if (normalizedTokenKey.includes('.')) {
    return getValueByPath(record, normalizedTokenKey);
  }
  return undefined;
};
