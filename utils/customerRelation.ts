import { formatPhoneForDisplay } from './phoneNumber';
import { toPersianNumber } from './persianNumberFormatter';

const cleanPart = (value: unknown): string => String(value || '').trim();

export const getCustomerPrimaryName = (row: any, targetField = 'full_name'): string => {
  const directValue = cleanPart(row?.[targetField]);
  const fullName = cleanPart(row?.full_name);
  const lastName = cleanPart(row?.last_name);
  const businessName = cleanPart(row?.business_name);
  const legalName = cleanPart(row?.legal_name);
  const firstName = cleanPart(row?.first_name);

  return (
    directValue ||
    fullName ||
    lastName ||
    businessName ||
    legalName ||
    firstName ||
    cleanPart(row?.system_code) ||
    cleanPart(row?.id) ||
    'بدون نام'
  );
};

export const buildCustomerRelationLabel = (row: any, targetField = 'full_name'): string => {
  const baseName = getCustomerPrimaryName(row, targetField);
  const phoneValue = cleanPart(row?.mobile_1 || row?.mobile || row?.phone);
  if (!phoneValue) return baseName;
  const formattedPhone = formatPhoneForDisplay(phoneValue);
  const phoneLabel = formattedPhone ? toPersianNumber(formattedPhone) : toPersianNumber(phoneValue);
  return `${baseName} - (${phoneLabel})`;
};

export const buildCustomerRelationSearchText = (row: any, targetField = 'full_name'): string => {
  const values = [
    row?.[targetField],
    row?.full_name,
    row?.first_name,
    row?.last_name,
    row?.business_name,
    row?.legal_name,
    row?.mobile_1,
    row?.mobile,
    row?.phone,
    row?.system_code,
    row?.legacy_contact_code,
    row?.accounting_code,
    row?.id,
  ];

  return values
    .map((value) => cleanPart(value).toLowerCase())
    .filter(Boolean)
    .join(' ');
};
