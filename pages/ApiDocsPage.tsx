import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Layout,
  Menu,
  Tag,
  Table,
  Tabs,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  BookOutlined,
  CodeOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { MODULES } from '../moduleRegistry';
import type { ModuleDefinition } from '../types';
import { FieldType } from '../types';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// ─── Config ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '{SUPABASE_URL}';
const GATEWAY_URL = `${SUPABASE_URL}/functions/v1/api-gateway`;

interface ApiDocsPageProps {
  isAdmin?: boolean;
}

// دسته‌بندی ماژول‌ها برای sidebar
const MODULE_CATEGORIES = [
  {
    key: 'crm',
    label: 'فروش و CRM',
    plan: 'basic',
    modules: [
      'customers', 'suppliers', 'invoices', 'purchase_invoices',
      'sales_return_invoices', 'purchase_return_invoices',
      'price_lists', 'delivery_forms', 'marketing_leads', 'personas',
    ],
  },
  {
    key: 'warehouse',
    label: 'محصولات و انبار',
    plan: 'basic',
    modules: [
      'products', 'product_bundles', 'warehouses', 'shelves',
      'stock_transfers', 'barters',
    ],
  },
  {
    key: 'production',
    label: 'تولید',
    plan: 'enterprise',
    modules: ['production_orders', 'production_boms', 'production_group_orders'],
  },
  {
    key: 'accounting',
    label: 'حسابداری',
    plan: 'professional',
    modules: [
      'fiscal_years', 'chart_of_accounts', 'journal_entries',
      'accounting_event_rules', 'cost_centers', 'cash_boxes',
      'bank_accounts', 'petty_funds', 'cheques', 'cash_bank_operations',
      'expense_documents',
    ],
  },
  {
    key: 'hr',
    label: 'منابع انسانی',
    plan: 'professional',
    modules: [
      'employees', 'attendance_logs', 'work_schedules', 'leave_requests',
      'overtime_requests', 'mission_requests', 'employee_advances',
      'employee_bonus_requests', 'employee_penalty_requests',
      'employee_contracts', 'payroll_slips', 'recruitment_applicants', 'job_descriptions',
    ],
  },
  {
    key: 'process',
    label: 'پروژه و فرآیند',
    plan: 'enterprise',
    modules: [
      'projects', 'tasks', 'process_templates', 'process_runs',
      'instructions', 'web_forms', 'surveys', 'secretariat_documents',
    ],
  },
] as const;

const PLAN_LABELS: Record<string, { label: string; color: string }> = {
  basic:        { label: 'پلن پایه',      color: 'blue'   },
  professional: { label: 'پلن حرفه‌ای',  color: 'purple' },
  enterprise:   { label: 'پلن سازمانی',  color: 'gold'   },
};

const FIELD_TYPE_FA: Record<string, string> = {
  text: 'متن', long_text: 'متن بلند', superlongtext: 'متن خیلی بلند',
  number: 'عدد', price: 'قیمت', percentage: 'درصد',
  checkbox: 'بله/خیر', date: 'تاریخ', time: 'زمان', datetime: 'تاریخ و زمان',
  select: 'انتخابی', multi_select: 'چند انتخابی', status: 'وضعیت',
  relation: 'ارتباط', multi_relation: 'ارتباط چندگانه', user: 'کاربر',
  image: 'تصویر', phone: 'تلفن', link: 'لینک',
  json: 'JSON', tags: 'برچسب', stock: 'موجودی', location: 'موقعیت',
  checklist: 'چک‌لیست', progress_stages: 'مراحل پیشرفت',
  percentage_or_amount: 'درصد یا مبلغ', readonly_lookup: 'نمایشی',
};

// ─── Helper Components ───────────────────────────────────────────────────────

