import type { CSSProperties, ReactNode } from 'react';
import {
  AccountBookOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  CloudServerOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  FormOutlined,
  FundOutlined,
  InboxOutlined,
  InstagramOutlined,
  NotificationOutlined,
  ProjectOutlined,
  ReadOutlined,
  RetweetOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  ShoppingOutlined,
  SolutionOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  WalletOutlined,
} from '@ant-design/icons';

type ModuleIconComponent = (props: { className?: string; style?: CSSProperties }) => ReactNode;

// کلیدهای presentation در registry ثبت می‌شوند؛ بنابراین همهٔ سطوح UI از یک
// خانوادهٔ آیکون سبک Ant Design استفاده می‌کنند و نیازی به بارگیری کتابخانهٔ جدید نیست.
export const MODULE_ICON_KEYS: Record<string, string> = {
  products: 'shopping', billboards: 'environment', billboard_status_changes: 'retweet', product_bundles: 'container',
  warehouses: 'inbox', shelves: 'container', stock_transfers: 'swap', secretariat_documents: 'file_done',
  delivery_forms: 'send', advertising_campaigns: 'bar_chart', advertising_campaign_tools: 'form', advertising_campaign_responses: 'file_search',
  content_calendars: 'calendar', production_boms: 'calculator', production_orders: 'container', production_group_orders: 'container',
  customers: 'team', suppliers: 'user_switch', invoices: 'file_done', purchase_invoices: 'file_search',
  sales_return_invoices: 'retweet', purchase_return_invoices: 'retweet', projects: 'project', marketing_leads: 'fund',
  personas: 'solution', instructions: 'read', process_templates: 'form', process_runs: 'audit', tasks: 'check_square',
  calculation_formulas: 'calculator', fiscal_years: 'calendar', chart_of_accounts: 'account_book', journal_entries: 'account_book',
  accounting_event_rules: 'audit', cost_centers: 'fund', cash_boxes: 'wallet', bank_accounts: 'bank', petty_funds: 'wallet',
  cheques: 'credit_card', barters: 'swap', cash_bank_operations: 'dollar', profiles: 'solution', employees: 'team',
  job_descriptions: 'read', mbti_assessments: 'file_search', attendance_logs: 'check_square', work_schedules: 'calendar',
  leave_requests: 'calendar', overtime_requests: 'calendar', mission_requests: 'environment', price_lists: 'tags',
  web_forms: 'form', automation_execution_reports: 'audit', sms_delivery_reports: 'file_done', voip_call_reports: 'file_search',
  counterparty_bot_groups: 'robot', instagram_conversations: 'instagram', instagram_interaction_events: 'instagram', expense_documents: 'wallet',
  assets: 'container', employee_advances: 'dollar', employee_bonus_requests: 'dollar', employee_penalty_requests: 'audit',
  payroll_slips: 'file_done', employee_contracts: 'file_done', recruitment_applicants: 'user_switch', surveys: 'form',
  saas_orgs: 'cloud_server', saas_demo_requests: 'file_search', saas_users: 'team', saas_user_announcements: 'notification',
  cms_blog_posts: 'read', cms_tutorial_posts: 'read', cms_tutorial_series: 'read', cms_categories: 'folder', cms_tags: 'tags', cms_pages: 'form',
};

const ICONS: Record<string, ModuleIconComponent> = {
  shopping: ShoppingOutlined, environment: EnvironmentOutlined, retweet: RetweetOutlined, container: ContainerOutlined,
  inbox: InboxOutlined, swap: SwapOutlined, file_done: FileDoneOutlined, send: SendOutlined, bar_chart: BarChartOutlined,
  form: FormOutlined, file_search: FileSearchOutlined, calendar: CalendarOutlined, calculator: CalculatorOutlined,
  team: TeamOutlined, user_switch: UserSwitchOutlined, project: ProjectOutlined, fund: FundOutlined, solution: SolutionOutlined,
  read: ReadOutlined, audit: AuditOutlined, check_square: CheckSquareOutlined, account_book: AccountBookOutlined,
  wallet: WalletOutlined, bank: BankOutlined, credit_card: CreditCardOutlined, dollar: DollarOutlined, tags: TagsOutlined,
  robot: RobotOutlined, instagram: InstagramOutlined, cloud_server: CloudServerOutlined, notification: NotificationOutlined,
  folder: FolderOpenOutlined,
};

export const getModuleIconKey = (moduleId?: string | null) =>
  MODULE_ICON_KEYS[String(moduleId || '').trim()] || 'appstore';

export const renderModuleIcon = (
  module: { id?: string | null; iconKey?: string | null } | string | null | undefined,
  options?: { className?: string; style?: CSSProperties },
) => {
  const key = typeof module === 'string'
    ? getModuleIconKey(module)
    : String(module?.iconKey || getModuleIconKey(module?.id)).trim();
  const Icon = ICONS[key] || AppstoreOutlined;
  return <Icon className={options?.className} style={options?.style} aria-hidden />;
};
