/** Pure phone normalization shared by browser and Edge Functions. */
export const phoneDigits = (value: unknown): string => String(value ?? '')
  .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
  .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
  .replace(/\D/g, '');

export const iranMobileE164 = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  // Do not turn an email, arbitrary text, or multiple numbers into a phone.
  if (!raw || !/^[+\d۰-۹٠-٩\s().\-\u200c-\u200f\u202a-\u202e\u2066-\u2069]+$/.test(raw)) return null;
  let digits = phoneDigits(raw);
  if (/^0098/.test(digits)) digits = digits.slice(4);
  else if (/^098/.test(digits) && digits.length >= 13) digits = digits.slice(3);
  else if (/^98/.test(digits) && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^9\d{9}$/.test(digits) ? `+98${digits}` : null;
};

export const iranMobileLocal = (value: unknown): string | null => {
  const phone = iranMobileE164(value);
  return phone ? `0${phone.slice(3)}` : null;
};

export const iranMobileAuth = (value: unknown): string | null =>
  iranMobileE164(value)?.slice(1) ?? null;

/** Keep service numbers, landlines and international numbers usable. */
export const dialPhone = (value: unknown): string => iranMobileLocal(value)
  ?? String(value ?? '').trim()
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\s().\-\u200c-\u200f\u202a-\u202e\u2066-\u2069]/g, '');

export const phoneLookupKey = (value: unknown): string => {
  const mobile = iranMobileE164(value);
  if (mobile) return mobile.slice(3);
  let digits = phoneDigits(value);
  if (digits.startsWith('0098')) digits = digits.slice(4);
  else if (digits.startsWith('98') && digits.length >= 12) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};
