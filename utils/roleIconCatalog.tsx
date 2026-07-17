import React from 'react';
import {
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  BarChartOutlined,
  BranchesOutlined,
  BuildOutlined,
  BulbOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CloudServerOutlined,
  ClusterOutlined,
  CodeOutlined,
  CrownOutlined,
  CustomerServiceOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DollarOutlined,
  FileTextOutlined,
  FolderOutlined,
  FormOutlined,
  HeartOutlined,
  LineChartOutlined,
  MailOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  PhoneOutlined,
  PieChartOutlined,
  ProfileOutlined,
  ProjectOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingCartOutlined,
  SolutionOutlined,
  StarOutlined,
  TeamOutlined,
  ToolOutlined,
  TruckOutlined,
  UserOutlined,
} from '@ant-design/icons';

export type RoleIconKey =
  | 'team'
  | 'user'
  | 'crown'
  | 'safety-certificate'
  | 'audit'
  | 'solution'
  | 'customer-service'
  | 'phone'
  | 'message'
  | 'mail'
  | 'calendar'
  | 'clock'
  | 'project'
  | 'apartment'
  | 'cluster'
  | 'branches'
  | 'node-index'
  | 'deployment-unit'
  | 'build'
  | 'tool'
  | 'setting'
  | 'database'
  | 'cloud-server'
  | 'code'
  | 'file-text'
  | 'folder'
  | 'read'
  | 'form'
  | 'profile'
  | 'bar-chart'
  | 'line-chart'
  | 'pie-chart'
  | 'dollar'
  | 'bank'
  | 'shopping-cart'
  | 'truck'
  | 'shop'
  | 'star'
  | 'heart'
  | 'bulb';

export type RoleIconOption = {
  key: RoleIconKey;
  label: string;
  icon: React.ReactNode;
};

export const DEFAULT_ROLE_ICON_KEY: RoleIconKey = 'team';

export const ROLE_ICON_OPTIONS: RoleIconOption[] = [
  { key: 'team', label: 'تیم', icon: <TeamOutlined /> },
  { key: 'user', label: 'شخص', icon: <UserOutlined /> },
  { key: 'crown', label: 'مدیریت ارشد', icon: <CrownOutlined /> },
  { key: 'safety-certificate', label: 'امنیت و کنترل', icon: <SafetyCertificateOutlined /> },
  { key: 'audit', label: 'ممیزی', icon: <AuditOutlined /> },
  { key: 'solution', label: 'کارشناس', icon: <SolutionOutlined /> },
  { key: 'customer-service', label: 'پشتیبانی', icon: <CustomerServiceOutlined /> },
  { key: 'phone', label: 'تلفن', icon: <PhoneOutlined /> },
  { key: 'message', label: 'پیام', icon: <MessageOutlined /> },
  { key: 'mail', label: 'نامه', icon: <MailOutlined /> },
  { key: 'calendar', label: 'تقویم', icon: <CalendarOutlined /> },
  { key: 'clock', label: 'زمان', icon: <ClockCircleOutlined /> },
  { key: 'project', label: 'پروژه', icon: <ProjectOutlined /> },
  { key: 'apartment', label: 'ساختار سازمانی', icon: <ApartmentOutlined /> },
  { key: 'cluster', label: 'خوشه', icon: <ClusterOutlined /> },
  { key: 'branches', label: 'شاخه‌ها', icon: <BranchesOutlined /> },
  { key: 'node-index', label: 'فرآیند', icon: <NodeIndexOutlined /> },
  { key: 'deployment-unit', label: 'واحد', icon: <DeploymentUnitOutlined /> },
  { key: 'build', label: 'ساخت', icon: <BuildOutlined /> },
  { key: 'tool', label: 'ابزار', icon: <ToolOutlined /> },
  { key: 'setting', label: 'تنظیمات', icon: <SettingOutlined /> },
  { key: 'database', label: 'داده', icon: <DatabaseOutlined /> },
  { key: 'cloud-server', label: 'زیرساخت', icon: <CloudServerOutlined /> },
  { key: 'code', label: 'فناوری', icon: <CodeOutlined /> },
  { key: 'file-text', label: 'اسناد', icon: <FileTextOutlined /> },
  { key: 'folder', label: 'پرونده', icon: <FolderOutlined /> },
  { key: 'read', label: 'مطالعه', icon: <ReadOutlined /> },
  { key: 'form', label: 'فرم', icon: <FormOutlined /> },
  { key: 'profile', label: 'پروفایل', icon: <ProfileOutlined /> },
  { key: 'bar-chart', label: 'گزارش ستونی', icon: <BarChartOutlined /> },
  { key: 'line-chart', label: 'رشد', icon: <LineChartOutlined /> },
  { key: 'pie-chart', label: 'تحلیل', icon: <PieChartOutlined /> },
  { key: 'dollar', label: 'مالی', icon: <DollarOutlined /> },
  { key: 'bank', label: 'بانک و حسابداری', icon: <BankOutlined /> },
  { key: 'shopping-cart', label: 'خرید', icon: <ShoppingCartOutlined /> },
  { key: 'truck', label: 'تدارکات', icon: <TruckOutlined /> },
  { key: 'shop', label: 'فروشگاه', icon: <ShopOutlined /> },
  { key: 'star', label: 'ویژه', icon: <StarOutlined /> },
  { key: 'heart', label: 'منابع انسانی', icon: <HeartOutlined /> },
  { key: 'bulb', label: 'ایده و نوآوری', icon: <BulbOutlined /> },
];

const ROLE_ICON_MAP = new Map(ROLE_ICON_OPTIONS.map((item) => [item.key, item] as const));

export const normalizeRoleIconKey = (value: unknown): RoleIconKey => {
  const key = String(value || '').trim() as RoleIconKey;
  return ROLE_ICON_MAP.has(key) ? key : DEFAULT_ROLE_ICON_KEY;
};

export const getRoleIconOption = (value: unknown): RoleIconOption =>
  ROLE_ICON_MAP.get(normalizeRoleIconKey(value)) || ROLE_ICON_OPTIONS[0];

export const renderRoleIcon = (value: unknown) => getRoleIconOption(value).icon;
