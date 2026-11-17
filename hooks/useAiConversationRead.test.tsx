import {act,cleanup,renderHook} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {useAiConversationRead} from './useAiConversationRead';
const mocks=vi.hoisted(()=>({markAiRead:vi.fn(),ai:{items:[] as any[]}}));
vi.mock('../components/notifications/NotificationRuntimeProvider',()=>({useOptionalNotificationRuntime:()=>mocks}));
const row={id:'10000000-0000-4000-8000-000000000001',role:'assistant',content:'پاسخ کامل',created_at:'2026-11-17T01:00:00Z',metadata:{}};
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
it('keeps an answer unread in a hidden tab until its loaded conversation becomes visible',async()=>{
 vi.useFakeTimers();mocks.markAiRead.mockResolvedValue(true);
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});
 const {rerender}=renderHook(({active})=>useAiConversationRead('thread',[row],active),{initialProps:{active:true}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(500);});expect(mocks.markAiRead).not.toHaveBeenCalled();
 Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 act(()=>document.dispatchEvent(new Event('visibilitychange')));
 await act(async()=>{await vi.advanceTimersByTimeAsync(250);});
 expect(mocks.markAiRead).toHaveBeenCalledWith('thread:thread','ai_message',row.id);
 rerender({active:true});await act(async()=>{await vi.advanceTimersByTimeAsync(250);});expect(mocks.markAiRead).toHaveBeenCalledTimes(1);
});
it('does not consume a pending answer or acknowledge after leaving the conversation',async()=>{
 vi.useFakeTimers();Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
 const {unmount}=renderHook(()=>useAiConversationRead('thread',[{...row,metadata:{pending_status:true}}],true));
 await act(async()=>{await vi.advanceTimersByTimeAsync(300);});expect(mocks.markAiRead).not.toHaveBeenCalled();unmount();
 const view=renderHook(()=>useAiConversationRead('thread',[row],true));view.unmount();
 await act(async()=>{await vi.advanceTimersByTimeAsync(300);});expect(mocks.markAiRead).not.toHaveBeenCalled();
});
