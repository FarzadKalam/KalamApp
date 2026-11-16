import React from 'react';
import {render,screen,cleanup,fireEvent,waitFor} from '@testing-library/react';
import {Form} from 'antd';
import {afterEach,it,expect,vi} from 'vitest';
import VoipConnectionSettings from './VoipConnectionSettings';
vi.mock('../AdaptiveSelectField',()=>({default:({value,onChange,options}:any)=><select value={value} onChange={event=>onChange?.(event.target.value)}>{options.map((option:any)=><option key={option.value} value={option.value}>{option.label}</option>)}</select>}));
afterEach(cleanup);
function Fixture({mode='reports',source='external'}:{mode?:string;source?:string}){
 const [form]=Form.useForm();
 return <Form form={form} initialValues={{voip:{provider:'telefonchy',usage_mode:mode,browser_source:source,webservice_token:'fixture-token',service_id:'fixture-service'}}}>
  <VoipConnectionSettings form={form} voipWebhookUrl="https://example.test/webhook" copyValue={()=>{}} testing={false} syncing={false} syncInfo={null} onTest={()=>{}} onSync={()=>{}} />
 </Form>;
}
it('reports-only hides browser credentials and cloud PBX administration',async()=>{
 render(<Fixture />);
 expect(await screen.findByText('بررسی اتصال گزارش‌ها (API)')).toBeInTheDocument();
 expect(screen.queryByText('آدرس کامل وب‌سوکت امن سرویس‌دهنده (WSS)')).toBeNull();
 expect(screen.queryByText('ایجاد داخلی جدید')).toBeNull();
});
it('enables browser settings while preserving API token and service ID across mode changes',async()=>{
 render(<Fixture />);
 fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'browser'}});
 fireEvent.click(await screen.findByText('تنظیمات اختیاری WebRTC مستقیم سرویس‌دهنده'));
 expect(await screen.findByText('آدرس کامل وب‌سوکت امن سرویس‌دهنده (WSS)')).toBeInTheDocument();
 expect(screen.getByDisplayValue('fixture-token')).toBeInTheDocument();
 expect(screen.getByDisplayValue('fixture-service')).toBeInTheDocument();
 fireEvent.change(screen.getAllByRole('combobox')[0],{target:{value:'reports'}});
 await waitFor(()=>expect(screen.queryByText('آدرس کامل وب‌سوکت امن سرویس‌دهنده (WSS)')).toBeNull());
 expect(screen.getByDisplayValue('fixture-token')).toBeInTheDocument();
});
it('development source is clearly labelled and reports remain available',async()=>{
 render(<Fixture mode="browser" source="taze_pbx" />);
 expect(await screen.findByText('مرکز تلفن ابری تازه‌سیستم در حال توسعه است')).toBeInTheDocument();
 expect(screen.getByText('بررسی اتصال گزارش‌ها (API)')).toBeInTheDocument();
 expect(screen.queryByText('ایجاد داخلی جدید')).toBeNull();
});
