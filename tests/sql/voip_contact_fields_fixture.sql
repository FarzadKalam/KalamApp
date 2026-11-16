-- Isolated PBX fixture: deliberately incomplete legacy schema.
create table public.ps_contacts(id text primary key,uri text,expiration_time bigint,
 qualify_frequency integer,outbound_proxy text,path text,user_agent text,via_addr text,
 via_port integer,call_id text,endpoint text,prune_on_boot text);
create table public.ps_aors(id text primary key,org_id uuid);