const MethodBadge: React.FC<{ method: string }> = ({ method }) => {
  const colors: Record<string, string> = {
    GET: '#52c41a', POST: '#1677ff', PATCH: '#fa8c16', DELETE: '#ff4d4f',
  };
  return (
    <span
      style={{
        background: colors[method] ?? '#666',
        color: '#fff',
        borderRadius: 4,
        padding: '2px 8px',
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: 1,
        display: 'inline-block',
        minWidth: 60,
        textAlign: 'center',
      }}
    >
      {method}
    </span>
  );
};

const CodeBlock: React.FC<{ code: string; lang?: string }> = ({ code }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ position: 'relative', marginBottom: 16 }}>
      <pre
        style={{
          background: '#0d1117',
          color: '#e6edf3',
          borderRadius: 8,
          padding: '16px 40px 16px 16px',
          fontSize: 12.5,
          lineHeight: 1.7,
          overflowX: 'auto',
          margin: 0,
          direction: 'ltr',
          textAlign: 'left',
        }}
      >
        {code}
      </pre>
      <Button
        size="small"
        type="text"
        style={{ position: 'absolute', top: 6, right: 6, color: '#8b949e' }}
        onClick={copy}
      >
        {copied ? '✓' : 'کپی'}
      </Button>
    </div>
  );
};

// ─── Fixed Sections ──────────────────────────────────────────────────────────

const IntroSection: React.FC = () => (
  <div>
    <Title level={2}>TazeSystem API</Title>
    <Paragraph>
      از طریق این API می‌توانید به داده‌های سازمان خود (مشتریان، فاکتورها، کارمندان و...) دسترسی داشته باشید
      و با سیستم‌های دیگر یکپارچه شوید.
    </Paragraph>
    <Alert
      type="info"
      showIcon
      message="نقطه پایانی واحد"
      description={
        <span>
          همه درخواست‌ها به آدرس <code style={{ direction: 'ltr', display: 'inline-block' }}>{GATEWAY_URL}</code> ارسال می‌شوند.
        </span>
      }
      style={{ marginBottom: 24 }}
    />
    <Title level={4}>ویژگی‌های اصلی</Title>
    <ul style={{ paddingRight: 20, lineHeight: 2 }}>
      <li>دسترسی به تمام ماژول‌های سازمانی (بر اساس پلن)</li>
      <li>فیلتر پیشرفته، جستجو، مرتب‌سازی، صفحه‌بندی</li>
      <li>خواندن و نوشتن — GET، POST، PATCH، DELETE</li>
      <li>Expand کردن روابط (مثلاً نام مشتری در فاکتور)</li>
      <li>جداسازی کامل داده — هر org فقط داده خود را می‌بیند</li>
    </ul>
  </div>
);

const AuthSection: React.FC = () => (
  <div>
    <Title level={2}>احراز هویت</Title>
    <Paragraph>
      توکن API را از بخش <strong>تنظیمات &gt; اتصالات &gt; توکن‌های API</strong> دریافت کنید
      و در هدر هر درخواست ارسال کنید.
    </Paragraph>
    <Title level={4}>هدر احراز هویت</Title>
    <CodeBlock code="Authorization: Bearer {API_TOKEN}" />
    <Title level={4}>نمونه با JavaScript (fetch)</Title>
    <CodeBlock
      code={`const response = await fetch('${GATEWAY_URL}', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_TOKEN',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    table: 'customers',
    method: 'GET',
    limit: 20,
    offset: 0,
  }),
});
const { data, count, error } = await response.json();`}
    />
    <Title level={4}>نمونه با curl</Title>
    <CodeBlock
      code={`curl -X POST '${GATEWAY_URL}' \\
  -H 'Authorization: Bearer YOUR_API_TOKEN' \\
  -H 'Content-Type: application/json' \\
  -d '{"table":"customers","method":"GET","limit":20}'`}
    />
    <Alert
      type="warning"
      showIcon
      message="امنیت توکن"
      description="توکن API را در کد منبع عمومی قرار ندهید. از متغیرهای محیطی یا vault استفاده کنید."
      style={{ marginTop: 16 }}
    />
  </div>
);

