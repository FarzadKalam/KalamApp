import React from 'react';
import {
  ApiOutlined, AppstoreOutlined, AuditOutlined, BarChartOutlined, BellOutlined,
  BranchesOutlined, CalendarOutlined, CloudServerOutlined, ClusterOutlined,
  CommentOutlined, DatabaseOutlined, DollarOutlined, FileTextOutlined,
  FolderOpenOutlined, FormOutlined, FundProjectionScreenOutlined, GlobalOutlined,
  MailOutlined, MessageOutlined, NodeIndexOutlined, PhoneOutlined, PictureOutlined,
  RobotOutlined, SafetyCertificateOutlined, SoundOutlined, TeamOutlined,
  ThunderboltOutlined, VideoCameraOutlined, FileSearchOutlined, BulbOutlined,
  IdcardOutlined, ShoppingOutlined, ProjectOutlined, CalculatorOutlined,
  InboxOutlined, LinkOutlined, RiseOutlined, GiftOutlined, ClockCircleOutlined,
  AimOutlined, ApartmentOutlined, WalletOutlined, ScheduleOutlined, SolutionOutlined,
} from '@ant-design/icons';
import AiSparkleIcon from '../ai/AiSparkleIcon';

// نگاشت کلید رشته‌ای → آیکن (برای ذخیره props به‌صورت JSON)
export const ICON_MAP: Record<string, React.ReactNode> = {
  ai: <AiSparkleIcon className="h-5 w-5" />,
  robot: <RobotOutlined />,
  process: <NodeIndexOutlined />,
  branches: <BranchesOutlined />,
  cluster: <ClusterOutlined />,
  message: <MessageOutlined />,
  comment: <CommentOutlined />,
  folder: <FolderOpenOutlined />,
  api: <ApiOutlined />,
  chart: <BarChartOutlined />,
  dashboard: <FundProjectionScreenOutlined />,
  shield: <SafetyCertificateOutlined />,
  cloud: <CloudServerOutlined />,
  database: <DatabaseOutlined />,
  team: <TeamOutlined />,
  thunder: <ThunderboltOutlined />,
  phone: <PhoneOutlined />,
  mail: <MailOutlined />,
  sound: <SoundOutlined />,
  calendar: <CalendarOutlined />,
  global: <GlobalOutlined />,
  file: <FileTextOutlined />,
  form: <FormOutlined />,
  dollar: <DollarOutlined />,
  audit: <AuditOutlined />,
  picture: <PictureOutlined />,
  video: <VideoCameraOutlined />,
  search: <FileSearchOutlined />,
  bulb: <BulbOutlined />,
  bell: <BellOutlined />,
  app: <AppstoreOutlined />,
  idcard: <IdcardOutlined />,
  shopping: <ShoppingOutlined />,
  project: <ProjectOutlined />,
  calculator: <CalculatorOutlined />,
  inbox: <InboxOutlined />,
  link: <LinkOutlined />,
  kpi: <RiseOutlined />,
  gift: <GiftOutlined />,
  clock: <ClockCircleOutlined />,
  target: <AimOutlined />,
  tree: <ApartmentOutlined />,
  wallet: <WalletOutlined />,
  schedule: <ScheduleOutlined />,
  solution: <SolutionOutlined />,
};

export const renderIcon = (icon?: string, fallback: React.ReactNode = <ThunderboltOutlined />): React.ReactNode => {
  if (!icon) return fallback;
  if (icon.startsWith('http') || icon.startsWith('/')) {
    return <img src={icon} alt="" className="h-6 w-6 object-contain" />;
  }
  return ICON_MAP[icon] ?? fallback;
};

// گزینه‌های آیکن برای انتخاب در ادمین
export const ICON_OPTIONS = Object.keys(ICON_MAP).map((key) => ({ value: key, label: key }));
