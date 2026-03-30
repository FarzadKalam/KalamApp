import React, { useEffect, useState } from 'react';
import { Button, Card, Col, Empty, Row, Spin, Statistic, Table, Tag } from 'antd';
import {
  AppstoreOutlined,
  BankOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  NodeIndexOutlined,
  PlusOutlined,
  ProjectOutlined,
  SkinOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import DateObject from 'react-date-object';
import persian from 'react-date-object/calendars/persian';
import persian_fa from 'react-date-object/locales/persian_fa';
import gregorian from 'react-date-object/calendars/gregorian';
import gregorian_en from 'react-date-object/locales/gregorian_en';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { FieldType, type ModuleDefinition } from '../types';
import { DASHBOARD_PERMISSION_KEY, resolvePreferredRoleModuleIds } from '../utils/permissions';
import { toPersianNumber, formatPersianPrice } from '../utils/persianNumberFormatter';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { readCurrencyConfig, useCurrencyConfig } from '../utils/currency';
import { BRANDING_UPDATED_EVENT, DEFAULT_BRANDING } from '../theme/brandTheme';

type DashboardQuickAction = {
  moduleId: string;
  title: string;
  description: string;
};

type DashboardCardItem = {
  moduleId: string;
  title: string;
  value: number;
  kind: 'number' | 'price';
  subtitle: string;
};

type DashboardRecentSection = {
  moduleId: string;
  title: string;
  columns: any[];
  rows: any[];
};

type DashboardBootstrapResult = {
  widgetPermissions: Record<string, boolean>;
  quickActions: DashboardQuickAction[];
  cards: DashboardCardItem[];
  recentSections: DashboardRecentSection[];
};

const DASHBOARD_BOOTSTRAP_TTL_MS = 60_000;
const RECENT_RECORDS_LIMIT = 10;
const NEW_RECORDS_DAYS = 30;

const SIMPLE_RECENT_FIELD_TYPES = new Set<FieldType>([
  FieldType.TEXT,
  FieldType.STATUS,
  FieldType.DATE,
  FieldType.DATETIME,
  FieldType.TIME,
  FieldType.NUMBER,
  FieldType.PRICE,
  FieldType.PHONE,
  FieldType.SELECT,
]);

const SYNTHETIC_FIELD_META: Record<string, { label: string; type: FieldType }> = {
  created_at: { label: 'تاریخ ایجاد', type: FieldType.DATETIME },
  updated_at: { label: 'آخرین ویرایش', type: FieldType.DATETIME },
};

let dashboardBootstrapCache: {
  key: string | null;
  data: DashboardBootstrapResult | null;
  expiresAt: number;
} = {
  key: null,
  data: null,
  expiresAt: 0,
};

let dashboardBootstrapPromiseKey: string | null = null;
let dashboardBootstrapPromise: Promise<DashboardBootstrapResult> | null = null;

const getTodayPersianDate = () => {
  try {
    const dateObj = new DateObject({
      date: new Date(),
      calendar: gregorian,
      locale: gregorian_en,
    }).convert(persian, persian_fa);
    return dateObj.format('dddd، DD MMMM YYYY');
  } catch {
    return 'تاریخ امروز';
  }
};

const formatPersianDate = (val: any, format: string) => {
  if (!val) return '-';
  try {
    let dateObj: DateObject;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      dateObj = new DateObject({
        date: val,
        format: 'YYYY-MM-DD',
        calendar: gregorian,
        locale: gregorian_en,
      });
    } else {
      const jsDate = new Date(val);
      if (Number.isNaN(jsDate.getTime())) return '-';
      dateObj = new DateObject({
        date: jsDate,
        calendar: gregorian,
        locale: gregorian_en,
      });
    }
    return dateObj.convert(persian, persian_fa).format(format);
  } catch {
    return '-';
  }
};

