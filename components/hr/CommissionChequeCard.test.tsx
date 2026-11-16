import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import CommissionChequeCard from './CommissionChequeCard';
vi.mock('../../moduleRegistry',()=>({MODULES:{cheques:{fields:[{key:'status',options:[{value:'new',label:'جدید',color:'blue'}]}]}}}));
vi.mock('../../supabaseClient',()=>({supabase:{from:()=>({select:()=>({limit:()=>({eq:()=>Promise.resolve({data:[{id:'cheque-record',status:'new',due_date:'2026-11-16',serial_no:'123'}],error:null})})})})}}));
afterEach(cleanup);
it('resolves a legacy cheque number and shows a Persian status, maturity and safe new-tab link',async()=>{
 render(<CommissionChequeCard cheque={{cheque_number:'123',amount:500,cheque_status:'new'}} formatMoney={String} />);
 const link=await screen.findByRole('link');
 expect(link).toHaveAttribute('href','/cheques/cheque-record');
 expect(link).toHaveAttribute('target','_blank');
 expect(link).toHaveAttribute('rel','noopener noreferrer');
 expect(screen.getByText('جدید')).toBeInTheDocument();
 expect(screen.getByText(/سررسید/)).toHaveTextContent('۱۴۰۵/۰۸/۲۵');
 expect(screen.queryByText('new')).toBeNull();
});