const QueryFeaturesSection: React.FC = () => (
  <div>
    <Title level={2}>ویژگی‌های کوئری</Title>

    <Title level={4}>فیلتر</Title>
    <Paragraph>با استفاده از <code>filters</code> می‌توانید نتایج را محدود کنید:</Paragraph>
    <CodeBlock
      code={`{
  "table": "invoices",
  "method": "GET",
  "filters": {
    "status": { "op": "eq", "value": "confirmed" },
    "created_at": { "op": "gte", "value": "2024-01-01" },
    "total_amount": { "op": "gt", "value": 1000000 }
  }
}`}
    />
    <Table
      size="small"
      pagination={false}
      dataSource={[
        { op: 'eq',   desc: 'برابر',           ex: '"status": { "op": "eq", "value": "active" }' },
        { op: 'neq',  desc: 'نابرابر',          ex: '"status": { "op": "neq", "value": "deleted" }' },
        { op: 'gt',   desc: 'بزرگ‌تر',          ex: '"amount": { "op": "gt", "value": 0 }' },
        { op: 'gte',  desc: 'بزرگ‌تر یا مساوی', ex: '"date": { "op": "gte", "value": "2024-01-01" }' },
        { op: 'lt',   desc: 'کوچک‌تر',          ex: '"qty": { "op": "lt", "value": 10 }' },
        { op: 'lte',  desc: 'کوچک‌تر یا مساوی', ex: '"qty": { "op": "lte", "value": 100 }' },
        { op: 'like', desc: 'شامل (حساس)',      ex: '"name": { "op": "like", "value": "%علی%" }' },
        { op: 'ilike',desc: 'شامل (غیرحساس)',   ex: '"name": { "op": "ilike", "value": "%ali%" }' },
        { op: 'in',   desc: 'در لیست',          ex: '"status": { "op": "in", "value": ["a","b"] }' },
        { op: 'is',   desc: 'null یا not null', ex: '"deleted_at": { "op": "is", "value": null }' },
      ]}
      columns={[
        { title: 'عملگر', dataIndex: 'op', width: 80, render: (v: string) => <code>{v}</code> },
        { title: 'توضیح', dataIndex: 'desc', width: 160 },
        { title: 'مثال', dataIndex: 'ex', render: (v: string) => <code style={{ fontSize: 11 }}>{v}</code> },
      ]}
      rowKey="op"
      style={{ marginBottom: 24 }}
    />

    <Title level={4}>جستجو (search)</Title>
    <CodeBlock
      code={`{
  "table": "customers",
  "method": "GET",
  "search": {
    "columns": ["full_name", "mobile_1", "business_name"],
    "query": "علی"
  }
}`}
    />

    <Title level={4}>مرتب‌سازی (order)</Title>
    <CodeBlock
      code={`{
  "table": "invoices",
  "method": "GET",
  "order": { "column": "created_at", "ascending": false }
}`}
    />

    <Title level={4}>صفحه‌بندی (pagination)</Title>
    <CodeBlock
      code={`{
  "table": "products",
  "method": "GET",
  "limit": 50,
  "offset": 0
}`}
    />
    <Paragraph type="secondary">حداکثر <code>limit</code> قابل استفاده: ۱۰۰۰ رکورد در هر درخواست.</Paragraph>

    <Title level={4}>انتخاب فیلدها (select)</Title>
    <Paragraph>می‌توانید فقط فیلدهای موردنیاز را دریافت کنید و روابط را expand کنید:</Paragraph>
    <CodeBlock
      code={`{
  "table": "invoices",
  "method": "GET",
  "select": "id,system_code,status,total_amount,customer_id(id,full_name,mobile_1)"
}`}
    />

    <Title level={4}>Relation fields</Title>
    <Paragraph>
      فیلدهایی که به جدول دیگری اشاره دارند (نوع <code>relation</code> یا <code>user</code>) می‌توانند در <code>select</code>
      با پرانتز expand شوند:
    </Paragraph>
    <CodeBlock
      code={`// خواندن فاکتور با اطلاعات مشتری
{
  "table": "invoices",
  "select": "id,system_code,customer_id(id,full_name,mobile_1),items,total_amount"
}

// فیلتر بر اساس relation
{
  "table": "invoices",
  "filters": { "customer_id": { "op": "eq", "value": "UUID-OF-CUSTOMER" } }
}

// ایجاد رکورد با relation
{
  "table": "invoices",
  "method": "POST",
  "body": { "customer_id": "UUID", "items": [...], "invoice_date": "2024-01-01" }
}`}
    />
  </div>
);

