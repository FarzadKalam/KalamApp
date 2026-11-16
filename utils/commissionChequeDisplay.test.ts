import {describe,it,expect} from 'vitest';
import {getCommissionChequeDisplay,resolveCommissionChequePayment} from './commissionChequeDisplay';
describe('historical commission cheque display',()=>{
 const payments=[{payment_type:'cheque',cheque_id:'a',amount:'240000000',cheque_due_date:'2026-11-11'}, {payment_type:'cheque',cheque_id:'b',amount:'300000000',cheque_due_date:'2026-11-23'}];
 it('recovers both sparse historical snapshots using the same invoice payments',()=>{
  expect(getCommissionChequeDisplay(resolveCommissionChequePayment({amount:'240000000'},payments))).toMatchObject({id:'a',dueDate:'2026-11-11'});
  expect(getCommissionChequeDisplay(resolveCommissionChequePayment({amount:'300000000'},payments))).toMatchObject({id:'b',dueDate:'2026-11-23'});
 });
 it('never guesses between two same-amount cheques',()=>{
  expect(resolveCommissionChequePayment({amount:240000000},[...payments,{...payments[0],cheque_id:'c'}])).toBeNull();
 });
 it('prefers an explicit identity and current register date over stale aliases',()=>{
  expect(resolveCommissionChequePayment({cheque_id:'b',amount:240000000},payments)?.cheque_id).toBe('b');
  expect(getCommissionChequeDisplay(payments[0],{due_date:'2026-12-01'}).dueDate).toBe('2026-12-01');
 });
});
