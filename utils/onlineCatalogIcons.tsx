import React from 'react';
import {
  ApiOutlined,
  AppstoreOutlined,
  BankOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  CloudOutlined,
  CustomerServiceOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  GiftOutlined,
  GlobalOutlined,
  HeartOutlined,
  LikeOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
  SafetyOutlined,
  ShopOutlined,
  StarOutlined,
  TeamOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

export type OnlineCatalogIconOption = { value: string; label: string; icon: React.ReactNode };

export const ONLINE_CATALOG_ICON_OPTIONS: OnlineCatalogIconOption[] = [
  { value: 'star', label: 'ستاره', icon: <StarOutlined /> },
  { value: 'check', label: 'تأیید', icon: <CheckCircleOutlined /> },
  { value: 'heart', label: 'قلب', icon: <HeartOutlined /> },
  { value: 'like', label: 'پسندیده', icon: <LikeOutlined /> },
  { value: 'trophy', label: 'جام', icon: <TrophyOutlined /> },
  { value: 'gift', label: 'هدیه', icon: <GiftOutlined /> },
  { value: 'rocket', label: 'رشد سریع', icon: <RocketOutlined /> },
  { value: 'thunderbolt', label: 'قدرت', icon: <ThunderboltOutlined /> },
  { value: 'bulb', label: 'ایده', icon: <BulbOutlined /> },
  { value: 'team', label: 'تیم', icon: <TeamOutlined /> },
  { value: 'safety', label: 'امنیت', icon: <SafetyOutlined /> },
  { value: 'certificate', label: 'گواهی', icon: <SafetyCertificateOutlined /> },
  { value: 'shop', label: 'فروشگاه', icon: <ShopOutlined /> },
  { value: 'bank', label: 'سازمان', icon: <BankOutlined /> },
  { value: 'global', label: 'گستره جهانی', icon: <GlobalOutlined /> },
  { value: 'cloud', label: 'ابری', icon: <CloudOutlined /> },
  { value: 'dashboard', label: 'داشبورد', icon: <DashboardOutlined /> },
  { value: 'experiment', label: 'نوآوری', icon: <ExperimentOutlined /> },
  { value: 'customer_service', label: 'پشتیبانی', icon: <CustomerServiceOutlined /> },
  { value: 'api', label: 'اتصال', icon: <ApiOutlined /> },
  { value: 'appstore', label: 'محصولات', icon: <AppstoreOutlined /> },
];

const iconMap = new Map(ONLINE_CATALOG_ICON_OPTIONS.map((item) => [item.value, item.icon]));

export const getOnlineCatalogIcon = (value: unknown) => iconMap.get(String(value || '').trim()) || <StarOutlined />;
