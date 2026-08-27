import React, { useCallback, useEffect, useState } from 'react';
import { Card, Skeleton, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, TeamOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import type { CampaignToolRecord } from './types';

type DispatchSummary = {
  recipient_count?: number | null;
  success_count?: number | null;
  failure_count?: number | null;
  status?: string | null;
  message_snapshot?: Record<string, unknown> | null;
};

const CampaignToolDeliverySummaryCards: React.FC<{ tool: CampaignToolRecord }> = ({ tool }) => {
  const [dispatch, setDispatch] = useState<DispatchSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await supabase
      .from('advertising_campaign_dispatches')
      .select('recipient_count,success_count,failure_count,status,message_snapshot')
      .eq('tool_id', tool.id)
      .or('message_snapshot->>is_test.is.null,message_snapshot->>is_test.neq.true')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!result.error) {
      setDispatch(result.data || null);
    }
    setLoading(false);
  }, [tool.id]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`campaign-tool-delivery-summary-${tool.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'advertising_campaign_dispatches',
        filter: `tool_id=eq.${tool.id}`,
      }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, tool.id]);

  const finalizedCount = Number((tool.config as any)?.sendable_audience_count);
  const sendable = Number.isFinite(finalizedCount)
    ? Math.max(0, finalizedCount)
    : Math.max(0, Number(dispatch?.recipient_count || 0));
  const sent = Math.max(0, Number(dispatch?.success_count || 0));
  const failed = Math.max(0, Number(dispatch?.failure_count || 0));

  if (loading) return <Skeleton active paragraph={{ rows: 1 }} />;

  const cards = [
    { key: 'sendable', label: 'شماره‌های قابل ارسال', value: sendable, icon: <TeamOutlined />, tone: 'blue' },
    { key: 'sent', label: 'ارسال‌شده', value: sent, icon: <CheckCircleOutlined />, tone: 'green' },
    { key: 'failed', label: 'ناموفق', value: failed, icon: <CloseCircleOutlined />, tone: 'red' },
  ];
  return (
    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {cards.map((item) => (
        <Card key={item.key} size="small" className="!rounded-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">{item.label}</div>
              <div className="mt-1 text-xl font-black">{toPersianNumber(item.value.toLocaleString())}</div>
            </div>
            <Tag color={item.tone} className="!m-0 !inline-flex !h-8 !w-8 !items-center !justify-center !rounded-lg !text-base">
              {item.icon}
            </Tag>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default CampaignToolDeliverySummaryCards;
