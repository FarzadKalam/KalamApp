/** Shared policy for newly configured self-service demo owner credentials. */
export const OWNER_PASSWORD_MIN_LENGTH = 8;
export const OWNER_PASSWORD_MAX_LENGTH = 128;

export const getOwnerPasswordValidationError = (value: string): string | null => {
  const password = String(value || '');
  if (!password) return 'رمز عبور را وارد کنید.';
  if (Array.from(password).length < OWNER_PASSWORD_MIN_LENGTH) return 'رمز عبور باید حداقل ۸ نویسه داشته باشد.';
  if (Array.from(password).length > OWNER_PASSWORD_MAX_LENGTH) return 'رمز عبور نباید بیشتر از ۱۲۸ نویسه باشد.';
  if (password !== password.trim()) return 'در ابتدا یا انتهای رمز عبور فاصله نگذارید.';
  if (/^[\p{Nd}\s]+$/u.test(password)) return 'رمز عبور نباید فقط عدد باشد؛ از حرف یا نشانه هم استفاده کنید.';
  if (/^(.)\1+$/u.test(password)) return 'رمز عبور نباید تکرار یک نویسه باشد.';
  return null;
};