const WebhooksDocsSection: React.FC = () => (
  <div>
    <Title level={2}>Webhooks خروجی</Title>
    <Paragraph>
      با تعریف webhook در <strong>تنظیمات &gt; اتصالات</strong>، TazeSystem رویدادها را بلادرنگ به سرور شما ارسال می‌کند.
    </Paragraph>

    <Title level={4}>فرمت Payload</Title>
    <CodeBlock
      code={`{
  "event": "invoices.created",   // table.verb (created|updated|deleted)
  "table": "invoices",
  "record_id": "uuid-of-record",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "id": "...",
    "org_id": "...",
    "status": "draft",
    // ... سایر فیلدهای رکورد
  }
}`}
    />

    <Title level={4}>تأیید امضا (HMAC-SHA256)</Title>
    <Paragraph>
      هر درخواست با هدر <code>X-TazeSystem-Signature: sha256=&#123;HMAC&#125;</code> امضا می‌شود.
      secret را از صفحه تعریف webhook دریافت کنید.
    </Paragraph>

    <Tabs
      items={[
        {
          key: 'node',
          label: 'Node.js',
          children: (
            <CodeBlock
              code={`const crypto = require('crypto');

function verifySignature(payload, secret, signatureHeader) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}

// در Express:
app.post('/webhooks/taze', express.raw({ type: '*/*' }), (req, res) => {
  const sig = req.headers['x-tazesystem-signature'];
  if (!verifySignature(req.body, process.env.WEBHOOK_SECRET, sig)) {
    return res.status(401).send('Unauthorized');
  }
  const event = JSON.parse(req.body);
  console.log('Event:', event.event, event.data);
  res.sendStatus(200);
});`}
            />
          ),
        },
        {
          key: 'python',
          label: 'Python',
          children: (
            <CodeBlock
              code={`import hmac
import hashlib

def verify_signature(payload: bytes, secret: str, signature: str) -> bool:
    expected = 'sha256=' + hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# در Flask:
@app.route('/webhooks/taze', methods=['POST'])
def webhook():
    sig = request.headers.get('X-TazeSystem-Signature', '')
    if not verify_signature(request.data, WEBHOOK_SECRET, sig):
        abort(401)
    event = request.json
    print(f"Event: {event['event']}", event['data'])
    return '', 200`}
            />
          ),
        },
      ]}
    />
  </div>
);

// ─── Module Section ──────────────────────────────────────────────────────────

