import type { ReactNode } from 'react';
import {
  AccountBookOutlined,
  AppstoreOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ContainerOutlined,
  FileSearchOutlined,
  NodeIndexOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  ProfileOutlined,
  ProjectOutlined,
  RetweetOutlined,
  RobotOutlined,
  SendOutlined,
  StarOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';

type ActionIcon = () => ReactNode;

// اکشن‌های هدر از ماژول‌های مختلف در اینجا به یک معنای بصری مشترک متصل می‌شوند.
// در نتیجه، نام یا رنگ دکمه ممکن است متفاوت باشد، اما هر عمل مشابه همیشه آیکون یکسانی دارد.
const ACTION_ICONS: Record<string, ActionIcon> = {
  auto_name: StarOutlined,
  create_process: NodeIndexOutlined,
  create_project: ProjectOutlined,
  process_task_card: ProfileOutlined,
  create_customer_from_lead: UserAddOutlined,
  counterparty_bot_group_status: RobotOutlined,
  quick_stock_movement: SwapOutlined,
  create_journal_entry: AccountBookOutlined,
  issue_accounting_entry: AccountBookOutlined,
  request_status_change: RetweetOutlined,
  approve_billboard_status_change: CheckCircleOutlined,
  send_taxpayer_system: SendOutlined,
  start_production: PlayCircleOutlined,
  stop_production: PauseCircleOutlined,
  complete_production: CheckCircleOutlined,
  create_production_order: ContainerOutlined,
  rebuild_instruction_ai_context: RobotOutlined,
  rebuild_job_description_ai_context: RobotOutlined,
  mbti_analyze_report: FileSearchOutlined,
  online_catalog: ProfileOutlined,
};

export const resolveModuleShowActionIcon = (
  actionId?: string | null,
  customIcon?: ReactNode,
) => {
  const normalizedActionId = String(actionId || '').trim();
  const Icon = ACTION_ICONS[normalizedActionId];
  if (Icon) return <Icon aria-hidden />;

  // برای اکشن‌های قابل‌تعریف در ماژول‌ها، آیکون اختصاصی همچنان قابل استفاده است.
  return customIcon || <AppstoreOutlined aria-hidden />;
};
