import React from 'react';
import {
  CopyOutlined,
  EditOutlined,
  FileTextOutlined,
  ForwardOutlined,
  LinkOutlined,
  LockOutlined,
  MailOutlined,
  MessageOutlined,
  NodeIndexOutlined,
  NotificationOutlined,
  PlayCircleOutlined,
  PlusSquareOutlined,
  RobotOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { WorkflowActionType } from '../../../utils/workflowTypes';

type ActionVisual = {
  icon: React.ReactNode;
  accentColor: string;
};

const ACTION_VISUALS: Partial<Record<WorkflowActionType, ActionVisual>> = {
  send_note: { icon: <FileTextOutlined />, accentColor: '#0ea5e9' },
  send_note_sms: { icon: <FileTextOutlined />, accentColor: '#0284c7' },
  send_web_form_link: { icon: <LinkOutlined />, accentColor: '#14b8a6' },
  send_sms: { icon: <MessageOutlined />, accentColor: '#22c55e' },
  send_email: { icon: <MailOutlined />, accentColor: '#f97316' },
  run_ai_prompt: { icon: <RobotOutlined />, accentColor: '#8b5cf6' },
  send_bot_message: { icon: <SendOutlined />, accentColor: '#3b82f6' },
  send_telegram_bot: { icon: <SendOutlined />, accentColor: '#64748b' },
  send_bale_bot: { icon: <SendOutlined />, accentColor: '#64748b' },
  send_rubika_bot: { icon: <SendOutlined />, accentColor: '#64748b' },
  update_record: { icon: <EditOutlined />, accentColor: '#eab308' },
  lock_record: { icon: <LockOutlined />, accentColor: '#dc2626' },
  send_to_next_stages: { icon: <ForwardOutlined />, accentColor: '#06b6d4' },
  send_to_specific_stage: { icon: <ForwardOutlined />, accentColor: '#0891b2' },
  create_standalone_record: { icon: <PlusSquareOutlined />, accentColor: '#84cc16' },
  create_related_record: { icon: <NodeIndexOutlined />, accentColor: '#10b981' },
  copy_process_template: { icon: <CopyOutlined />, accentColor: '#a855f7' },
  execute_process: { icon: <PlayCircleOutlined />, accentColor: '#ec4899' },
  activate_next_process_stage: { icon: <PlayCircleOutlined />, accentColor: '#0ea5e9' },
  activate_specific_process_stage: { icon: <PlayCircleOutlined />, accentColor: '#0284c7' },
  publish_story: { icon: <NotificationOutlined />, accentColor: '#f43f5e' },
};

const DEFAULT_ACTION_VISUAL: ActionVisual = {
  icon: <PlayCircleOutlined />,
  accentColor: '#94a3b8',
};

export const getActionVisual = (type: WorkflowActionType | string): ActionVisual =>
  ACTION_VISUALS[String(type || '').trim() as WorkflowActionType] || DEFAULT_ACTION_VISUAL;
