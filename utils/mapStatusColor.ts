const STATUS_COLOR_MAP: Record<string, string> = {
  green: '#16a34a', red: '#dc2626', blue: '#2563eb', orange: '#ea580c', yellow: '#ca8a04',
  purple: '#7c3aed', cyan: '#0891b2', gray: '#64748b', grey: '#64748b', pink: '#db2777',
  gold: '#d97706', volcano: '#e34d20', default: '#64748b',
};

export const resolveMapStatusColor = (rawColor: unknown) => {
  const color = String(rawColor || '').trim().toLowerCase();
  if (!color) return '';
  if (color.startsWith('#') || color.startsWith('rgb') || color.startsWith('hsl')) return color;
  return STATUS_COLOR_MAP[color] || '';
};
