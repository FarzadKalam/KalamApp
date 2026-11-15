import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,describe,it,expect,vi} from 'vitest';
import AiApprovalReviewModal from './AiApprovalReviewModal';
vi.mock('./AssistantPanel',()=>({default:({initialThreadId}:any)=><div role="status">کارت گفتگوی {initialThreadId}</div>}));
afterEach(cleanup);
describe('dashboard approval review',()=>{
 it('opens the existing conversation card instead of executing the action',async()=>{
  render(<AiApprovalReviewModal action={{id:'action',thread_id:'conversation'}} onClose={()=>{}} />);
  expect(await screen.findByRole('status')).toHaveTextContent('کارت گفتگوی conversation');
 });
 it('fails visibly when an action has no conversation',()=>{
  render(<AiApprovalReviewModal action={{id:'action'}} onClose={()=>{}} />);
  expect(screen.getByRole('alert')).toHaveTextContent('امکان اجرای بدون بررسی کارت وجود ندارد');
 });
});