const getModuleIcon = (moduleId: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    products: <SkinOutlined />,
    product_bundles: <AppstoreOutlined />,
    price_lists: <AppstoreOutlined />,
    production_orders: <CheckSquareOutlined />,
    invoices: <FileTextOutlined />,
    purchase_invoices: <FileTextOutlined />,
    customers: <TeamOutlined />,
    suppliers: <TeamOutlined />,
    employees: <TeamOutlined />,
    tasks: <CheckSquareOutlined />,
    projects: <ProjectOutlined />,
    warehouses: <BankOutlined />,
    billboards: <AppstoreOutlined />,
    marketing_leads: <FileTextOutlined />,
    attendance_logs: <CheckSquareOutlined />,
    process_runs: <NodeIndexOutlined />,
    process_templates: <NodeIndexOutlined />,
  };
  return iconMap[moduleId] || <AppstoreOutlined />;
};

const getModuleTitle = (moduleId: string) => {
  return MODULES[moduleId]?.titles?.faSingular || MODULES[moduleId]?.titles?.fa || moduleId;
};

const getRecentFieldKeys = (module: ModuleDefinition) => {
  const explicit = (module.dashboard?.recentListFields || []).filter(Boolean);
  if (explicit.length > 0) {
    return explicit;
  }

  return (module.fields || [])
    .filter((field: any) => {
      const isHeaderField = field.location === 'header' || String(field.location || '') === 'header';
      return isHeaderField && SIMPLE_RECENT_FIELD_TYPES.has(field.type);
    })
    .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0))
    .slice(0, 4)
    .map((field: any) => String(field.key));
};

const getFieldMeta = (module: ModuleDefinition, fieldKey: string) => {
  return (
    module.fields.find((field: any) => String(field.key) === String(fieldKey)) || {
      key: fieldKey,
      labels: { fa: SYNTHETIC_FIELD_META[fieldKey]?.label || fieldKey },
      type: SYNTHETIC_FIELD_META[fieldKey]?.type || FieldType.TEXT,
      options: [],
    }
  );
};

const renderFieldValue = (module: ModuleDefinition, fieldKey: string, value: any) => {
  const field = getFieldMeta(module, fieldKey);

  if (value === null || value === undefined || value === '') return '-';

  switch (field.type) {
    case FieldType.STATUS:
    case FieldType.SELECT: {
      const option = (field.options || []).find((item: any) => String(item.value) === String(value));
      const text = option?.label || String(value);
      return field.type === FieldType.STATUS ? <Tag color={option?.color || 'default'}>{text}</Tag> : text;
    }
    case FieldType.PRICE:
      return `${formatPersianPrice(Number(value || 0), false)} ${readCurrencyConfig().label}`;
    case FieldType.NUMBER:
      return toPersianNumber(value);
    case FieldType.DATE:
      return formatPersianDate(value, 'YYYY/MM/DD');
    case FieldType.DATETIME:
      return formatPersianDate(value, 'YYYY/MM/DD HH:mm');
    case FieldType.TIME:
      return toPersianNumber(String(value));
    case FieldType.CHECKBOX:
      return value ? 'بله' : 'خیر';
    default:
      return String(value);
  }
};

const countRows = async (table: string, apply?: (query: any) => any) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (apply) query = apply(query);
  const { count } = await query;
  return Number(count || 0);
};

const buildAssignmentFilter = (
  userId: string | null,
  roleId: string | null,
  userField = 'assignee_id',
  roleField = 'assignee_role_id'
) => {
  const filters: string[] = [];
  if (userId) filters.push(`${userField}.eq.${userId}`);
  if (roleId) filters.push(`${roleField}.eq.${roleId}`);
  return filters.join(',');
};

