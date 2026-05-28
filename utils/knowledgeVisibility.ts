export type KnowledgeVisibilityOption = {
  label: string;
  value: string;
};

export const normalizeKnowledgeVisibilityIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item || '').trim())
        .filter(Boolean)
    )
  );
};

export const formatKnowledgeVisibilitySummary = (
  userIds: unknown,
  roleIds: unknown,
  userOptions: KnowledgeVisibilityOption[],
  roleOptions: KnowledgeVisibilityOption[]
) => {
  const users = normalizeKnowledgeVisibilityIds(userIds);
  const roles = normalizeKnowledgeVisibilityIds(roleIds);
  if (users.length === 0 && roles.length === 0) return 'همه سازمان';

  const userMap = new Map(userOptions.map((option) => [option.value, option.label]));
  const roleMap = new Map(roleOptions.map((option) => [option.value, option.label]));
  const labels = [
    ...users.slice(0, 2).map((id) => userMap.get(id)).filter(Boolean),
    ...roles.slice(0, 2).map((id) => roleMap.get(id)).filter(Boolean),
  ];

  if (labels.length > 0) {
    const remaining = Math.max(0, users.length + roles.length - labels.length);
    return remaining > 0 ? `${labels.join('، ')} +${remaining.toLocaleString('fa-IR')}` : labels.join('، ');
  }

  return [
    users.length ? `${users.length.toLocaleString('fa-IR')} شخص` : '',
    roles.length ? `${roles.length.toLocaleString('fa-IR')} نقش` : '',
  ].filter(Boolean).join('، ');
};
