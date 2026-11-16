-- Asterisk 18 serializes these fields on every dynamic contact write.
-- Source: asterisk/asterisk, branch 18, res/res_pjsip/location.c.
begin;
alter table public.ps_contacts
 add column if not exists qualify_timeout double precision default 3.0,
 add column if not exists authenticate_qualify text default 'no',
 add column if not exists reg_server text default '';
alter table public.ps_aors
 add column if not exists qualify_timeout double precision default 3.0;
-- Private PBX runtime data has no client API; the existing controlled server
-- and PBX database role access it. No public or authenticated RLS policy.
alter table public.ps_contacts enable row level security;
revoke all on public.ps_contacts from public,anon,authenticated;
grant select,insert,update,delete on public.ps_contacts to service_role;
notify pgrst,'reload schema';
commit;
