import React, { useState } from 'react';
import { Button, Card, Col, InputNumber, Row, Select, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { parseSaasPlanDisplayFeatures } from '../../utils/saasPlanDisplayFeatures';
import { CheckoutDiscounts, TERM_OPTIONS, planCheckoutTotal, termDiscountPercent, userDiscountPercent } from '../../utils/saasCheckoutPricing';
import { useCurrencyConfig } from '../../utils/currency';

type StorePlan = {
  code: string;
  title: string;
  description?: string | null;
  entitlement_code?: string | null;
  price_irt: number;
  price_yearly?: number;
  metadata?: { minimum_users?: number };
};

type PublicPlan = {
  code: string;
  short_description?: string | null;
  highlight_tag?: string | null;
  display_features?: unknown;
  price_yearly?: number;
};

type Props = {
  plans: StorePlan[];
  publicPlans: PublicPlan[];
  cart: Record<string, number>;
  usersUsed: number;
  termMonths: number;
  discounts: CheckoutDiscounts;
  onSelect: (code: string, minimum: number) => void;
  onRemove: (code: string) => void;
  onQuantityChange: (code: string, quantity: number) => void;
  onTermChange: (months: number) => void;
};

const AccountPlanCards: React.FC<Props> = ({ plans, publicPlans, cart, usersUsed, termMonths, discounts, onSelect, onRemove, onQuantityChange, onTermChange }) => {
  const orgCurrency = useCurrencyConfig();
  const displayMultiplier = orgCurrency.code === 'IRR' ? 10 : 1;
  const displayCurrencyLabel = orgCurrency.code === 'IRR' ? (orgCurrency.label || 'ریال') : 'تومان';
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const publicPlanByCode = new Map(publicPlans.map((plan) => [plan.code, plan]));

  return <Row gutter={[16, 16]}>
    {plans.map((item) => {
      const plan = publicPlanByCode.get(item.entitlement_code || item.code.replace(/^plan:/, ''));
      const features = parseSaasPlanDisplayFeatures(plan?.display_features);
      const primary = features.filter((feature) => feature.featured);
      const extra = features.filter((feature) => !feature.featured);
      const isExpanded = expanded.has(item.code);
      const count = Number(cart[item.code] || 0);
      const minimum = Math.max(3, usersUsed, Number(item.metadata?.minimum_users || 0));
      const highlighted = Boolean(plan?.highlight_tag);
      const yearlyPrice = Number(plan?.price_yearly || 0);
      const usersDiscount = userDiscountPercent(count || minimum, discounts);
      const termDiscount = termDiscountPercent(termMonths, Number(item.price_irt || 0), yearlyPrice, discounts);

      return <Col xs={24} md={12} xl={8} key={item.code}>
        <Card className={`h-full rounded-2xl ${highlighted ? 'border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <Typography.Title level={4} className="!mb-0">{item.title}</Typography.Title>
            {plan?.highlight_tag ? <Tag color="geekblue" className="!m-0">{plan.highlight_tag}</Tag> : null}
          </div>
          <Typography.Text type="secondary" className="mt-2 block min-h-10 text-sm">{plan?.short_description || item.description || 'پلن اشتراک سازمان'}</Typography.Text>
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{Math.round(Number(item.price_irt || 0) * displayMultiplier).toLocaleString('fa-IR')}</span>
            <Typography.Text type="secondary" className="text-xs">{displayCurrencyLabel} به ازای هر کاربر در ماه</Typography.Text>
          </div>
          <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">از ۶ کاربر به بالا، تخفیف پلکانی تعداد کاربران اعمال می‌شود.</div>
          {discounts.users.length > 0 ? <div className="mt-2 flex flex-wrap gap-1">{discounts.users.map((rule) => <Tag key={rule.minimum} color="green">{Number(rule.minimum).toLocaleString('fa-IR')}+ کاربر: {Number(rule.percent).toLocaleString('fa-IR')}٪</Tag>)}</div> : null}
          {features.length > 0 ? <ul className="mt-5 space-y-3">
            {(isExpanded ? features : primary).map((feature) => <li key={feature.text} className="flex items-start gap-2 text-sm leading-6">
              <CheckCircleOutlined className="mt-1 text-indigo-600" />
              <span>{feature.text}</span>
            </li>)}
          </ul> : <Typography.Text type="secondary" className="mt-5 block text-xs">فهرست امکانات این پلن در حال حاضر در دسترس نیست.</Typography.Text>}
          {extra.length > 0 ? <Button className="mt-4 w-full" onClick={() => setExpanded((current) => {
            const next = new Set(current);
            if (next.has(item.code)) next.delete(item.code); else next.add(item.code);
            return next;
          })} aria-expanded={isExpanded} icon={isExpanded ? <UpOutlined /> : <DownOutlined />}>
            {isExpanded ? 'مشاهده کمتر' : `مشاهده ${extra.length.toLocaleString('fa-IR')} ویژگی دیگر`}
          </Button> : null}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4">
            <Typography.Text type="secondary" className="text-xs">حداقل {minimum.toLocaleString('fa-IR')} کاربر</Typography.Text>
            <Space size={4}>
              {count ? <Button size="small" onClick={() => onRemove(item.code)}>حذف</Button> : null}
              {count ? <InputNumber size="small" min={minimum} max={1000} value={count}
                onChange={(value) => onQuantityChange(item.code, Math.max(minimum, Math.floor(Number(value || minimum))))}
                aria-label={`تعداد کاربران ${item.title}`} /> : null}
              {!count ? <Button size="small" type="primary" onClick={() => onSelect(item.code, minimum)}>انتخاب پلن</Button> : null}
            </Space>
          </div>
          {count > 0 ? <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
            <Typography.Text className="block text-xs">دوره پرداخت</Typography.Text>
            <Select className="w-full" value={termMonths} options={TERM_OPTIONS} onChange={onTermChange} aria-label={`دوره پرداخت ${item.title}`} />
            <div className="flex flex-wrap gap-1">{usersDiscount > 0 ? <Tag color="green">تخفیف تعداد: {usersDiscount.toLocaleString('fa-IR')}٪</Tag> : null}{termDiscount > 0 ? <Tag color="blue">تخفیف دوره: {termDiscount.toLocaleString('fa-IR')}٪</Tag> : null}</div>
            <Typography.Text strong className="block">مبلغ این دوره: {Math.round(planCheckoutTotal(count, termMonths, Number(item.price_irt || 0), yearlyPrice, discounts) * displayMultiplier).toLocaleString('fa-IR')} {displayCurrencyLabel}</Typography.Text>
          </div> : null}
        </Card>
      </Col>;
    })}
  </Row>;
};

export default AccountPlanCards;
