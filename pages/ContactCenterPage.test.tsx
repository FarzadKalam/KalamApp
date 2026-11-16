import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import ContactCenterPage from './ContactCenterPage';
import {fetchSessionBootstrap} from '../utils/sessionCache';
vi.mock('../utils/sessionCache',async(original)=>({...await original<typeof import('../utils/sessionCache')>(),fetchSessionBootstrap:vi.fn()}));
vi.mock('../utils/organizationContext',async(original)=>({...await original<typeof import('../utils/organizationContext')>(),getSelectedOrganizationId:()=> 'org-a'}));
vi.mock('../utils/voipStore',()=>({useVoipState:()=>({status:'registered',activeCall:null})}));
vi.mock('../utils/voipDock',()=>({setVoipDockTarget:vi.fn()}));
vi.mock('../hooks/useOrgPlanFeature',()=>({useOrgPlanFeature:()=>true}));
vi.mock('../hooks/useVoipConnectionPolicy',()=>({useVoipConnectionPolicy:()=>({data:{enabled:true,usageMode:'browser',provider:'telefonchy'},refetch:vi.fn()})}));
vi.mock('../hooks/useContactCenterOperators',()=>({useContactCenterOperators:()=>({data:{items:[]},isPending:false,refetch:vi.fn()})}));
vi.mock('../components/notifications/messaging/MessagingSurfacePrototype',()=>({default:({callsOnly}:any)=><div>{callsOnly?'سوابق تماس مشترک':'پیام‌رسانی'}</div>}));
vi.mock('../components/voip/ContactCenterOperatorModal',()=>({default:()=>null}));
vi.mock('../components/voip/ContactCenterConnectionModal',()=>({default:()=>null}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('does not expose call records or operator controls without the actor permission',async()=>{
 vi.mocked(fetchSessionBootstrap).mockResolvedValue({orgId:'org-a',user:{id:'user'},permissions:{voip_call_reports:{view:false}}} as any);
 render(<ContactCenterPage />);expect(await screen.findByText('دسترسی مشاهدهٔ تماس‌ها برای شما فعال نیست.')).toBeInTheDocument();
 expect(screen.queryByText('سوابق تماس مشترک')).not.toBeInTheDocument();
});
it('reuses the call surface and phone dock without granting operator management to a normal viewer',async()=>{
 vi.mocked(fetchSessionBootstrap).mockResolvedValue({orgId:'org-a',user:{id:'user'},permissions:{voip_call_reports:{view:true}}} as any);
 render(<ContactCenterPage />);expect(await screen.findByText('سوابق تماس مشترک')).toBeInTheDocument();
 expect(screen.getByLabelText('شماره‌گیر مرکز تماس')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'اتصال کاربر به اپراتور'})).not.toBeInTheDocument();
});
