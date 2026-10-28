import React, { useState } from 'react';
import { Button, Card, Col, InputNumber, Row, Space, Tag, Typography } from 'antd';
import { CheckCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { parseSaasPlanDisplayFeatures } from '../../utils/saasPlanDisplayFeatures';

type StorePlan = {
  code: string;
  title: string;
  description?: string | null;
  entitlement_code?: string | null;
  price_irt: number;
  metadata?: { minimum_users?: number };
};

type PublicPlan = {
  code: string;
  short_description?: string | null;
  highlight_tag?: string | null;
  display_features?: unknown;
};

type Props = {
  plans: StorePlan[];
  publicPlans: PublicPlan[];
  cart: Record<string, number>;
  usersUsed: number;
  onSelect: (code: string, minimum: number) => void;
  onRemove: (code: string) => void;
  onQuantityChange: (code: string, quantity: number) => void;
};

const AccountPlanCards: React.FC<Props> = ({ plans, publicPlans, cart, usersUsed, onSelect, onRemove, onQuantityChange }) => {
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

      return <Col xs={24} md={12} xl={8} key={item.code}>
        <Card className={`h-full rounded-2xl ${highlighted ? 'border-indigo-400 bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
          <div className="flex items-start justify-between gap-2">
            <Typography.Title level={4} className="!mb-0">{item.title}</Typography.Title>
            {plan?.highlight_tag ? <Tag color="geekblue" className="!m-0">{plan.highlight_tag}</Tag> : null}
          </div>
          <Typography.Text type="secondary" className="mt-2 block min-h-10 text-sm">{plan?.short_description || item.description || 'پلن اشتراک سازمان'}</Typography.Text>
          <div className="mt-4 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-black text-slate-900 dark:text-white">{Math.round(Number(item.price_irt || 0)).toLocaleString('fa-IR')}</span>
            <Typography.Text type="secondary" className="text-xs">تومان به ازای هر کاربر در ماه</Typography.Text>
          </div>
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
        </Card>
      </Col>;
    })}
  </Row>;
};

export default AccountPlanCards;
