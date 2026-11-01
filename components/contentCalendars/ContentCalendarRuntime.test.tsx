import App from 'antd/es/app';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContentCalendarRuntime from './ContentCalendarRuntime';

const fixture = vi.hoisted(() => {
  const today = new Date();
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  return { date:key(today), tomorrow:key(tomorrow), onDragEnd:null as any, updates:[] as any[], mobile:false, fail:false, success:vi.fn(), error:vi.fn() };
});
vi.mock('antd', async (original) => {
  const actual: any = await original();
  return { ...actual, App: Object.assign(({children}:any)=>children, {useApp:()=>({message:{success:fixture.success,error:fixture.error}})}), Grid: { ...actual.Grid, useBreakpoint: () => ({ sm: !fixture.mobile }) } };
});
vi.mock('@dnd-kit/core', () => ({
  DndContext: (props: any) => { fixture.onDragEnd=props.onDragEnd; return props.children; },
  DragOverlay: () => null, PointerSensor: class {}, KeyboardSensor: class {},
  pointerWithin: vi.fn(), closestCenter: vi.fn(), useSensor: vi.fn(), useSensors: vi.fn(),
  useDroppable: ({id}: any) => ({ setNodeRef: (node: HTMLElement|null) => { if(node) node.dataset.dropId=id; }, isOver:false }),
  useDraggable: () => ({ setNodeRef:vi.fn(), attributes:{}, listeners:{}, isDragging:false }),
}));
vi.mock('../../utils/sessionCache', () => ({ fetchSessionBootstrap: async () => ({ orgId:'org' }) }));
vi.mock('../../utils/referenceData', () => ({ fetchAssigneeDirectory: async () => ({users:[],roles:[]}), fetchProcessTemplateRows:async()=>[] }));
vi.mock('../../utils/holidayCalendar', () => ({ getHolidaySummaryForDate:async()=>null }));
vi.mock('../../supabaseClient', () => ({ SUPABASE_URL:'https://example.test', SUPABASE_ANON_KEY:'test', supabase: {
  channel: () => { const channel:any={on:()=>channel,subscribe:()=>channel}; return channel; }, removeChannel:vi.fn(),
  from: (table: string) => {
    let patch: any=null; const filters:any[]=[];
    const query:any={ select:()=>query, eq:(...filter:any[])=>{filters.push(filter);return query;}, in:()=>query, order:()=>query, limit:()=>query,
      update:(value:any)=>{patch=value;return query;},
      single:async()=>{fixture.updates.push({table,patch,filters});return fixture.fail?{error:{message:'ذخیره انجام نشد'},data:null}:{data:{id:filters.find(([key])=>key==='id')?.[1],...patch},error:null};},
      maybeSingle:async()=>({data:{execution_process_draft:[]},error:null}),
      then:(resolve:any)=>Promise.resolve({data:table==='projects'?[{id:'project',name:'پروژه نمونه',status:'planning',due_date:`${fixture.date}T17:00:00`}]:[{id:'task',name:'فعالیت نمونه',status:'todo',due_date:`${fixture.date}T17:00:00`}],error:null}).then(resolve),
    }; return query;
  },
} }));

const renderCalendar = (canEdit=true) => render(<App><MemoryRouter><ContentCalendarRuntime calendar={{id:'calendar'}} canEdit={canEdit}/></MemoryRouter></App>);
describe('content calendar drag wiring', () => {
  afterEach(cleanup);
  beforeEach(()=>{fixture.updates=[];fixture.fail=false;fixture.mobile=false;fixture.success.mockClear();fixture.error.mockClear();});
  it('registers one visible set of day targets and moves both activities and projects', async () => {
    const {container}=renderCalendar();
    await screen.findByText('فعالیت نمونه');
    const targets=[...container.querySelectorAll('[data-drop-id]')].map(node=>node.getAttribute('data-drop-id'));
    expect(targets).toHaveLength(42);
    expect(new Set(targets).size).toBe(42);
    expect(screen.getAllByRole('button',{name:'جابجایی به روز دیگر'})).toHaveLength(2);
    for(const [index,kind] of ['task','project'].entries()) {
      await act(async()=>fixture.onDragEnd({active:{data:{current:{item:{kind,record:{id:kind,due_date:`${fixture.date}T17:00:00`}}}}},over:{id:`calendar-day:${fixture.tomorrow}`}}));
      await waitFor(()=>expect(fixture.updates).toHaveLength(index+1));
    }
    expect(fixture.updates.map(row=>row.table)).toEqual(['tasks','projects']);
    expect(fixture.updates.every(row=>row.filters.some((value:any[])=>value[0]==='org_id'&&value[1]==='org'))).toBe(true);
    expect(fixture.error).not.toHaveBeenCalled();
  });
  it('does not reserve a second calendar or render empty-day messages on mobile', async () => {
    fixture.mobile=true;
    const {container}=renderCalendar(false);
    await screen.findByText('فعالیت نمونه');
    await waitFor(()=>expect(container.querySelectorAll('[data-drop-id]').length).toBeLessThan(33));
    expect(screen.queryByText('رکوردی در این روز ثبت نشده است.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'جابجایی به روز دیگر'})).not.toBeInTheDocument();
    expect(screen.getByText('برنامه‌ریزی')).toBeVisible();
  });
  it('shows a save error and never reports success if a drop is rejected', async () => {
    fixture.fail=true;
    renderCalendar();
    await screen.findByText('فعالیت نمونه');
    await act(async()=>fixture.onDragEnd({active:{data:{current:{item:{kind:'task',record:{id:'task',due_date:`${fixture.date}T17:00:00`}}}}},over:{id:`calendar-day:${fixture.tomorrow}`}}));
    await waitFor(()=>expect(fixture.error).toHaveBeenCalled());
    expect(fixture.success).not.toHaveBeenCalled();
  });
});
