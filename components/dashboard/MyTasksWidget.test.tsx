import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ access:{ orgId:'org-a',userId:'user-a',roleId:'role-a',permissions:{tasks:{view:true,edit:true}} }, queries:[] as any[], fail:false }));
vi.mock('react-router-dom', () => ({ useNavigate:()=>vi.fn() }));
vi.mock('../../supabaseClient', () => ({supabase:{from:vi.fn()}}));
vi.mock('../../moduleRegistry',()=>({MODULES:{tasks:{fields:[]}}}));
vi.mock('../../utils/permissions',()=>({fetchCurrentUserRecordAccessContext:async()=>fixtures.access}));
vi.mock('../../utils/selectCompat',()=>({runSelectWithCompatibleColumns:async({execute}:any)=>{
  const filters:any={};const chain:any={eq:(key:string,value:any)=>{filters[key]=value;return chain;},or:()=>chain,not:()=>chain,order:()=>chain,range:(from:number,to:number)=>{
    fixtures.queries.push({...filters,from,to});
    return {data:Array.from({length:12},(_,index)=>({id:`task-${index}`,name:`فعالیت ${index}`,status:'todo'})).slice(from,to+1),error:fixtures.fail?{message:'دریافت ناموفق'}:null};
  }};
  const {supabase}=await import('../../supabaseClient');
  (supabase.from as any).mockReturnValue({select:()=>chain});return execute('id,name,status');
}}));
vi.mock('../tasks/TaskNotificationListRow',()=>({default:({task,readOnly}:any)=><article data-readonly={readOnly}>{task.name}</article>}));
vi.mock('./DashboardWidgetFrame',()=>({default:({children}:any)=><section>{children}</section>}));
beforeEach(()=>{fixtures.queries=[];fixtures.fail=false;});
afterEach(()=>cleanup());
describe('assigned task pagination',()=>{
  it('loads a bounded organization-scoped page, then appends the next page without losing earlier tasks',async()=>{
    render(<MyTasksWidget orgId="org-a"/>);
    await screen.findByText('فعالیت 0');
    expect(screen.queryByText('فعالیت 8')).toBeNull();
    fireEvent.click(screen.getByText('مشاهده بیشتر…'));
    await screen.findByText('فعالیت 11');
    expect(screen.getByText('فعالیت 0')).toBeInTheDocument();
    expect(fixtures.queries).toEqual([{org_id:'org-a',from:0,to:8},{org_id:'org-a',from:8,to:16}]);
    expect(screen.queryByText('مشاهده بیشتر…')).toBeNull();
  });
  it('preserves the current page when loading more fails',async()=>{
    render(<MyTasksWidget orgId="org-a"/>);await screen.findByText('فعالیت 0');fixtures.fail=true;
    fireEvent.click(screen.getByText('مشاهده بیشتر…'));
    await waitFor(()=>expect(screen.getByText('فعالیت 0')).toBeInTheDocument());
    await screen.findByRole('alert');
    expect(screen.queryByText('فعالیت 8')).toBeNull();
  });
});
import MyTasksWidget from './MyTasksWidget';
