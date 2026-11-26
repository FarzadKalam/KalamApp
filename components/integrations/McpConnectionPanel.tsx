import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  CloudServerOutlined,
  CopyOutlined,
  DeleteOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { hasMcpAccessFeature } from '../../utils/saasPlanFeatures';
import { publicRuntimeConfig } from '../../utils/runtimeConfig';
import { toFaErrorMessage } from '../../utils/errorMessageFa';

const { Title, Text, Paragraph } = Typography;

type McpUserTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  client_hint: 'codex' | 'chatgpt' | 'gemini' | 'claude' | 'custom';
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type McpOAuthTokenRow = {
  id: string;
  client_label: string | null;
  scope: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

const CLIENT_LABELS: Record<string, string> = {
  codex: 'ChatGPT / Codex',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
  custom: 'سایر کلاینت‌ها',
};

const SCOPE_LABELS: Record<string, string> = {
  'mcp:read': 'خواندن و جستجو',
  'mcp:write': 'ثبت و ویرایش مجاز',
};

const generatePersonalMcpToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(28));
  const raw = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `tz_mcp_pat_${raw}`;
};

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const formatDateFa = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const CopyInlineButton: React.FC<{ value: string; label?: string }> = ({ value, label }) => {
  const { message } = AntdApp.useApp();
  const [copied, setCopied] = useState(false);

  const onCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      message.success(label ? `${label} کپی شد` : 'کپی شد');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Tooltip title="کپی">
      <Button
        size="small"
        type="text"
        icon={copied ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
        onClick={onCopy}
      />
    </Tooltip>
  );
};

type McpConnectionPanelProps = {
  orgId: string | null;
  canWriteTokens?: boolean;
  onlyCurrentUser?: boolean;
};

