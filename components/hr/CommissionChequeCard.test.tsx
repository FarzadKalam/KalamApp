import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import CommissionChequeCard from './CommissionChequeCard';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
vi.mock('../../moduleRegistry',()=>({MODULES:{cheques:{fields:[{key:'status',options:[{value:'new',label:'جدید',color:'blue'}]}]}}}));
vi.mock('../../supabaseClient',()=>({supabase:{from:()=>({select:()=>({
 limit:()=>({eq:()=>Promise.resolve({data:[{id:'cheque-record',status:'new',due_date:'2026-11-16',serial_no:'123'}],error:null})}),
 eq:()=>({maybeSingle:()=>Promise.resolve({data:{payments:[{payment_type:'cheque',cheque_id:'cheque-record',amount:500,cheque_due_date:'2026-11-16'}]},error:null})}),
})})}}));
const show=(cheque:any,invoiceId?:string)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CommissionChequeCard cheque={cheque} invoiceId={invoiceId} formatMoney={String} /></QueryClientProvider>);
afterEach(cleanup);
it('resolves a legacy cheque number and shows a Persian status, maturity and safe new-tab link',async()=>{
 show({cheque_number:'123',amount:500,cheque_status:'new'});
 const link=await screen.findByRole('link');
 expect(link).toHaveAttribute('href','/cheques/cheque-record');
 expect(link).toHaveAttribute('target','_blank');
 expect(link).toHaveAttribute('rel','noopener noreferrer');
 expect(screen.getByText('جدید')).toBeInTheDocument();
 expect(screen.getByText(/سررسید/)).toHaveTextContent('۱۴۰۵/۰۸/۲۵');
 expect(screen.queryByText('new')).toBeNull();
});
it('recovers the cheque from its invoice when a historical snapshot has no identity or maturity',async()=>{
 show({amount:500,cheque_status:'new',due_date:null,cheque_number:null},'invoice-record');
 const link=await screen.findByRole('link');
 expect(link).toHaveAttribute('href','/cheques/cheque-record');
 expect(screen.getByText(/سررسید/)).toHaveTextContent('۱۴۰۵/۰۸/۲۵');
 expect(screen.queryByText('ثبت نشده')).toBeNull();
});
