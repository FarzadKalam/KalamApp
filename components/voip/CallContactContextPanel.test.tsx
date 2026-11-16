import React from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import CallContactContextPanel from './CallContactContextPanel';
import {readVoipContactContext} from '../../utils/voipContactContext';
vi.mock('../../utils/voipContactContext',()=>({CALL_CONTACT_SECTION_KEYS:['invoices','projects','groups'],CALL_CONTACT_SECTION_LABELS:{invoices:'فاکتورهای فروش',projects:'پروژه‌ها',groups:'گروه‌ها'},readVoipContactContext:vi.fn()}));
const id='20000000-0000-4000-8000-000000000001';
const person={moduleId:'customers',recordId:id,title:'مخاطب آزمون',phone:'09120000000'};
afterEach(()=>{cleanup();vi.clearAllMocks();});
beforeEach(()=>{
 vi.mocked(readVoipContactContext).mockImplementation(async(body)=>{
  if(body.action==='search')return {candidates:[person]};
  return {result:{section:body.section,moduleId:body.section==='invoices'?'invoices':'projects',state:'ready',count:0,rows:[]}};
 });
});
it('shows exact identity and starts the recent history without starting a call',async()=>{
 const choose=vi.fn();render(<CallContactContextPanel phone="09120000000" onChoosePhone={choose} />);
 const link=await screen.findByRole('link',{name:'مخاطب آزمون'});expect(link).toHaveAttribute('href',`/customers/${id}`);expect(link).toHaveAttribute('target','_blank');
 await waitFor(()=>expect(vi.mocked(readVoipContactContext).mock.calls.some(([body])=>body.action==='section'&&body.section==='invoices')).toBe(true));
 expect(choose).not.toHaveBeenCalled();fireEvent.click(screen.getByText('انتخاب شمارهٔ این مخاطب'));expect(choose).toHaveBeenCalledWith('09120000000');
});
it('requires explicit selection for a shared number and hides raw identifiers',async()=>{
 vi.mocked(readVoipContactContext).mockResolvedValue({candidates:[person,{...person,moduleId:'suppliers',title:'مخاطب دوم'}]});
 render(<CallContactContextPanel phone="09120000000" />);
 expect(await screen.findByText('چند مخاطب پیدا شد؛ پرونده را انتخاب کنید.')).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'مخاطب آزمون'})).not.toBeInTheDocument();
 expect(screen.queryByText(id)).not.toBeInTheDocument();
});
it('does not render stale results after the dialed number changes',async()=>{
 let resolveOld:(value:any)=>void=()=>{};
 vi.mocked(readVoipContactContext).mockImplementation(body=>body.query==='09120000000'?new Promise(resolve=>{resolveOld=resolve;}):Promise.resolve({candidates:[]}));
 const view=render(<CallContactContextPanel phone="09120000000" />);
 await waitFor(()=>expect(readVoipContactContext).toHaveBeenCalled());
 view.rerender(<CallContactContextPanel phone="09120000001" />);
 resolveOld({candidates:[person]});
 expect(await screen.findByText('مخاطبی با دسترسی مجاز پیدا نشد.')).toBeInTheDocument();
 expect(screen.queryByRole('link',{name:'مخاطب آزمون'})).not.toBeInTheDocument();
});
