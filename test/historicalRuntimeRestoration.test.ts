// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
let db: PGlite;
const orgA='10000000-0000-4000-8000-000000000001', orgB='10000000-0000-4000-8000-000000000002';
const employee='20000000-0000-4000-8000-000000000001';
beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create function public.current_org_id() returns uuid language sql as $$ select nullif(current_setting('test.org',true),'')::uuid $$;
 create function public.combine_attendance_date_time(date,time) returns timestamptz language sql as $$ select ($1+$2) at time zone 'Asia/Tehran' $$;
 create table public.attendance_logs(id uuid primary key default gen_random_uuid(),org_id uuid not null,employee_id uuid,related_profile_id uuid,assignee_id uuid,attendance_date date,log_type text,check_in_time time,check_out_time time,manual_check_in_time timestamptz,manual_check_out_time timestamptz,actual_check_in_time timestamptz,actual_check_out_time timestamptz,occurred_at timestamptz,presence_minutes integer,presence_hours numeric,updated_at timestamptz);
 alter table public.attendance_logs enable row level security;
 create policy tenant_presence on public.attendance_logs to authenticated using(org_id=public.current_org_id()) with check(org_id=public.current_org_id());
 grant select,insert,update,delete on public.attendance_logs to authenticated;
 create table public.leave_requests(id uuid primary key,org_id uuid not null,status text,updated_at timestamptz);
 create table public.web_form_submissions(id uuid default gen_random_uuid(),org_id uuid,status text,target_module_id text,target_record_id uuid,created_at timestamptz default now(),record_payload jsonb);
 grant select,insert on public.web_form_submissions to authenticated;
 grant select on public.leave_requests to authenticated;
 insert into public.leave_requests values('30000000-0000-4000-8000-000000000001','${orgA}','draft',now()),('30000000-0000-4000-8000-000000000002','${orgB}','draft',now());
 select set_config('test.org','${orgA}',false);`);
 for(const file of ['database_v1_phase579_attendance_presence_runtime_restore.sql','database_v1_phase581_leave_submission_pending_status.sql']) {
   const sql=readFileSync(file,'utf8');await db.exec(sql);await db.exec(sql);
 }
 await db.exec('set role authenticated');
},60000);
afterAll(async()=>{await db?.close();});
describe.sequential('restored historical runtimes',()=>{
 it('sums consecutive attendance pairs and stores the total only on the final exit',async()=>{
  for(const [type,time] of [['check_in','08:00'],['check_out','12:00'],['check_in','13:00'],['check_out','17:00']]) {
   await db.query('insert into attendance_logs(org_id,employee_id,attendance_date,log_type,occurred_at) values($1,$2,$3,$4,$5)',[orgA,employee,'2026-11-09',type,`2026-11-09T${time}:00+03:30`]);
  }
  const result=await db.query<{presence_minutes:number,presence_hours:number}>('select presence_minutes,presence_hours from attendance_logs where presence_minutes is not null');
  expect(result.rows).toHaveLength(1);expect(result.rows[0].presence_minutes).toBe(480);expect(Number(result.rows[0].presence_hours)).toBe(8);
 });
 it('denies cross-organization attendance access and tolerates missing organization input',async()=>{
  await db.exec(`select public.recalculate_attendance_daily_presence('${orgB}','${employee}',null,null,'2026-11-09');select public.recalculate_attendance_daily_presence(null,'${employee}',null,null,'2026-11-09');`);
  expect((await db.query('select id from attendance_logs')).rows).toHaveLength(4);
  await db.exec(`select set_config('test.org','',false)`);
  expect((await db.query('select id from attendance_logs')).rows).toHaveLength(0);
  await db.exec(`select set_config('test.org','${orgA}',false)`);
 });
 it('uses pending for a matching submission and cannot update another organization',async()=>{
  await db.exec(`insert into web_form_submissions(org_id,status,target_module_id,target_record_id) values('${orgA}','submitted','leave_requests','30000000-0000-4000-8000-000000000001'),('${orgA}','submitted','leave_requests','30000000-0000-4000-8000-000000000002');`);
  const records=await db.query<{status:string}>('select status from leave_requests order by id');
  expect(records.rows.map(row=>row.status)).toEqual(['pending','draft']);
 });
});