const loadCardForModule = async (
  moduleId: string,
  currentUserId: string | null,
  currentRoleId: string | null
): Promise<DashboardCardItem | null> => {
  const module = MODULES[moduleId];
  if (!module) return null;

  const preset = module.dashboard?.summaryCard?.preset;
  const title = module.dashboard?.summaryCard?.title || module.titles.fa;
  const recentSince = new Date(Date.now() - NEW_RECORDS_DAYS * 24 * 60 * 60 * 1000).toISOString();

  switch (preset) {
    case 'tasks_pending_mine': {
      const assigneeFilter = buildAssignmentFilter(currentUserId, currentRoleId);
      const pendingCount = await countRows('tasks', (query) =>
        query
          .in('status', ['todo', 'in_progress', 'review'])
          .or(assigneeFilter)
      );
      const totalCount = await countRows('tasks');
      return {
        moduleId,
        title,
        value: pendingCount,
        kind: 'number',
        subtitle: `از کل ${toPersianNumber(totalCount)} فعالیت`,
      };
    }

    case 'invoices_total_amount_mine': {
      const assigneeFilter = buildAssignmentFilter(currentUserId, currentRoleId);
      const { data, count } = await supabase
        .from('invoices')
        .select('id, total_invoice_amount', { count: 'exact' })
        .or(assigneeFilter);
      const totalAmount = (data || []).reduce((sum: number, row: any) => sum + Number(row?.total_invoice_amount || 0), 0);
      return {
        moduleId,
        title,
        value: totalAmount,
        kind: 'price',
        subtitle: `از ${toPersianNumber(count || 0)} عدد فاکتور`,
      };
    }

    case 'customers_new_mine': {
      const assigneeFilter = buildAssignmentFilter(currentUserId, currentRoleId);
      const newCount = await countRows('customers', (query) =>
        query
          .gte('created_at', recentSince)
          .or(assigneeFilter)
      );
      return {
        moduleId,
        title,
        value: newCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} عدد برای من`,
      };
    }

    case 'projects_in_progress': {
      const activeProjects = await countRows('projects', (query) => query.eq('status', 'in_progress'));
      const memberProjects = currentUserId
        ? await countRows('project_members', (query) =>
            query.eq('user_id', currentUserId).eq('is_active', true)
          )
        : 0;
      return {
        moduleId,
        title,
        value: activeProjects,
        kind: 'number',
        subtitle: `من در ${toPersianNumber(memberProjects)} پروژه نقش دارم`,
      };
    }

    case 'billboards_opening': {
      const openingCount = await countRows('billboards', (query) => query.eq('status', 'opening'));
      const freeCount = await countRows('billboards', (query) => query.eq('status', 'free'));
      return {
        moduleId,
        title,
        value: openingCount,
        kind: 'number',
        subtitle: `تعداد ${toPersianNumber(freeCount)} عدد تابلوی آزاد`,
      };
    }

    case 'products_total': {
      const totalCount = await countRows('products');
      const newCount = await countRows('products', (query) => query.gte('created_at', recentSince));
      return {
        moduleId,
        title,
        value: totalCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} عدد محصول جدید`,
      };
    }

    default: {
      const totalCount = await countRows(module.table);
      const newCount = await countRows(module.table, (query) => query.gte('created_at', recentSince));
      return {
        moduleId,
        title,
        value: totalCount,
        kind: 'number',
        subtitle: `${toPersianNumber(newCount)} مورد جدید`,
      };
    }
  }
};

const loadRecentSection = async (moduleId: string): Promise<DashboardRecentSection | null> => {
  const module = MODULES[moduleId];
  if (!module) return null;

  const fieldKeys = Array.from(new Set(['id', ...getRecentFieldKeys(module)]));
  const selectKeys = Array.from(new Set([...fieldKeys, 'created_at', 'updated_at']));

  const { data } = await supabase
    .from(module.table)
    .select(selectKeys.join(','))
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(RECENT_RECORDS_LIMIT);

  const columns = getRecentFieldKeys(module).map((fieldKey) => ({
    title: getFieldMeta(module, fieldKey)?.labels?.fa || fieldKey,
    dataIndex: fieldKey,
    key: fieldKey,
    ellipsis: true,
    render: (value: any) => renderFieldValue(module, fieldKey, value),
  }));

  return {
    moduleId,
    title: module.titles.fa,
    columns,
    rows: data || [],
  };
};

