import { FieldType } from '../../types';

export const dedupeOptionsByLabel = (options: any[]) => {
  const map = new Map<string, any>();
  options.forEach((opt) => {
    const label = opt?.label ?? String(opt?.value ?? '');
    if (!map.has(label)) map.set(label, opt);
  });
  return Array.from(map.values());
};

export const normalizeFilterValue = (
  col: any,
  rawValue: any,
  dynamicOptions: Record<string, any[]>,
  localDynamicOptions: Record<string, any[]>
) => {
  if (rawValue === undefined || rawValue === null || rawValue === '') return null;

  let normalizedRaw = rawValue;
  if ((col?.type === FieldType.MULTI_SELECT || col?.type === FieldType.TAGS) && typeof normalizedRaw === 'string') {
    const trimmed = normalizedRaw.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) normalizedRaw = parsed;
      } catch {
        // ignore parsing errors
      }
    }
  }

  const normalizeSingle = (val: any) => {
    if (val && typeof val === 'object') {
      if ('value' in val) return (val as any).value;
      if ('label' in val) return (val as any).label;
    }
    return val;
  };

  const resolveDynamicLabel = (val: any) => {
    const opts = col?.dynamicOptionsCategory
      ? (dynamicOptions[col.dynamicOptionsCategory] || localDynamicOptions[col.dynamicOptionsCategory] || [])
      : [];
    if (!opts.length) return val;

    if (val && typeof val === 'object') {
      if ('label' in val && (val as any).label) return (val as any).label;
      if ('value' in val) {
        const byObjValue = opts.find((o: any) => o.value === (val as any).value);
        if (byObjValue?.label) return byObjValue.label;
      }
    }

    if (typeof val !== 'string') return val;
    const byValue = opts.find((o: any) => o.value === val);
    if (byValue?.label) return byValue.label;
    const byLabel = opts.find((o: any) => o.label === val);
    if (byLabel?.label) return byLabel.label;
    return val;
  };

  if (Array.isArray(normalizedRaw)) {
    const mapped = normalizedRaw
      .map((v) => {
        const single = normalizeSingle(v);
        if (col?.dynamicOptionsCategory) {
          return resolveDynamicLabel(v ?? single);
        }
        return single;
      })
      .filter((v) => v !== undefined && v !== null && v !== '');
    return mapped.length > 0 ? Array.from(new Set(mapped.map((v) => (typeof v === 'string' ? v.trim() : v)))) : null;
  }

  if (col?.dynamicOptionsCategory) {
    const label = resolveDynamicLabel(normalizedRaw);
    if (typeof label === 'string') {
      const trimmed = label.trim();
      return trimmed ? trimmed : null;
    }
    return label ?? null;
  }

  const single = normalizeSingle(normalizedRaw);
  return single;
};
