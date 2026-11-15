// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {describeAiRecord} from './ai-record-display';
describe('human record choices',()=>{
 it('keeps names primary and adds invoice discriminators',()=>{
  expect(describeAiRecord({name:'فاکتور چاپ',system_code:'p135',invoice_date:'2026-11-16',total_invoice_amount:9000}).label).toBe('فاکتور چاپ · p135 · 2026-11-16 · 9000');
  expect(describeAiRecord({name:'بنر',system_code:'p136'}).label).toBe('بنر · p136');
 });
 it('never promotes a code or UUID to the human title',()=>{
  expect(describeAiRecord({system_code:'p135'})).toMatchObject({title:null,label:null,needsTitle:true});
  expect(describeAiRecord({name:'11111111-1111-4111-8111-111111111111'}).title).toBeNull();
 });
});
