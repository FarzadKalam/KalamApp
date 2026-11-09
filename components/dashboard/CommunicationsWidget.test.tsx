import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ feature:vi.fn(),rpc:vi.fn() }));
vi.mock('../../supabaseClient',()=>({supabase:{rpc:mocks.rpc},supabasePublic:{},supabaseSignUpClient:{},SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-placeholder',SUPABASE_AUTH_STORAGE_KEY:'test-auth'}));
vi.mock('../../utils/saasPlanFeatures',()=>({hasCurrentOrgPlanFeature:mocks.feature}));
vi.mock('../notifications/NotificationRuntimeProvider',()=>({useNotificationRuntime:()=>({summary:{notes:2,bot_direct_messages:1,bot_group_messages:0,sms_messages:0,voip_calls:0},refreshSummary:vi.fn()})}));
import CommunicationsWidget from './CommunicationsWidget';
afterEach(cleanup);
beforeEach(()=>{mocks.feature.mockResolvedValue(true);mocks.rpc.mockResolvedValue({data:true,error:null});});
function Location(){const location=useLocation();return <output data-testid="destination">{location.pathname+location.search}</output>;}
const show=(permissions:any)=>render(<App><MemoryRouter><CommunicationsWidget orgId="organization" permissions={permissions}/><Location/></MemoryRouter></App>);
describe('dashboard communication destinations',()=>{
 it('opens all seven real messaging channels using their existing route keys',async()=>{
  show({instagram_conversations:{view:true}});
  await screen.findByText('اینستاگرام');
  for(const [label,tab] of [['پیام‌های داخلی','notes'],['بات‌ها','bot_direct_messages'],['گروه‌های بات','bot_messages'],['پیامک‌ها','sms_messages'],['تماس‌ها','voip_calls'],['ایمیل‌ها','email_messages'],['اینستاگرام','instagram']]){
   fireEvent.click(screen.getByText(label).closest('button')!);
   expect(screen.getByTestId('destination')).toHaveTextContent('/messages?tab='+tab);
  }
 });
 it('requires both role and plan access for optional channels',async()=>{
  mocks.feature.mockResolvedValue(false);mocks.rpc.mockResolvedValue({data:false,error:null});
  show({instagram_conversations:{view:true},__communications:{fields:{use_sms:false,use_voip:false,use_bot_channels:false}}});
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('email_can_access',{p_action:'view'}));
  expect(screen.queryByRole('button',{name:/اینستاگرام|ایمیل‌ها|پیامک‌ها|تماس‌ها|بات‌ها/})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:/پیام‌های داخلی/})).toBeVisible();
 });
 it('does not render the widget when workspace access is denied',()=>{
  show({__communications:{view:false}});
  expect(screen.queryByRole('button',{name:/پیام‌های داخلی/})).not.toBeInTheDocument();
 });
});