const McpConnectionPanel: React.FC<McpConnectionPanelProps> = ({
  orgId,
  canWriteTokens = true,
  onlyCurrentUser = false,
}) => {
  const { message } = AntdApp.useApp();
  const [planEnabled, setPlanEnabled] = useState<boolean | null>(null);
  const [tokens, setTokens] = useState<McpUserTokenRow[]>([]);
  const [oauthSessions, setOauthSessions] = useState<McpOAuthTokenRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [form] = Form.useForm();

  const mcpEndpointUrl = useMemo(() => {
    const base = String(publicRuntimeConfig.supabaseUrl || '').replace(/\/+$/, '');
    return base ? `${base}/functions/v1/mcp-server` : '/functions/v1/mcp-server';
  }, []);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const enabled = await hasMcpAccessFeature({ force: true });
      setPlanEnabled(enabled);
      if (!enabled) {
        setTokens([]);
        setOauthSessions([]);
        return;
      }
      let currentUid: string | null = null;
      if (onlyCurrentUser) {
        const { data: userData } = await supabase.auth.getUser();
        currentUid = userData?.user?.id || null;
        if (!currentUid) {
          setTokens([]);
          setOauthSessions([]);
          return;
        }
      }
      let patQuery = supabase
        .from('mcp_user_tokens')
        .select('id, name, token_prefix, client_hint, scopes, is_active, last_used_at, revoked_at, created_at')
        .eq('org_id', orgId);
      if (currentUid) patQuery = patQuery.eq('user_id', currentUid);

      let oauthQuery = supabase
        .from('mcp_oauth_tokens')
        .select('id, client_label, scope, expires_at, last_used_at, revoked_at, created_at')
        .eq('org_id', orgId)
        .is('revoked_at', null);
      if (currentUid) oauthQuery = oauthQuery.eq('user_id', currentUid);

      const [patRes, oauthRes] = await Promise.all([
        patQuery.order('created_at', { ascending: false }),
        oauthQuery.order('created_at', { ascending: false }),
      ]);
      if (patRes.error) throw patRes.error;
      if (oauthRes.error) throw oauthRes.error;
      setTokens((patRes.data || []) as McpUserTokenRow[]);
      setOauthSessions((oauthRes.data || []) as McpOAuthTokenRow[]);
    } catch (err: any) {
      message.error(toFaErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId, onlyCurrentUser, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreateToken = async () => {
    if (!orgId || !canWriteTokens) return;
    try {
      const values = await form.validateFields();
      setCreating(true);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user?.id) throw new Error('نشست کاربری معتبر نیست.');

      const rawToken = generatePersonalMcpToken();
      const tokenHash = await sha256Hex(rawToken);
      const tokenPrefix = rawToken.slice(0, 18);

      const { error } = await supabase.from('mcp_user_tokens').insert({
        org_id: orgId,
        user_id: userData.user.id,
        name: String(values.name || '').trim(),
        token_prefix: tokenPrefix,
        token_hash: tokenHash,
        client_hint: values.client_hint || 'codex',
        scopes: Array.isArray(values.scopes) && values.scopes.length ? values.scopes : ['mcp:read', 'mcp:write'],
        is_active: true,
      });
      if (error) throw error;

      setCreateOpen(false);
      form.resetFields();
      setRevealedToken(rawToken);
      await load();
    } catch (err: any) {
      if (!err?.errorFields) message.error(toFaErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const revokePersonalToken = async (row: McpUserTokenRow) => {
    const { error } = await supabase
      .from('mcp_user_tokens')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      message.error(toFaErrorMessage(error));
      return;
    }
    message.success('توکن MCP لغو شد.');
    void load();
  };

  const deletePersonalToken = async (row: McpUserTokenRow) => {
    const { error } = await supabase.from('mcp_user_tokens').delete().eq('id', row.id);
    if (error) {
      message.error(toFaErrorMessage(error));
      return;
    }
    message.success('توکن MCP حذف شد.');
    void load();
  };

  const revokeOAuthSession = async (row: McpOAuthTokenRow) => {
    const { error } = await supabase
      .from('mcp_oauth_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      message.error(toFaErrorMessage(error));
      return;
    }
    message.success('نشست OAuth لغو شد.');
    void load();
  };

  const tokenColumns: ColumnsType<McpUserTokenRow> = [
    {
      title: 'نام اتصال',
      dataIndex: 'name',
      render: (val, row) => (
        <div>
          <div className="font-medium">{val}</div>
          <Text type="secondary" className="text-xs">{CLIENT_LABELS[row.client_hint] || row.client_hint}</Text>
        </div>
      ),
    },
    {
      title: 'پیشوند توکن',
      dataIndex: 'token_prefix',
      render: (val: string) => <code dir="ltr" className="text-xs">{val}…</code>,
    },
    {
      title: 'سطح دسترسی',
      dataIndex: 'scopes',
      render: (scopes: string[]) => (
        <Space size={4} wrap>
          {(scopes || []).map((scope) => (
            <Tag key={scope} color={scope === 'mcp:write' ? 'blue' : 'default'}>
              {SCOPE_LABELS[scope] || scope}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'وضعیت',
      render: (_, row) =>
        row.is_active && !row.revoked_at
          ? <Tag color="green">فعال</Tag>
          : <Tag color="red">لغوشده</Tag>,
    },
    {
      title: 'آخرین استفاده',
      dataIndex: 'last_used_at',
      render: (v) => <Text className="text-xs">{formatDateFa(v)}</Text>,
    },
    {
      title: 'عملیات',
      align: 'center',
      render: (_, row) => (
        <Space size={4}>
          {row.is_active && !row.revoked_at && (
            <Popconfirm title="این توکن غیرفعال شود؟" onConfirm={() => void revokePersonalToken(row)} okText="بله" cancelText="خیر">
              <Button size="small" type="text" icon={<StopOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="این توکن برای همیشه حذف شود؟" onConfirm={() => void deletePersonalToken(row)} okText="حذف" cancelText="انصراف">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const oauthColumns: ColumnsType<McpOAuthTokenRow> = [
    {
      title: 'ابزار متصل (OAuth)',
      dataIndex: 'client_label',
      render: (val) => <Text strong>{val || 'کلاینت OAuth'}</Text>,
    },
    {
      title: 'دسترسی',
      dataIndex: 'scope',
      render: (scope: string) => (
        <Space size={4} wrap>
          {String(scope || '').split(/\s+/).filter(Boolean).map((item) => (
            <Tag key={item} color={item === 'mcp:write' ? 'blue' : 'default'}>
              {SCOPE_LABELS[item] || item}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'آخرین استفاده',
      dataIndex: 'last_used_at',
      render: (v) => <Text className="text-xs">{formatDateFa(v)}</Text>,
    },
    {
      title: 'انقضا',
      dataIndex: 'expires_at',
      render: (v) => <Text className="text-xs">{formatDateFa(v)}</Text>,
    },
    {
      title: 'لغو',
      align: 'center',
      render: (_, row) => (
        <Popconfirm title="اتصال OAuth این کلاینت قطع شود؟" onConfirm={() => void revokeOAuthSession(row)} okText="قطع اتصال" cancelText="انصراف">
          <Button size="small" danger type="text" icon={<StopOutlined />}>قطع</Button>
        </Popconfirm>
      ),
    },
  ];

  if (planEnabled === null && loading) {
    return <Spin />;
  }

  if (planEnabled === false) {
    return (
      <Alert
        type="info"
        showIcon
        message="اتصال به هوش مصنوعی خارجی (MCP) در پلن فعلی سازمان فعال نیست."
        description="این قابلیت در پلن سازمانی و طرح‌های دارای افزونهٔ MCP فعال است تا بتوانید ChatGPT / Codex، Gemini و Claude را با رعایت کامل دسترسی کاربران به تازه‌سیستم متصل کنید."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Title level={5} className="!mb-0 flex items-center gap-2">
          <CloudServerOutlined /> اتصال به ابزارهای هوش مصنوعی خارجی (Remote MCP)
        </Title>
        <Space>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void load()} loading={loading} />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={!canWriteTokens}
            onClick={() => {
              form.setFieldsValue({ client_hint: 'codex', scopes: ['mcp:read', 'mcp:write'] });
              setCreateOpen(true);
            }}
          >
            ساخت توکن شخصی MCP
          </Button>
        </Space>
      </div>

      <Paragraph className="text-sm text-gray-500 !mb-2">
        هر کاربر پس از اتصال در ابزارهای رسمی زیر، دقیقاً همان ماژول‌ها، رکوردها، فیلدها و مجوزهای ایجاد/ویرایش/حذفِ نقش خود در این سازمان را دریافت می‌کند.
      </Paragraph>

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-wrap items-center justify-between gap-2 bg-gray-50/70 dark:bg-white/[0.03]">
        <div>
          <Text type="secondary" className="text-xs block">آدرس رسمی سرور MCP (Streamable HTTP + OAuth 2.0)</Text>
          <code dir="ltr" className="text-xs font-mono break-all">{mcpEndpointUrl}</code>
        </div>
        <CopyInlineButton value={mcpEndpointUrl} label="آدرس MCP" />
      </div>

      <Tabs
        size="small"
        items={[
          {
            key: 'gpt_codex',
            label: '۱. ChatGPT / Codex',
            children: (
              <div className="space-y-2 text-xs leading-6">
                <Alert
                  type="info"
                  showIcon
                  message="اتصال رسمی در سایت و اپ ChatGPT (نیاز به Developer Mode / Connectors)"
                  description={
                    <ol className="list-decimal pr-4 space-y-1 mb-0">
                      <li>در ChatGPT وارد <strong>Settings ← Connectors</strong> شوید و حالت <strong>Developer Mode</strong> را فعال کنید.</li>
                      <li>گزینهٔ ساخت کانکتور سفارشی را بزنید و آدرس بالا را در فیلد <strong>MCP Server URL</strong> وارد کنید.</li>
                      <li>احراز هویت را روی <strong>OAuth</strong> بگذارید تا صفحهٔ ورود و تأیید همین سازمان باز شود.</li>
                    </ol>
                  }
                />
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <Text strong className="text-xs">دستور اتصال در Codex CLI / App (با توکن شخصی):</Text>
                    <CopyInlineButton value={`codex mcp add tazesystem --url ${mcpEndpointUrl} --bearer-token-env-var TAZE_MCP_TOKEN`} label="دستور Codex" />
                  </div>
                  <pre dir="ltr" className="text-[11px] m-0 overflow-x-auto">{`export TAZE_MCP_TOKEN="توکن_شخصی_شما"\ncodex mcp add tazesystem --url ${mcpEndpointUrl} --bearer-token-env-var TAZE_MCP_TOKEN`}</pre>
                </div>
              </div>
            ),
          },
          {
            key: 'gemini',
            label: '۲. Gemini',
            children: (
              <div className="space-y-2 text-xs leading-6">
                <Alert
                  type="info"
                  showIcon
                  message="اتصال در Gemini Web/App و Gemini Enterprise"
                  description={
                    <ol className="list-decimal pr-4 space-y-1 mb-0">
                      <li>در <strong>Settings ← Connected Apps / Custom (MCP)</strong> یا کنسول <strong>Gemini Enterprise</strong> گزینهٔ افزودن MCP Server را بزنید.</li>
                      <li>آدرس بالا را با پروتکل <strong>Streamable HTTP</strong> وارد کرده و احراز هویت <strong>OAuth 2.0</strong> را تأیید کنید.</li>
                    </ol>
                  }
                />
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <Text strong className="text-xs">دستور اتصال در Gemini CLI:</Text>
                    <CopyInlineButton value={`gemini mcp add --transport http tazesystem ${mcpEndpointUrl} -H "Authorization: Bearer YOUR_MCP_TOKEN"`} label="دستور Gemini" />
                  </div>
                  <pre dir="ltr" className="text-[11px] m-0 overflow-x-auto">{`gemini mcp add --transport http tazesystem ${mcpEndpointUrl} -H "Authorization: Bearer YOUR_MCP_TOKEN"`}</pre>
                </div>
              </div>
            ),
          },
          {
            key: 'claude',
            label: '۳. Claude',
            children: (
              <div className="space-y-2 text-xs leading-6">
                <Alert
                  type="info"
                  showIcon
                  message="اتصال رسمی در سایت و اپ Claude (claude.ai)"
                  description={
                    <ol className="list-decimal pr-4 space-y-1 mb-0">
                      <li>در <code>claude.ai</code> وارد <strong>Settings ← Connectors ← Add custom connector</strong> شوید.</li>
                      <li>نام دلخواه و آدرس سرور MCP بالا را وارد کنید و با حساب کاربری خودتان در تازه‌سیستم لاگین و تأیید کنید.</li>
                    </ol>
                  }
                />
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <Text strong className="text-xs">دستور اتصال در Claude Code:</Text>
                    <CopyInlineButton value={`claude mcp add --transport http tazesystem ${mcpEndpointUrl} --header "Authorization: Bearer YOUR_MCP_TOKEN"`} label="دستور Claude" />
                  </div>
                  <pre dir="ltr" className="text-[11px] m-0 overflow-x-auto">{`claude mcp add --transport http tazesystem ${mcpEndpointUrl} --header "Authorization: Bearer YOUR_MCP_TOKEN"`}</pre>
                </div>
              </div>
            ),
          },
        ]}
      />

      <Divider className="!my-3" />

      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <SafetyCertificateOutlined />
            <Text strong>اتصال‌های OAuth فعال (وب و اپ رسمی)</Text>
          </div>
          <Table
            rowKey="id"
            columns={oauthColumns}
            dataSource={oauthSessions}
            loading={loading}
            size="small"
            pagination={false}
            locale={{ emptyText: 'هنوز هیچ اتصال OAuth فعالی ثبت نشده است' }}
          />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <KeyOutlined />
            <Text strong>توکن‌های شخصی MCP (مخصوص هر کاربر)</Text>
          </div>
          <Table
            rowKey="id"
            columns={tokenColumns}
            dataSource={tokens}
            loading={loading}
            size="small"
            pagination={false}
            locale={{ emptyText: 'توکن شخصی MCP ساخته نشده است' }}
          />
        </div>
      </div>

      <Modal
        title="ساخت توکن شخصی MCP"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void handleCreateToken()}
        okText="ساخت توکن"
        cancelText="انصراف"
        confirmLoading={creating}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            label="نام اتصال"
            name="name"
            rules={[{ required: true, message: 'نام اتصال الزامی است.' }]}
          >
            <Input placeholder="مثال: Codex لپ‌تاپ من" />
          </Form.Item>
          <Form.Item label="ابزار هدف" name="client_hint">
            <Select
              options={[
                { value: 'codex', label: '۱. ChatGPT / Codex' },
                { value: 'gemini', label: '۲. Gemini' },
                { value: 'claude', label: '۳. Claude' },
                { value: 'custom', label: 'سایر کلاینت‌های MCP' },
              ]}
            />
          </Form.Item>
          <Form.Item label="محدودهٔ دسترسی توکن" name="scopes">
            <Checkbox.Group
              options={[
                { label: 'خواندن، شمارش و گزارش‌گیری مجاز', value: 'mcp:read' },
                { label: 'ثبت، ویرایش و حذف (در چارچوب مجوز نقش)', value: 'mcp:write' },
              ]}
            />
          </Form.Item>
          <Alert
            type="warning"
            showIcon
            message="رعایت خودکار دسترسی کاربر"
            description="این توکن فقط دسترسی‌های نقش فعلی خودتان در همین سازمان را دارد و با تغییر نقش یا پلن سازمان، بلافاصله به‌روز می‌شود."
          />
        </Form>
      </Modal>

      <Modal
        title="توکن شخصی MCP آماده شد"
        open={Boolean(revealedToken)}
        onCancel={() => setRevealedToken(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setRevealedToken(null)}>
            بستن
          </Button>,
        ]}
      >
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message="فقط همین یک بار نمایش داده می‌شود"
          description="به دلایل امنیتی فقط هش این توکن در سرور نگهداری می‌شود. همین حالا آن را کپی و در کلاینت MCP خود ذخیره کنید."
        />
        {revealedToken && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between gap-2 bg-gray-50 dark:bg-white/[0.03]">
            <code dir="ltr" className="text-xs break-all select-all">{revealedToken}</code>
            <CopyInlineButton value={revealedToken} label="توکن MCP" />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default McpConnectionPanel;
