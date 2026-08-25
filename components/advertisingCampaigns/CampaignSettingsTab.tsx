import React from 'react';
import { Alert, Empty } from 'antd';
import CampaignToolBlock from './CampaignToolBlock';
import type { CampaignToolRecord } from './types';

type Props = {
  campaignId?: string | null;
  tools: CampaignToolRecord[];
  onToolChange: (toolId: string, patch: Partial<CampaignToolRecord>) => void;
  disabled?: boolean;
};

const CampaignSettingsTab: React.FC<Props> = ({ campaignId, tools, onToolChange, disabled }) => {
  if (!campaignId) return <Alert type="info" showIcon message="ابتدا نام و ابزارهای کمپین را در تب مشخصات ذخیره کنید؛ سپس تنظیمات اختصاصی هر ابزار در اینجا ساخته می‌شود." />;
  if (!tools.length) return <Empty description="ابزاری برای این کمپین انتخاب نشده است" />;
  return (
    <div className="space-y-3 pb-4">
      <Alert type="info" showIcon message="برای سبک ماندن صفحه، محتوای هر ابزار فقط هنگام بازکردن همان بلاک بارگذاری و رندر می‌شود." />
      {tools.map((tool, index) => (
        <CampaignToolBlock key={tool.id || tool.tool_type} tool={tool} onChange={(patch) => onToolChange(tool.id, patch)} disabled={disabled} initiallyOpen={index === 0} />
      ))}
    </div>
  );
};

export default CampaignSettingsTab;
