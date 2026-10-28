export type CheckoutDiscounts = {
  users: { minimum: number; percent: number }[];
  terms: { months: number; percent: number }[];
};

export const TERM_OPTIONS = [
  { value: 1, label: '۱ ماهه' },
  { value: 3, label: '۳ ماهه' },
  { value: 6, label: '۶ ماهه' },
  { value: 12, label: '۱ ساله' },
];

export const userDiscountPercent = (users: number, discounts: CheckoutDiscounts) =>
  discounts.users.reduce((percent, rule) => users >= Number(rule.minimum) ? Math.max(percent, Number(rule.percent)) : percent, 0);

export const termDiscountPercent = (months: number, monthlyPrice: number, yearlyPrice: number, discounts: CheckoutDiscounts) => {
  if (months === 12 && yearlyPrice > 0 && monthlyPrice > 0) return Math.round(10000 * (1 - yearlyPrice / (monthlyPrice * 12))) / 100;
  return Number(discounts.terms.find((rule) => Number(rule.months) === months)?.percent || 0);
};

export const planCheckoutTotal = (users: number, months: number, monthlyPrice: number, yearlyPrice: number, discounts: CheckoutDiscounts) =>
  Math.round(users * months * monthlyPrice * (1 - userDiscountPercent(users, discounts) / 100)
    * (1 - termDiscountPercent(months, monthlyPrice, yearlyPrice, discounts) / 100));
