import React, { useEffect, useState } from 'react';
import { Alert, Empty, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import {
  BILLBOARD_STATUS_CHANGE_REQUEST_OPTIONS,
  BILLBOARD_STATUS_OPTIONS,
} from '../../utils/billboardStatusChanges';

type BillboardStatusHistoryTableProps = {
  billboardId: string;
};

const optionLabel = (options: readonly { value: string; label: string }[], value: unknown) =>
  options.find((item) => item.value === String(value || ''))?.label || '—';

const requestColor = (value: string) => ({
  pending_approval: 'gold',
  approved: 'green',
  rejected: 'red',
  needs_review: 'orange',
}[value] || 'default');

const BillboardStatusHistoryTable: React.FC<BillboardStatusHistoryTableProps> = ({ billboardId }) => {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void supabase
      .from('billboard_status_changes')
      .select('id,source_status,target_status,request_status,start_date,end_date,requested_at,approved_at,description,process_run_id')
      .eq('billboard_id', billboardId)
      .order('requested_at', { ascending: false })
      .limit(100)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) {
          setError('بارگذاری سوابق تغییر وضعیت ناموفق بود.');
          return;
        }
        setRows(data || []);
      })
      .then(
        () => { if (active) setLoading(false); },
        () => { if (active) setLoading(false); },
      );
    return () => { active = false; };
  }, [billboardId]);

  if (error) return <Alert type="warning" showIcon message={error} />;

  return (
    <Table
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={rows}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="هنوز تغییری ثبت نشده است." /> }}
      pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `${toPersianNumber(total)} سابقه` }}
      scroll={{ x: 720 }}
      columns={[
        {
          title: 'درخواست',
          dataIndex: 'id',
          width: 130,
          render: (value: string) => <Link to={`/billboard_status_changes/${value}`}>مشاهده جزئیات</Link>,
        },
        {
          title: 'تغییر وضعیت',
          key: 'status',
          render: (_: unknown, row: any) => (
            <span>{optionLabel(BILLBOARD_STATUS_OPTIONS, row.source_status)} ← {optionLabel(BILLBOARD_STATUS_OPTIONS, row.target_status)}</span>
          ),
        },
        {
          title: 'وضعیت درخواست',
          dataIndex: 'request_status',
          render: (value: string) => <Tag color={requestColor(value)}>{optionLabel(BILLBOARD_STATUS_CHANGE_REQUEST_OPTIONS, value)}</Tag>,
        },
        {
          title: 'بازه اکران',
          key: 'dates',
          render: (_: unknown, row: any) => row.start_date
            ? <span className="persian-number">{toPersianNumber(safeJalaliFormat(row.start_date, 'YYYY/MM/DD') || row.start_date)} تا {toPersianNumber(safeJalaliFormat(row.end_date, 'YYYY/MM/DD') || row.end_date || '—')}</span>
            : '—',
        },
        {
          title: 'فرآیند',
          dataIndex: 'process_run_id',
          render: (value: string | null) => value ? <Link to={`/process_runs/${value}`}>مشاهده فرآیند</Link> : '—',
        },
        {
          title: 'زمان ثبت',
          dataIndex: 'requested_at',
          render: (value: string) => <span className="persian-number">{toPersianNumber(safeJalaliFormat(value, 'YYYY/MM/DD HH:mm') || '—')}</span>,
        },
      ]}
    />
  );
};

export default BillboardStatusHistoryTable;