const ModuleSection: React.FC<{ moduleId: string; plan: string }> = ({ moduleId, plan }) => {
  const mod: ModuleDefinition | undefined = MODULES[moduleId];
  if (!mod) return <Alert type="error" message={`ماژول ${moduleId} پیدا نشد`} />;

  const table = mod.table ?? moduleId;
  const titleFa = mod.titles?.fa ?? moduleId;
  const planInfo = PLAN_LABELS[plan];

  const fields = (mod.fields ?? []).filter(
    f => !['org_id', 'deleted_at'].includes(f.key)
  );

  const fieldTypeLabel = (type: string) => FIELD_TYPE_FA[type] ?? type;
  const isRelation = (type: string) =>
    [FieldType.RELATION, FieldType.MULTI_RELATION, FieldType.USER].includes(type as FieldType);

  const fieldColumns = [
    {
      title: 'کلید (key)',
      dataIndex: 'key',
      width: 160,
      render: (v: string) => <code style={{ fontSize: 12 }}>{v}</code>,
    },
    {
      title: 'عنوان فارسی',
      dataIndex: ['labels', 'fa'],
      width: 150,
      render: (v: string, row: any) => v ?? row?.label?.fa ?? row.key,
    },
    {
      title: 'نوع',
      dataIndex: 'type',
      width: 120,
      render: (v: string, row: any) => {
        const label = fieldTypeLabel(v);
        if (isRelation(v)) {
          const target = row?.relationConfig?.targetModule ?? row?.targetModule ?? '';
          return (
            <span>
              <Tag icon={<LinkOutlined />} color="blue">{label}</Tag>
              {target && <Text type="secondary" style={{ fontSize: 11 }}>→ {target}</Text>}
            </span>
          );
        }
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: 'ملاحظه',
      key: 'note',
      render: (_: any, row: any) => {
        const notes: string[] = [];
        if (row.isKey) notes.push('عنوان اصلی');
        if (row.required) notes.push('الزامی');
        if (row.nature === 'system') notes.push('خودکار');
        if (row.nature === 'predefined') notes.push('سیستمی');
        return notes.map(n => <Tag key={n} style={{ fontSize: 11 }}>{n}</Tag>);
      },
    },
  ];

  const hasPayments = moduleId === 'invoices' || moduleId === 'purchase_invoices';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Title level={2} style={{ margin: 0 }}>{titleFa}</Title>
        {planInfo && <Tag color={planInfo.color}>{planInfo.label}</Tag>}
      </div>
      <Text type="secondary" style={{ fontFamily: 'monospace', display: 'block', marginBottom: 24 }}>
        جدول: {table}
      </Text>

      {/* Endpoints */}
      <div style={{ marginBottom: 24 }}>
        {[
          { method: 'GET',    desc: 'دریافت لیست رکوردها (با فیلتر و صفحه‌بندی)' },
          { method: 'POST',   desc: 'ایجاد رکورد جدید' },
          { method: 'PATCH',  desc: 'ویرایش رکورد (با فیلتر مشخص‌کننده)' },
          { method: 'DELETE', desc: 'حذف رکورد (با فیلتر مشخص‌کننده)' },
        ].map(({ method, desc }) => (
          <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <MethodBadge method={method} />
            <code style={{ flex: 1, fontSize: 12, direction: 'ltr', textAlign: 'left' }}>
              {GATEWAY_URL}
            </code>
            <Text type="secondary" style={{ fontSize: 12 }}>{desc}</Text>
          </div>
        ))}
      </div>

      {/* Code examples */}
      <Tabs
        items={[
          {
            key: 'get',
            label: 'GET — دریافت',
            children: (
              <CodeBlock
                code={`// دریافت ${titleFa}
{
  "table": "${table}",
  "method": "GET",
  "select": "*",
  "order": { "column": "created_at", "ascending": false },
  "limit": 50,
  "offset": 0
}`}
              />
            ),
          },
          {
            key: 'post',
            label: 'POST — ایجاد',
            children: (
              <CodeBlock
                code={`// ایجاد ${titleFa} جدید
{
  "table": "${table}",
  "method": "POST",
  "body": {
    ${fields
      .filter(f => f.nature !== 'system' && f.nature !== 'predefined')
      .slice(0, 5)
      .map(f => `"${f.key}": null  // ${f.labels?.fa ?? f.key}`)
      .join(',\n    ')}
  }
}`}
              />
            ),
          },
          {
            key: 'patch',
            label: 'PATCH — ویرایش',
            children: (
              <CodeBlock
                code={`// ویرایش ${titleFa}
{
  "table": "${table}",
  "method": "PATCH",
  "filters": { "id": { "op": "eq", "value": "RECORD_UUID" } },
  "body": {
    // فیلدهایی که می‌خواهید تغییر دهید
  }
}`}
              />
            ),
          },
          {
            key: 'delete',
            label: 'DELETE — حذف',
            children: (
              <CodeBlock
                code={`// حذف ${titleFa}
{
  "table": "${table}",
  "method": "DELETE",
  "filters": { "id": { "op": "eq", "value": "RECORD_UUID" } }
}`}
              />
            ),
          },
        ]}
      />

      {/* Invoice special note */}
      {hasPayments && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="فیلدهای JSONB در فاکتور"
          description={
            <div>
              <div><code>items</code> — آیتم‌های فاکتور (آرایه JSON): <code>{JSON.stringify([{ product_id: 'uuid', qty: 1, unit_price: 100000, discount: 0 }])}</code></div>
              <div style={{ marginTop: 6 }}><code>payments</code> — جدول دریافت‌ها (آرایه JSON): <code>{JSON.stringify([{ payment_type: 'cash', amount: 50000, date: '2024-01-01', status: 'confirmed' }])}</code></div>
            </div>
          }
        />
      )}

      {/* Fields table */}
      <Title level={4}>فیلدها</Title>
      <Table
        rowKey="key"
        columns={fieldColumns as any}
        dataSource={fields}
        size="small"
        pagination={false}
        scroll={{ x: 600 }}
        style={{ marginBottom: 32 }}
      />
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

const FIXED_SECTIONS = [
  { key: 'intro',     label: 'مقدمه',             icon: <BookOutlined /> },
  { key: 'auth',      label: 'احراز هویت',         icon: <KeyOutlined /> },
  { key: 'features',  label: 'ویژگی‌های کوئری',   icon: <CodeOutlined /> },
  { key: 'webhooks',  label: 'Webhooks',            icon: <ApiOutlined /> },
] as const;

const ApiDocsPage: React.FC<ApiDocsPageProps> = ({ isAdmin: _isAdmin = false }) => {
  const [selectedKey, setSelectedKey] = useState<string>('intro');
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = useMemo(() => [
    ...FIXED_SECTIONS.map(s => ({
      key: s.key,
      label: s.label,
      icon: s.icon,
    })),
    { type: 'divider' as const },
    ...MODULE_CATEGORIES.map(cat => ({
      key: cat.key,
      label: cat.label,
      icon: <DatabaseOutlined />,
      children: cat.modules
        .filter(mid => !!MODULES[mid])
        .map(mid => ({
          key: `module:${mid}`,
          label: MODULES[mid]?.titles?.fa ?? mid,
        })),
    })),
  ], []);

  const renderContent = () => {
    if (selectedKey === 'intro')    return <IntroSection />;
    if (selectedKey === 'auth')     return <AuthSection />;
    if (selectedKey === 'features') return <QueryFeaturesSection />;
    if (selectedKey === 'webhooks') return <WebhooksDocsSection />;

    if (selectedKey.startsWith('module:')) {
      const moduleId = selectedKey.slice(7);
      const cat = MODULE_CATEGORIES.find((c) => c.modules.some((item) => item === moduleId));
      return <ModuleSection moduleId={moduleId} plan={cat?.plan ?? 'basic'} />;
    }
    return null;
  };

  return (
    <Layout style={{ minHeight: '100vh', background: '#fff', direction: 'rtl' }}>
      <Sider
        width={260}
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        style={{
          background: '#fafafa',
          borderLeft: '1px solid #f0f0f0',
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          right: 0,
        }}
        theme="light"
      >
        {!collapsed && (
          <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #f0f0f0', marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ApiOutlined style={{ fontSize: 20, color: '#1677ff' }} />
              <Text strong style={{ fontSize: 14 }}>TazeSystem API</Text>
            </div>
          </div>
        )}
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          defaultOpenKeys={MODULE_CATEGORIES.map(c => c.key)}
          items={menuItems as any}
          onClick={({ key }) => setSelectedKey(key)}
          style={{ borderInlineEnd: 'none', fontSize: 13 }}
        />
      </Sider>

      <Content
        style={{
          padding: '40px 48px',
          maxWidth: 900,
          margin: '0 auto',
          flex: 1,
        }}
      >
        {renderContent()}
      </Content>
    </Layout>
  );
};

export default ApiDocsPage;
