import { FieldType } from '../types';

export const resolveConfiguredDefaultValue = (defaultValue: any) =>
  typeof defaultValue === 'function' ? defaultValue() : defaultValue;

export const getTodayLocalDateValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getFirstFieldOptionValue = (field: any) => {
  const firstOption = Array.isArray(field?.options) ? field.options.find((option: any) => option?.value !== undefined) : null;
  return firstOption?.value;
};

export const getImplicitCreateDefaultValue = (field: any) => {
  if (!field || field.readonly || field.hideInCreateForm) return undefined;
  if (field.type === FieldType.STATUS) {
    const firstStatus = getFirstFieldOptionValue(field);
    if (firstStatus !== undefined) return firstStatus;
  }
  if (field.defaultValue !== undefined) return resolveConfiguredDefaultValue(field.defaultValue);
  if (field.type === FieldType.DATE) return getTodayLocalDateValue();
  return undefined;
};
