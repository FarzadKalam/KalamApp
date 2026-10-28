export type SaasPlanDisplayFeature = { text: string; featured: boolean };

export const parseSaasPlanDisplayFeatures = (raw: unknown): SaasPlanDisplayFeature[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item, index) => {
      if (typeof item === 'string') return { text: item.trim(), featured: index < 6 };
      return { text: String(item?.text ?? '').trim(), featured: Boolean(item?.featured) };
    })
    .filter((item) => item.text);
};
