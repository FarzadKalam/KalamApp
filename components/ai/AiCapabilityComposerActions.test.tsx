import React from 'react';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,describe,expect,it,vi } from 'vitest';
import AiCapabilityComposerActions from './AiCapabilityComposerActions';
vi.mock('../../moduleRegistry',()=>({MODULES:{}}));
vi.mock('../../supabaseClient',()=>({SUPABASE_URL:'https://preview.invalid',SUPABASE_ANON_KEY:'test-only',supabase:{functions:{invoke:vi.fn(async()=>({data:{success:true},error:null}))},auth:{getSession:vi.fn(async()=>({data:{session:null},error:null}))},from:vi.fn(()=>({select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),maybeSingle:vi.fn(async()=>({data:null,error:null}))}))}}));
const base=() => ({ selected: [] as any[],onChange: vi.fn(),onAgentsChange: vi.fn(),onVoiceSend: vi.fn(),onFilePrepared: vi.fn() });
afterEach(() => {cleanup();vi.restoreAllMocks();});
describe('central composer agent and tool controls',() => {
  it('uses icon controls with the lead or grouped selected avatars on every screen',() => {
    const props=base();const {rerender}=render(<AiCapabilityComposerActions {...props} />);
    const trigger=screen.getByRole('button',{name:'انتخاب ایجنت‌های تخصصی'});
    expect(trigger.querySelector('[data-agent-key="lead_orchestrator"]')).toBeInTheDocument();
    expect(trigger).toHaveClass('ai-composer-icon');
    expect(screen.getByRole('button',{name:'انتخاب عملکرد هوش مصنوعی'})).toHaveClass('ai-composer-icon');
    expect(screen.queryByText('ایجنت‌ها')).not.toBeInTheDocument();
    rerender(<AiCapabilityComposerActions {...props} selectedAgents={['sales_leads','instagrammer']} />);
    expect(trigger.querySelectorAll('[data-agent-key]')).toHaveLength(2);
    expect(trigger.querySelector('[data-agent-key="sales_leads"]')).toBeInTheDocument();
    expect(trigger.querySelector('[data-agent-key="lead_orchestrator"]')).not.toBeInTheDocument();
  });
  it('keeps distinct output tools and preserves explicit analysis choices',async () => {
    const props=base();render(<AiCapabilityComposerActions {...props} autoSuggested={['web_search']} />);
    fireEvent.click(screen.getByRole('button',{name:'انتخاب عملکرد هوش مصنوعی'}));
    const web=await screen.findByText('مهارت پژوهش وب');
    expect(web.closest('label')?.querySelector('input')).toBeChecked();
    for(const name of ['مهارت ثبت اطلاعات','مهارت عملیات فرآیند','مهارت کار خودکار','مهارت تحلیل عمیق','تنظیم قیمت','مهارت گفتگوی آزاد']) expect(screen.queryByText(name)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('مهارت تحلیل اسناد').closest('label')!.querySelector('input')!);
    expect(props.onChange).toHaveBeenCalledWith(['web_search','document_analysis']);
    fireEvent.click(screen.getByRole('button',{name:'بستن',exact:true}));
    await waitFor(() => expect(screen.getByRole('button',{name:'انتخاب عملکرد هوش مصنوعی'})).toHaveAttribute('aria-expanded','false'));
  });
  it('selects free conversation and can return from it to a permitted agent',async () => {
    const props=base();const {rerender}=render(<AiCapabilityComposerActions {...props} selectedAgents={['sales_leads']} />);
    fireEvent.click(screen.getByRole('button',{name:'انتخاب ایجنت‌های تخصصی'}));
    fireEvent.click(await screen.findByRole('button',{name:/بدون ایجنت/}));
    expect(props.onChange).toHaveBeenCalledWith(['free_chat']);expect(props.onAgentsChange).toHaveBeenCalledWith([]);
    rerender(<AiCapabilityComposerActions {...props} selected={['free_chat']} selectedAgents={[]} />);
    expect(screen.getByRole('button',{name:'انتخاب ایجنت‌های تخصصی'})).toBeEnabled();
    expect(screen.getByRole('button',{name:'انتخاب عملکرد هوش مصنوعی'})).toBeDisabled();
    expect(screen.getByRole('button',{name:/بدون ایجنت/})).toHaveAttribute('aria-pressed','true');
    fireEvent.click(screen.getByText('ایجنت بازاریابی و فروش'));
    expect(props.onChange).toHaveBeenCalledWith([]);expect(props.onAgentsChange).toHaveBeenCalledWith(['sales_leads']);
  });
  it('hides inaccessible agents while keeping free conversation usable',async () => {
    const props=base();render(<AiCapabilityComposerActions {...props} agentAccessMap={{sales_leads:{canView:true,canChat:true,canUse:true} as any,instagrammer:{canView:false,canChat:false,canUse:false} as any}} />);
    fireEvent.click(screen.getByRole('button',{name:'انتخاب ایجنت‌های تخصصی'}));
    expect(await screen.findByText('ایجنت بازاریابی و فروش')).toBeInTheDocument();
    expect(screen.queryByText('ایجنت اینستاگرامر')).not.toBeInTheDocument();
    expect(screen.queryByText('ایجنت منابع انسانی')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/بدون ایجنت/})).toBeEnabled();
  });
  it('preserves attachment controls for media and free conversations',() => {
    const props=base();const {rerender}=render(<AiCapabilityComposerActions {...props} selected={['image_generation']} />);
    expect(screen.getByLabelText('پیوست فایل به هوش مصنوعی')).toBeInTheDocument();
    rerender(<AiCapabilityComposerActions {...props} selected={['free_chat']} />);
    expect(screen.getByLabelText('پیوست فایل به هوش مصنوعی')).toBeInTheDocument();
  });
});
