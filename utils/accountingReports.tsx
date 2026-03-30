import type { ComponentType } from 'react';
import {
  BookOutlined,
  FundProjectionScreenOutlined,
  NodeIndexOutlined,
  ProfileOutlined,
} from '@ant-design/icons';

export type AccountingReportParamType = 'date' | 'account';

export interface AccountingReportParamDefinition {
  key: string;
  label: string;
  type: AccountingReportParamType;
  required?: boolean;
  defaultValue?: 'today' | 'first_day_of_month' | null;
  placeholder?: string;
}

export type AccountingReportRenderer =
  | 'linked_page'
  | 'journal_book'
  | 'general_ledger'
  | 'subsidiary_ledger'
  | 'account_turnover'
  | 'trial_balance';

export interface AccountingReportDefinition {
  key: string;
  title: string;
  description: string;
  group: 'دفاتر' | 'ترازها' | 'مرور';
  renderer: AccountingReportRenderer;
  icon: ComponentType<any>;
  path?: string;
  params: AccountingReportParamDefinition[];
  exportable?: boolean;
  printable?: boolean;
}

export const ACCOUNTING_REPORTS: AccountingReportDefinition[] = [
  {
    key: 'account_review',
    title: 'مرور حساب ها',
    description: 'نمای تحلیلی حساب ها با انتخاب سطوح حساب و بازه زمانی.',
    group: 'مرور',
    renderer: 'linked_page',
    icon: NodeIndexOutlined,
    path: '/accounting/account-review',
    params: [],
    exportable: false,
    printable: false,
  },
  {
    key: 'journal_book',
    title: 'دفتر روزنامه',
    description: 'نمای ردیف های ثبت شده اسناد حسابداری در بازه زمانی انتخابی.',
    group: 'دفاتر',
    renderer: 'journal_book',
    icon: ProfileOutlined,
    params: [
      { key: 'date_from', label: 'از تاریخ', type: 'date', required: true, defaultValue: 'first_day_of_month' },
      { key: 'date_to', label: 'تا تاریخ', type: 'date', required: true, defaultValue: 'today' },
    ],
    exportable: true,
    printable: true,
  },
  {
    key: 'general_ledger',
    title: 'دفتر کل',
    description: 'گردش سطرهای ثبت شده به تفکیک حساب با مانده ابتدای دوره و مانده تجمعی.',
    group: 'دفاتر',
    renderer: 'general_ledger',
    icon: BookOutlined,
    params: [
      { key: 'date_from', label: 'از تاریخ', type: 'date', required: true, defaultValue: 'first_day_of_month' },
      { key: 'date_to', label: 'تا تاریخ', type: 'date', required: true, defaultValue: 'today' },
      { key: 'account_id', label: 'حساب', type: 'account', placeholder: 'همه حساب ها' },
    ],
    exportable: true,
    printable: true,
  },
  {
    key: 'subsidiary_ledger',
    title: 'دفتر معین',
    description: 'گردش یک حساب انتخابی همراه با مانده ابتدای دوره و مانده پس از هر سطر.',
    group: 'دفاتر',
    renderer: 'subsidiary_ledger',
    icon: BookOutlined,
    params: [
      { key: 'date_from', label: 'از تاریخ', type: 'date', required: true, defaultValue: 'first_day_of_month' },
      { key: 'date_to', label: 'تا تاریخ', type: 'date', required: true, defaultValue: 'today' },
      { key: 'account_id', label: 'حساب', type: 'account', required: true, placeholder: 'انتخاب حساب' },
    ],
    exportable: true,
    printable: true,
  },
  {
    key: 'account_turnover',
    title: 'گردش حساب',
    description: 'خلاصه مانده ابتدای دوره، گردش بدهکار و بستانکار و مانده پایان برای یک حساب.',
    group: 'مرور',
    renderer: 'account_turnover',
    icon: NodeIndexOutlined,
    params: [
      { key: 'date_from', label: 'از تاریخ', type: 'date', required: true, defaultValue: 'first_day_of_month' },
      { key: 'date_to', label: 'تا تاریخ', type: 'date', required: true, defaultValue: 'today' },
      { key: 'account_id', label: 'حساب', type: 'account', required: true, placeholder: 'انتخاب حساب' },
    ],
    exportable: true,
    printable: true,
  },
  {
    key: 'trial_balance',
    title: 'تراز آزمایشی',
    description: 'مانده ابتدای دوره، گردش بدهکار و بستانکار و مانده پایان حساب ها.',
    group: 'ترازها',
    renderer: 'trial_balance',
    icon: FundProjectionScreenOutlined,
    params: [
      { key: 'date_from', label: 'از تاریخ', type: 'date', required: true, defaultValue: 'first_day_of_month' },
      { key: 'date_to', label: 'تا تاریخ', type: 'date', required: true, defaultValue: 'today' },
    ],
    exportable: true,
    printable: true,
  },
];

export const ACCOUNTING_REPORT_GROUPS: Array<AccountingReportDefinition['group']> = [
  'مرور',
  'دفاتر',
  'ترازها',
];

export const getAccountingReportByKey = (reportKey?: string | null) =>
  ACCOUNTING_REPORTS.find((report) => report.key === reportKey) || null;

export const getAccountingReportPath = (report: AccountingReportDefinition) =>
  report.path || `/accounting/reports/${report.key}`;
