import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const fixtures = vi.hoisted(() => ({ access:{ orgId:'org-a',userId:'user-a',roleId:'role-a',permissions:{tasks:{view:true,edit:true}} }, queries:[] as any[], selects:[] as string[], lockRequests:[] as any[], fail:false, lockFail:false }));
vi.mock('react-router-dom', () => ({ useNavigate:()=>vi.fn() }));
vi.mock('../../supabaseClient', () => ({supabase:{from:vi.fn()}}));
vi.mock('../../moduleRegistry',()=>({MODULES:{tasks:{fields:[]}}}));
vi.mock('../../utils/permissions',()=>({fetchCurrentUserRecordAccessContext:async()=>fixtures.access}));
vi.mock('../../utils/selectCompat',()=>({runSelectWithCompatibleColumns:async({execute,columns}:any)=>{
  const filters:any={};const chain:any={eq:(key:string,value:any)=>{filters[key]=value;return chain;},or:()=>chain,not:()=>chain,order:()=>chain,range:(from:number,to:number)=>{
    fixtures.queries.push({...filters,from,to});
    return {data:Array.from({length:12},(_,index)=>({id:`task-${index}`,name:`فعالیت ${index}`,status:'todo'})).slice(from,to+1),error:fixtures.fail?{message:'دریافت ناموفق'}:null};
  }};
  const {supabase}=await import('../../supabaseClient');
  (supabase.from as any).mockReturnValue({select:(select:string)=>{
    fixtures.selects.push(select);
    if (select.split(',').some(key=>['is_locked','locked_at','locked_by'].includes(key))) throw new Error('tasks does not contain record lock metadata');
    return chain;
  }});return execute(columns.join(','));
}}));
vi.mock('../../utils/recordLockRuntime',async(importOriginal)=>({
  ...await importOriginal<any>(),
  fetchRecordLockMap:async(moduleId:string,ids:string[],options:any)=>{
    fixtures.lockRequests.push({moduleId,ids,options});
    if(fixtures.lockFail)throw new Error('خواندن وضعیت قفل انجام نشد.');
    return new Map(ids.includes('task-0')?[['task-0',{isLocked:true,lockedBy:'user-b',moduleId:'tasks'}]]:[]);
  },
}));
vi.mock('../tasks/TaskNotificationListRow',()=>({default:({task,readOnly}:any)=><article data-readonly={readOnly} data-locked={task.is_locked}>{task.name}</article>}));
vi.mock('./DashboardWidgetFrame',()=>({default:({children}:any)=><section>{children}</section>}));
beforeEach(()=>{fixtures.queries=[];fixtures.selects=[];fixtures.lockRequests=[];fixtures.fail=false;fixtures.lockFail=false;});
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
    expect(screen.getByText('فعالیت 0')).toHaveAttribute('data-locked','true');
    expect(screen.getByText('فعالیت 1')).toHaveAttribute('data-locked','false');
    expect(fixtures.selects.every(select=>!select.split(',').some(key=>['is_locked','locked_at','locked_by'].includes(key)))).toBe(true);
    expect(fixtures.lockRequests.map(request=>request.ids.length)).toEqual([8,4]);
    expect(fixtures.lockRequests[0]).toMatchObject({moduleId:'tasks',options:{forceRefresh:true,throwOnError:true}});
  });
  it('preserves the current page when loading more fails',async()=>{
    render(<MyTasksWidget orgId="org-a"/>);await screen.findByText('فعالیت 0');fixtures.fail=true;
    fireEvent.click(screen.getByText('مشاهده بیشتر…'));
    await waitFor(()=>expect(screen.getByText('فعالیت 0')).toBeInTheDocument());
    await screen.findByRole('alert');
    expect(screen.queryByText('فعالیت 8')).toBeNull();
  });
  it('shows a lock lookup error instead of rendering tasks as unlocked',async()=>{
    fixtures.lockFail=true;
    render(<MyTasksWidget orgId="org-a"/>);
    await screen.findByRole('alert');
    expect(screen.queryByText('فعالیت 0')).toBeNull();
  });
});
import MyTasksWidget from './MyTasksWidget';
