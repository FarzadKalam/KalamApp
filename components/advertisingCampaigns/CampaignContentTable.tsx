import React from 'react';
import EditableTable from '../EditableTable';
import { FieldType } from '../../types';
import type { CampaignContentItem } from './types';

type CampaignContentTableProps = {
  value?: CampaignContentItem[];
  onChange: (rows: CampaignContentItem[]) => void;
  moduleId?: string;
  recordId?: string;
  variant?: 'instagram' | 'advertising' | 'generic';
  readOnly?: boolean;
};

const buildColumns = (variant: CampaignContentTableProps['variant']) => {
  const base = [
    { key: 'title', title: 'عنوان رسانه', type: FieldType.TEXT, width: 180 },
    {
      key: 'content_type', title: 'نوع محتوا', type: FieldType.SELECT, width: 130,
      options: variant === 'instagram'
        ? [{ label: 'پست', value: 'post' }, { label: 'ریلز', value: 'reel' }, { label: 'استوری', value: 'story' }]
        : [{ label: 'تصویر', value: 'image' }, { label: 'ویدئو', value: 'video' }, { label: 'متن', value: 'text' }, { label: 'بنر', value: 'banner' }],
    },
    { key: 'media_url', title: 'تصویر / فایل اصلی', type: FieldType.IMAGE, width: 150 },
    { key: 'caption', title: variant === 'instagram' ? 'کپشن' : 'متن و توضیحات', type: FieldType.LONG_TEXT, width: 260 },
    { key: 'destination_url', title: 'لینک مقصد', type: FieldType.LINK, width: 190 },
    { key: 'planned_at', title: 'زمان برنامه‌ریزی‌شده', type: FieldType.DATETIME, width: 180 },
    { key: 'published_at', title: 'زمان انتشار واقعی', type: FieldType.DATETIME, width: 180 },
    {
      key: 'status', title: 'وضعیت', type: FieldType.STATUS, width: 140, defaultValue: 'draft',
      options: [
        { label: 'پیش‌نویس', value: 'draft' }, { label: 'در حال تولید', value: 'producing' },
        { label: 'در انتظار تأیید', value: 'review' }, { label: 'تأییدشده', value: 'approved' },
        { label: 'منتشرشده', value: 'published' }, { label: 'لغوشده', value: 'canceled' },
      ],
    },
    { key: 'estimated_cost', title: 'هزینه برآوردی', type: FieldType.PRICE, width: 150 },
    { key: 'actual_cost', title: 'هزینه واقعی', type: FieldType.PRICE, width: 150 },
  ];
  return base;
};

const CampaignContentTable: React.FC<CampaignContentTableProps> = ({
  value = [],
  onChange,
  moduleId = 'advertising_campaign_tools',
  recordId,
  variant = 'generic',
  readOnly,
}) => (
  <EditableTable
    block={{
      id: `campaign_content_${variant}`,
      titles: { fa: variant === 'instagram' ? 'پست‌ها و رسانه‌ها' : 'خروجی‌ها و رسانه‌های تبلیغاتی' },
      tableColumns: buildColumns(variant),
    }}
    initialData={Array.isArray(value) ? value : []}
    moduleId={moduleId}
    recordId={recordId}
    relationOptions={{}}
    dynamicOptions={{}}
    mode="local"
    onChange={(rows) => onChange(rows as CampaignContentItem[])}
    readOnly={readOnly}
  />
);

export default CampaignContentTable;