const buildDashboardBootstrap = async (): Promise<DashboardBootstrapResult> => {
  const snapshot = await fetchSessionBootstrap(supabase);
  const userId = snapshot.user?.id ? String(snapshot.user.id) : null;
  const roleId = snapshot.roleId ? String(snapshot.roleId) : null;
  const permissions = snapshot.permissions || {};
  const dashboardPermissions = permissions?.[DASHBOARD_PERMISSION_KEY] || {};

  if (!userId) {
    return {
      widgetPermissions: {},
      quickActions: [],
      cards: [],
      recentSections: [],
    };
  }

  if (dashboardPermissions.view === false) {
    return {
      widgetPermissions: { __all: false },
      quickActions: [],
      cards: [],
      recentSections: [],
    };
  }

  const preferredModuleIds = resolvePreferredRoleModuleIds(permissions, MODULES, 4);
  const cacheKey = `${userId}:${roleId || 'no-role'}:${preferredModuleIds.join(',')}`;

  if (
    dashboardBootstrapCache.key === cacheKey &&
    dashboardBootstrapCache.data &&
    dashboardBootstrapCache.expiresAt > Date.now()
  ) {
    return dashboardBootstrapCache.data;
  }

  if (dashboardBootstrapPromise && dashboardBootstrapPromiseKey === cacheKey) {
    return dashboardBootstrapPromise;
  }

  dashboardBootstrapPromiseKey = cacheKey;
  dashboardBootstrapPromise = (async () => {
    const quickActions = preferredModuleIds.map((moduleId) => ({
      moduleId,
      title: MODULES[moduleId]?.dashboard?.quickCreateLabel || `ایجاد ${getModuleTitle(moduleId)}`,
      description: getModuleTitle(moduleId),
    }));

    const [cards, recentSections] = await Promise.all([
      Promise.all(preferredModuleIds.map((moduleId) => loadCardForModule(moduleId, userId, roleId))),
      Promise.all(preferredModuleIds.map((moduleId) => loadRecentSection(moduleId))),
    ]);

    const result: DashboardBootstrapResult = {
      widgetPermissions: (dashboardPermissions.fields || {}) as Record<string, boolean>,
      quickActions,
      cards: cards.filter(Boolean) as DashboardCardItem[],
      recentSections: recentSections.filter(Boolean) as DashboardRecentSection[],
    };

    dashboardBootstrapCache = {
      key: cacheKey,
      data: result,
      expiresAt: Date.now() + DASHBOARD_BOOTSTRAP_TTL_MS,
    };

    return result;
  })();

  try {
    return await dashboardBootstrapPromise;
  } finally {
    if (dashboardBootstrapPromiseKey === cacheKey) {
      dashboardBootstrapPromise = null;
      dashboardBootstrapPromiseKey = null;
    }
  }
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const currency = useCurrencyConfig();
  const [loading, setLoading] = useState(true);
  const [dashboardReady, setDashboardReady] = useState(false);
  const [brandTitle, setBrandTitle] = useState(DEFAULT_BRANDING.brandName);
  const [widgetPermissions, setWidgetPermissions] = useState<Record<string, boolean>>({});
  const [quickActions, setQuickActions] = useState<DashboardQuickAction[]>([]);
  const [cards, setCards] = useState<DashboardCardItem[]>([]);
  const [recentSections, setRecentSections] = useState<DashboardRecentSection[]>([]);

  useEffect(() => {
    const readBrandTitle = () => {
      const value = document.documentElement.getAttribute('data-brand-title');
      setBrandTitle(value?.trim() || DEFAULT_BRANDING.brandName);
    };
    readBrandTitle();
    window.addEventListener(BRANDING_UPDATED_EVENT, readBrandTitle as EventListener);
    return () => {
      window.removeEventListener(BRANDING_UPDATED_EVENT, readBrandTitle as EventListener);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async () => {
      setLoading(true);
      try {
        const result = await buildDashboardBootstrap();
        if (!isMounted) return;
        setWidgetPermissions(result.widgetPermissions || {});
        setQuickActions(result.quickActions || []);
        setCards(result.cards || []);
        setRecentSections(result.recentSections || []);
      } catch (error) {
        console.error('Error loading dashboard:', error);
        if (!isMounted) return;
        setWidgetPermissions({});
        setQuickActions([]);
        setCards([]);
        setRecentSections([]);
      } finally {
        if (!isMounted) return;
        setLoading(false);
        setDashboardReady(true);
      }
    };

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  const canShowWidget = (key: string) => {
    if (!dashboardReady) return false;
    if (widgetPermissions.__all === false) return false;
    return widgetPermissions[key] !== false;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg p-4 md:p-6">
      <div className="mb-6">
        <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm p-6 border border-gray-200 dark:border-dark-border">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-black text-leather-500 mb-2">{brandTitle}</h1>
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <CalendarOutlined />
                <span className="text-sm">{getTodayPersianDate()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && !dashboardReady && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-dark-border dark:bg-dark-surface">
          <Spin size="large" />
        </div>
      )}

      {!loading && dashboardReady && widgetPermissions.__all === false && (
        <Card className="mb-6 shadow-sm">
          <Empty description="دسترسی مشاهده داشبورد برای این نقش غیرفعال است." />
        </Card>
      )}

      {canShowWidget('quick_add') && quickActions.length > 0 && (
        <div className="mb-6">
          <Card className="shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-lg font-bold">افزودن سریع</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">بر اساس ماژول های پر استفاده این نقش</div>
            </div>
            <Row gutter={[16, 16]}>
              {quickActions.map((action, index) => (
                <Col xs={24} sm={12} lg={6} key={action.moduleId}>
                  <Button
                    type={index === 0 ? 'primary' : 'default'}
                    icon={getModuleIcon(action.moduleId)}
                    size="large"
                    block
                    onClick={() => navigate(`/${action.moduleId}/create`)}
                    className="h-auto py-4"
                  >
                    <div className="text-center">
                      <div className="font-bold">{action.title}</div>
                      <div className="mt-1 text-xs opacity-75">{action.description}</div>
                    </div>
                  </Button>
                </Col>
              ))}
            </Row>
          </Card>
        </div>
      )}

      {canShowWidget('summary_cards') && cards.length > 0 && (
        <Row gutter={[16, 16]} className="mb-6">
          {cards.map((card) => (
            <Col xs={24} sm={12} lg={6} key={card.moduleId}>
              <Card
                className="shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`/${card.moduleId}`)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{getModuleTitle(card.moduleId)}</div>
                  <div className="text-leather-500">{getModuleIcon(card.moduleId)}</div>
                </div>
                <Statistic
                  title={card.title}
                  value={card.value}
                  formatter={(value) =>
                    card.kind === 'price'
                      ? formatPersianPrice(Number(value || 0), false)
                      : toPersianNumber(Number(value || 0))
                  }
                  suffix={card.kind === 'price' ? currency.label : undefined}
                  valueStyle={{ color: 'rgb(var(--brand-500-rgb))', fontSize: '1.5rem', fontWeight: 'bold' }}
                />
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{card.subtitle}</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {canShowWidget('recent_lists') && recentSections.length > 0 && (
        <Row gutter={[16, 16]}>
          {recentSections.map((section) => (
            <Col xs={24} lg={12} key={section.moduleId}>
              <Card
                className="shadow-sm hover:shadow-md transition-shadow"
                title={
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-leather-500">{getModuleIcon(section.moduleId)}</span>
                      <span className="text-lg font-bold">{section.title}</span>
                    </div>
                    <Button
                      type="link"
                      icon={<PlusOutlined />}
                      onClick={() => navigate(`/${section.moduleId}/create`)}
                    >
                      ایجاد
                    </Button>
                  </div>
                }
                extra={
                  <Button type="link" onClick={() => navigate(`/${section.moduleId}`)}>
                    مشاهده همه
                  </Button>
                }
              >
                <Table
                  dataSource={section.rows}
                  columns={section.columns}
                  size="small"
                  pagination={false}
                  locale={{ emptyText: 'رکوردی ثبت نشده است' }}
                  rowKey="id"
                  scroll={{ x: true }}
                  onRow={(record) => ({
                    onClick: () => navigate(`/${section.moduleId}/${record.id}`),
                    className: 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-border',
                  })}
                />
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
};

export default Dashboard;
