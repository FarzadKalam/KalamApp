type OptionLike = {
  label?: string;
  value?: string | number;
  [key: string]: any;
};

export const mergeSelectOptions = (
  staticOptions?: OptionLike[] | null,
  dynamicOptions?: OptionLike[] | null
): OptionLike[] => {
  const map = new Map<string, OptionLike>();
  const pushOption = (item: OptionLike | null | undefined) => {
    if (!item) return;
    const value = String(item.value ?? '').trim();
    if (!value) return;
    if (!map.has(value)) map.set(value, item);
  };

  (staticOptions || []).forEach(pushOption);
  (dynamicOptions || []).forEach(pushOption);
  return Array.from(map.values());
};

