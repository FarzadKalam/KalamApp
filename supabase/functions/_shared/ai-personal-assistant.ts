const softwareRoleNames: Record<string, string> = {
  super_admin: 'مدیر ارشد',
  admin: 'مدیر',
  manager: 'مدیر',
  editor: 'ویرایشگر',
  member: 'همکار',
  viewer: 'مشاهده‌گر',
};

export const cleanWorkTitle = (value: unknown) => {
  const title = typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 85) : '';
  return /^[0-9a-f-]{36}$/i.test(title) ? '' : title;
};

export const personalAssistantTitle = (role: unknown, softwareRole?: unknown) => {
  const title = cleanWorkTitle(role) || (typeof softwareRole === 'string' ? softwareRoleNames[softwareRole] : '');
  return title ? `دستیار ${title}` : 'دستیار من';
};
