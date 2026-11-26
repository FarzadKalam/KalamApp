import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Radio, Space, Spin, Tag, Typography } from 'antd';
import { CheckCircleOutlined, CloudServerOutlined, LockOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { publicRuntimeConfig } from '../utils/runtimeConfig';
import { toFaErrorMessage } from '../utils/errorMessageFa';

const { Title, Text, Paragraph } = Typography;

type UserOrgOption = {
  org_id: string;
  org_name: string;
  role_name?: string | null;
  is_owner?: boolean;
};

const CLIENT_KIND_TITLES: Record<string, string> = {
  codex: 'OpenAI Codex / ChatGPT',
  chatgpt: 'ChatGPT',
  gemini: 'Google Gemini',
  claude: 'Anthropic Claude',
  custom: 'کلاینت خارجی MCP',
};

const McpOAuthAuthorizePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string>('');
  const [orgs, setOrgs] = useState<UserOrgOption[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['mcp:read', 'mcp:write']);

  const oauthParams = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    return {
      clientId: params.get('client_id') || '',
      clientName: params.get('client_name') || 'External AI Client',
      clientKind: params.get('client_kind') || 'custom',
      redirectUri: params.get('redirect_uri') || '',
      codeChallenge: params.get('code_challenge') || '',
      codeChallengeMethod: params.get('code_challenge_method') || 'S256',
      scope: params.get('scope') || 'mcp:read mcp:write',
      state: params.get('state') || '',
    };
  }, [location.search]);

  useEffect(() => {
    const requestedScopes = oauthParams.scope.split(/[\s,]+/).filter((s) => s === 'mcp:read' || s === 'mcp:write');
    if (requestedScopes.length) setSelectedScopes(requestedScopes);
  }, [oauthParams.scope]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data: sessionRes } = await supabase.auth.getSession();
        const session = sessionRes?.session;
        if (!session?.access_token) {
          const returnUrl = `${location.pathname}${location.search || ''}`;
          navigate(`/login?redirectTo=${encodeURIComponent(returnUrl)}`, { replace: true });
          return;
        }
        setUserEmail(String(session.user?.email || ''));

        const { data: orgList, error: orgErr } = await supabase.rpc('get_user_organizations');
        if (orgErr) throw orgErr;
        const rows = (Array.isArray(orgList) ? orgList : []) as UserOrgOption[];
        if (!active) return;
        setOrgs(rows);
        if (rows.length > 0) {
          setSelectedOrgId(rows[0].org_id);
        } else {
          setError('هیچ سازمان فعالی برای حساب کاربری شما پیدا نشد.');
        }
      } catch (err: any) {
        if (active) setError(toFaErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [location.pathname, location.search, navigate]);

  const handleApprove = async () => {
    if (!selectedOrgId || !oauthParams.clientId || !oauthParams.redirectUri) return;
    try {
      setSubmitting(true);
      setError(null);
      const { data: sessionRes } = await supabase.auth.getSession();
      const jwt = sessionRes?.session?.access_token;
      if (!jwt) throw new Error('نشست کاربری منقضی شده است.');

      const supabaseBase = String(publicRuntimeConfig.supabaseUrl || '').replace(/\/+$/, '');
      const res = await fetch(`${supabaseBase}/functions/v1/mcp-server/oauth/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          org_id: selectedOrgId,
          client_id: oauthParams.clientId,
          redirect_uri: oauthParams.redirectUri,
          code_challenge: oauthParams.codeChallenge,
          code_challenge_method: oauthParams.codeChallengeMethod,
          scope: selectedScopes.length ? selectedScopes.join(' ') : 'mcp:read',
          state: oauthParams.state,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.redirect_to) {
        throw new Error(payload?.message || 'تأیید اتصال MCP ناموفق بود.');
      }
      window.location.href = payload.redirect_to;
    } catch (err: any) {
      setError(toFaErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!oauthParams.redirectUri) {
      navigate('/');
      return;
    }
    try {
      const target = new URL(oauthParams.redirectUri);
      target.searchParams.set('error', 'access_denied');
      if (oauthParams.state) target.searchParams.set('state', oauthParams.state);
      window.location.href = target.toString();
    } catch {
      navigate('/');
    }
  };

  if (!oauthParams.clientId || !oauthParams.redirectUri || !oauthParams.codeChallenge) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50" dir="rtl">
        <Card className="max-w-lg w-full">
          <Alert type="error" showIcon message="درخواست اتصال OAuth معتبر نیست یا پارامترهای امنیتی ناقص است." />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-[#111315]" dir="rtl">
      <Card className="max-w-xl w-full shadow-lg rounded-2xl">
        {loading ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <Spin size="large" />
            <Text type="secondary">در حال بررسی نشست و سازمان‌های شما…</Text>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-xl">
                <CloudServerOutlined />
              </div>
              <div>
                <Title level={4} className="!mb-0">تأیید اتصال هوش مصنوعی خارجی (MCP)</Title>
                <Text type="secondary" className="text-xs">
                  درخواست اتصال از: <Tag color="blue">{CLIENT_KIND_TITLES[oauthParams.clientKind] || oauthParams.clientName}</Tag>
                </Text>
              </div>
            </div>

            {error && <Alert type="error" showIcon message={error} />}

            <Paragraph className="text-sm text-gray-600 dark:text-gray-300 !mb-2">
              شما با حساب <strong>{userEmail || 'کاربر جاری'}</strong> در حال دادن دسترسی به این ابزار هستید. دسترسی‌ها دقیقاً محدود به پلن سازمان انتخابی و نقش کاربری خودتان خواهد بود.
            </Paragraph>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <Text strong className="block text-sm">سازمان مورد نظر برای اتصال:</Text>
              <Radio.Group
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="w-full"
              >
                <Space direction="vertical" className="w-full">
                  {orgs.map((org) => (
                    <Radio key={org.org_id} value={org.org_id} className="w-full">
                      <span className="font-medium">{org.org_name}</span>
                      {org.role_name && <Tag className="mr-2">{org.role_name}</Tag>}
                      {org.is_owner && <Tag color="gold">مالک</Tag>}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </div>

            <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <Text strong className="block text-sm">محدودهٔ عملیات مجاز:</Text>
              <Checkbox.Group
                value={selectedScopes}
                onChange={(vals) => {
                  const next = Array.from(new Set(['mcp:read', ...vals.map(String)]));
                  setSelectedScopes(next);
                }}
              >
                <Space direction="vertical">
                  <Checkbox value="mcp:read" disabled>
                    خواندن، جستجو و گزارش‌گیری ماژول‌های مجاز (الزامی)
                  </Checkbox>
                  <Checkbox value="mcp:write">
                    ایجاد، ویرایش و حذف رکوردها (فقط در حد مجوزهای نقش شما)
                  </Checkbox>
                </Space>
              </Checkbox.Group>
            </div>

            <Alert
              type="info"
              showIcon
              icon={<SafetyCertificateOutlined />}
              message="حفظ حریم خصوصی و دسترسی"
              description="سرویس خارجی هیچ دسترسی مازاد بر نقش شما نخواهد داشت و فقط سازمان‌های دارای قابلیت MCP در پلن می‌توانند متصل شوند. هر زمان از بخش تنظیمات قابل لغو است."
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button icon={<LockOutlined />} onClick={handleCancel} disabled={submitting}>
                لغو و بازگشت
              </Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={submitting}
                disabled={!selectedOrgId}
                onClick={() => void handleApprove()}
              >
                تأیید و برقراری اتصال
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default McpOAuthAuthorizePage;
