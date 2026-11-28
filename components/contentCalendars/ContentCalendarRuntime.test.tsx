import App from 'antd/es/app';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContentCalendarRuntime from './ContentCalendarRuntime';
import { OPEN_TASK_PROCESS_MODAL_EVENT } from '../../utils/taskProcessModalEvents';

const fixture = vi.hoisted(() => {
  const today = new Date();
  const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1);
  return {
    date:key(today), tomorrow:key(tomorrow), onDragEnd:null as any, updates:[] as any[], mobile:false,
    fail:false, success:vi.fn(), error:vi.fn(), drafts:[] as Record<string, any>[],
    runtimeSave:vi.fn(), rejectDraftWrite:false, concurrentDraft:null as Record<string, any> | null,
  };
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
vi.mock('../../utils/referenceData', () => ({
  fetchAssigneeDirectory: async () => ({users:[],roles:[]}),
  fetchProcessTemplateRows: async () => [{ id:'template', name:'الگوی انتشار', module_ids:['content_calendars'] }],
}));
vi.mock('../../utils/processTemplateStages', () => ({
  loadProcessTemplateStages: async () => [
    { id:'prepare', stage_name:'آماده‌سازی', sort_order:10 },
    { id:'publish', stage_name:'انتشار', sort_order:20 },
  ],
}));
vi.mock('../../utils/processRunRuntime', async (original) => ({
  ...await original<typeof import('../../utils/processRunRuntime')>(),
  ensureProcessRunForDraftStageGroup: async () => ({ processRunId:'run', processRunStageId:'run-stage', stageMap:new Map() }),
  resolveProcessRunStageId: () => 'run-stage',
}));
vi.mock('../../utils/processV2DraftStagePersistence', () => ({
  saveProcessV2DraftStage: fixture.runtimeSave,
}));
vi.mock('../../utils/holidayCalendar', () => ({ getHolidaySummaryForDate:async()=>null }));
vi.mock('../../supabaseClient', () => ({ SUPABASE_URL:'https://example.test', SUPABASE_ANON_KEY:'test', supabase: {
  channel: () => { const channel:any={on:()=>channel,subscribe:()=>channel}; return channel; }, removeChannel:vi.fn(),
  from: (table: string) => {
    let patch: any=null; const filters:any[]=[];
    const query:any={ select:()=>query, eq:(...filter:any[])=>{filters.push(filter);return query;}, in:()=>query, order:()=>query, limit:()=>query,
      update:(value:any)=>{patch=value;return query;},
      single:async()=>{fixture.updates.push({table,patch,filters});return fixture.fail?{error:{message:'ذخیره انجام نشد'},data:null}:{data:{id:filters.find(([key])=>key==='id')?.[1],...patch},error:null};},
      maybeSingle:async()=>{
        if (!patch) return {data:{execution_process_draft:fixture.drafts,updated_at:'revision'},error:null};
        fixture.updates.push({table,patch,filters});
        if (fixture.rejectDraftWrite) return {data:null,error:null};
        if (fixture.concurrentDraft) {
          fixture.drafts = [...fixture.drafts, fixture.concurrentDraft];
          fixture.concurrentDraft = null;
          return {data:null,error:null};
        }
        fixture.drafts = patch.execution_process_draft;
        return {data:{id:'calendar'},error:null};
      },
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

describe('saving a content calendar draft from a process template', () => {
  let draftModal: any;
  const onDraftModal = (event: Event) => { draftModal = (event as CustomEvent).detail.draftModal; };

  beforeEach(() => {
    fixture.updates = [];
    fixture.drafts = [];
    fixture.mobile = false;
    fixture.rejectDraftWrite = false;
    fixture.concurrentDraft = null;
    fixture.runtimeSave.mockReset();
    draftModal = null;
    window.addEventListener(OPEN_TASK_PROCESS_MODAL_EVENT, onDraftModal);
  });
  afterEach(() => {
    window.removeEventListener(OPEN_TASK_PROCESS_MODAL_EVENT, onDraftModal);
    cleanup();
  });

  const openTemplateDraft = async (container: HTMLElement) => {
    await screen.findByText('فعالیت نمونه');
    const day = container.querySelector(`[data-calendar-day="${fixture.date}"]`) as HTMLElement;
    fireEvent.click(within(day).getByRole('button', { name:'افزودن به این روز' }));
    fireEvent.click(await screen.findByText('ایجاد فعالیت از الگو'));
    const pick = async (placeholder: string, option: string) => {
      const select = (await screen.findByText(placeholder)).closest('.ant-select') as HTMLElement;
      fireEvent.mouseDown(within(select).getByRole('combobox'));
      fireEvent.click(await screen.findByTitle(option));
    };
    await pick('انتخاب الگوی فرآیند', 'الگوی انتشار');
    await pick('انتخاب مرحله', 'انتشار');
    fireEvent.click(screen.getByRole('button', { name:'باز کردن پیش‌نویس مرحله' }));
    await waitFor(() => expect(draftModal).toBeTruthy());
    return day;
  };

  it('saves only the selected stage, preserves another draft, and displays the saved card after reopening', async () => {
    fixture.concurrentDraft = {
      id:'other-draft', template_stage_id:'publish', process_group_id:'other-group',
      name:'پیش‌نویس دیگر', start_date:`${fixture.date}T10:00:00`,
    };
    const { container, unmount } = renderCalendar();
    const day = await openTemplateDraft(container);
    expect(fixture.drafts).toHaveLength(0);

    await act(async () => draftModal.onSaveDraftActivity({
      name:'انتشار نسخهٔ ویرایش‌شده', stage_name:'انتشار نسخهٔ ویرایش‌شده',
      start_date:null, due_date:null, metadata:{ description:'متن ویرایش‌شده' },
    }));
    expect(await within(day).findByText('انتشار نسخهٔ ویرایش‌شده')).toBeVisible();
    expect(fixture.updates).toHaveLength(2);
    expect(fixture.updates[0].filters).toContainEqual(['org_id', 'org']);
    expect(fixture.updates[0].filters).toContainEqual(['updated_at', 'revision']);
    expect(fixture.drafts).toEqual([
      expect.objectContaining({ id:'other-draft', name:'پیش‌نویس دیگر' }),
      expect.objectContaining({
        template_stage_id:'publish', process_run_stage_id:'run-stage', status:'draft',
        metadata:expect.objectContaining({ description:'متن ویرایش‌شده' }),
      }),
    ]);

    unmount();
    renderCalendar();
    fireEvent.click(await screen.findByRole('button', { name:/مورد دیگر/ }));
    fireEvent.click(await screen.findByText('انتشار نسخهٔ ویرایش‌شده'));
    await waitFor(() => expect(draftModal.stage.source.calendar_date).toBe(`${fixture.date}T12:00:00`));
    expect(draftModal.stage.source.start_date).toBeNull();
    await act(async () => draftModal.onSaveDraftActivity({ name:'عنوان تازه', stage_name:'عنوان تازه' }));
    expect(await screen.findByText('عنوان تازه')).toBeVisible();
    expect(fixture.drafts).toHaveLength(2);
    expect(fixture.drafts[0].name).toBe('پیش‌نویس دیگر');
  });

  it('rejects saving if the calendar update does not change a row', async () => {
    const { container } = renderCalendar();
    const day = await openTemplateDraft(container);
    fixture.rejectDraftWrite = true;
    await act(async () => {
      await expect(draftModal.onSaveDraftActivity({ name:'پیش‌نویس ناموفق' })).rejects.toThrow('تأیید نشد');
    });
    expect(within(day).queryByText('پیش‌نویس ناموفق')).not.toBeInTheDocument();
    expect(fixture.drafts).toHaveLength(0);
  });
});
