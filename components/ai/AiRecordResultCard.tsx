import { CheckCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import { getRecordTitle } from '../../utils/recordTitle';

/** Durable execution receipt for every module, in the approval surface. */
export default function AiRecordResultCard({ metadata }: { metadata: any }) {
  const results = [
    ...(Array.isArray(metadata?.created_records) ? metadata.created_records.map((record: any) => ({ ...record, verb: 'ثبت شد' })) : []),
    ...(Array.isArray(metadata?.updated_records) ? metadata.updated_records.map((record: any) => ({ ...record, verb: 'ویرایش شد' })) : []),
  ].filter((record: any) => record.id && MODULES[record.module_id]);
  if (!results.length) return null;
  return <div className="ai-approval-section mt-2 rounded-xl border border-[var(--ai-chat-line,#dfe2e5)] bg-[var(--ai-chat-surface,#fff)] p-3 dark:border-white/10 dark:bg-white/[0.045]" aria-label="نتیجهٔ ثبت و ویرایش">
    <div className="mb-2 flex items-center gap-2 font-semibold"><CheckCircleOutlined className="text-emerald-600 dark:text-emerald-400" />ذخیره شد</div>
    <ul className="m-0 list-none space-y-2 p-0">{results.map((record: any) => <li key={`${record.module_id}:${record.id}`}>
      <Link className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 hover:bg-black/5 focus-visible:outline focus-visible:outline-2 dark:hover:bg-white/5" to={`/${record.module_id}/${record.id}`}>
        <span className="min-w-0 break-words">{getRecordTitle({ title: record.title }, undefined, { fallback: 'مشاهدهٔ رکورد' })}<small className="mr-2 opacity-70">{record.verb}</small></span><LinkOutlined aria-hidden />
      </Link>
      {(metadata.attachment_results || []).filter((file: any) => file.record_id === record.id).map((file: any, index: number) => <div key={index} className={`px-2 py-1 text-xs ${file.success ? 'opacity-70' : 'text-amber-700 dark:text-amber-300'}`}>{file.name}: {file.success ? 'پیوست شد' : file.message || 'اتصال انجام نشد'}</div>)}
    </li>)}</ul>
  </div>;
}
