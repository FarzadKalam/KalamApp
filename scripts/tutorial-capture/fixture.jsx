import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, ConfigProvider, Button } from 'antd';
import faIR from 'antd/locale/fa_IR';
import { MemoryRouter } from 'react-router-dom';
import '../../index.css';
import '../../initDayjs';
import { MODULES } from '../../moduleRegistry';
import SmartForm from '../../components/SmartForm';
import SmartTableRenderer from '../../components/SmartTableRenderer';
import ContextualTutorialButton from '../../components/cms/ContextualTutorialButton';
import DemoDataCard from '../../components/saas/DemoDataCard';
import ReportBuilderPage from '../../pages/ReportBuilderPage';
import ReportsHubPage from '../../pages/ReportsHubPage';
import AiChatPage from '../../pages/AiChatPage';
import WorkflowsManager from '../../components/workflows/WorkflowsManager';

const params = new URLSearchParams(location.search);
const id = params.get('module') || 'customers';
const mode = params.get('mode') || 'list';
const module = MODULES[id];
const records = [
  { id: '10000000-0000-4000-8000-000000000011', name: 'فروشگاه آینده', full_name: 'علی مرادی', first_name: 'علی', last_name: 'مرادی', business_name: 'فروشگاه آینده', system_code: 'نمونه ۱', status: module?.fields.find(f => f.key === 'status')?.options?.[0]?.value || 'active', product_type: 'goods', sale_price: 1200000, purchase_price: 850000, invoice_date: '2026-10-17', expense_date: '2026-10-17', total_invoice_amount: 116297500, total_received_amount: 45000000, remaining_balance: 71297500, total_amount: 250000, remaining_amount: 250000, department: 'فروش', job_title: 'کارشناس فروش', employment_status: 'active', priority: 'high', description: 'نمونه آموزشی برای تمرین مسیر کار', start_at: '2026-10-19T07:00:00Z', end_at: '2026-10-19T08:00:00Z' },
  { id: '10000000-0000-4000-8000-000000000012', name: 'شرکت آفتاب', full_name: 'سارا نادری', first_name: 'سارا', last_name: 'نادری', business_name: 'شرکت آفتاب', system_code: 'نمونه ۲', status: module?.fields.find(f => f.key === 'status')?.options?.[1]?.value || 'active', product_type: 'service', sale_price: 18500000, invoice_date: '2026-10-16', total_invoice_amount: 35000000, department: 'پشتیبانی', employment_status: 'active', priority: 'medium' },
];
const names = {
  products: ['بسته لوازم اداری نمونه', 'خدمت راه‌اندازی نمونه'], price_lists: ['قیمت همکاری نمونه','قیمت عمومی نمونه'],
  invoices: ['فاکتور فروش فروشگاه آینده','فاکتور فروش شرکت آفتاب'], purchase_invoices: ['خرید موجودی اولیه','خرید بسته‌های اداری'],
  projects: ['راه‌اندازی فروشگاه آینده','آماده‌سازی شعبه آفتاب'], process_templates: ['اجرای پروژه مشتری','پیگیری فروش'],
  reservations: ['جلسه نیازسنجی مشتری','جلسه تحویل پروژه'], expense_documents: ['هزینه ارسال سفارش','هزینه بسته‌بندی'],
  marketing_leads: ['درخواست مشاوره فروشگاه آینده','درخواست معرفی خدمات'], tasks: ['تماس نیازسنجی مشتری','آماده‌سازی پیشنهاد'],
};
if(names[id]) records.forEach((r,i) => r.name = names[id][i]);
const columns = module?.fields.filter(f => f.isTableColumn && !['image_url','tags','process_run_id','execution_process_draft','assignee_id'].includes(f.key)).slice(0,7).map(f=>f.key);
const content = id === 'demo' ? <DemoDataCard /> : id === 'reports' ? mode === 'form' ? <ReportBuilderPage/> : <ReportsHubPage/> : id === 'ai' ? <AiChatPage/> : id === 'workflows' ? <WorkflowsManager inline context="settings"/> : mode === 'form' ? <SmartForm module={module} visible displayMode="embedded" initialValues={records[0]} onCancel={()=>{}}/> : <>
  <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-black">{module.titles.fa}</h1><div className="flex gap-2"><ContextualTutorialButton contexts={['module:'+id]}/><Button type="primary">افزودن</Button></div></div>
  <SmartTableRenderer moduleConfig={module} data={records} loading={false} visibleColumns={columns} pagination={{pageSize:10,total:2}} />
</>;
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/'+id+(mode==='form'?'/create':'')]}><ConfigProvider direction="rtl" locale={faIR} theme={{token:{fontFamily:'Peyda, Tahoma, sans-serif',colorPrimary:'#0f766e'}}}><App><div style={{background:'#f4f6f8',minHeight:'100vh',fontFamily:'Peyda, Tahoma, sans-serif'}}><div style={{background:'#fff',borderBottom:'1px solid #e5e7eb',padding:'18px 32px',display:'flex',justifyContent:'space-between'}}><strong>تازه سیستم · راهنمای کاربردی</strong><span style={{color:'#64748b'}}>محیط آموزشی با داده‌های ساختگی</span></div><main style={{maxWidth:1240,margin:'24px auto',background:'white',borderRadius:20,padding:24}}>{content}</main></div></App></ConfigProvider></MemoryRouter>);
