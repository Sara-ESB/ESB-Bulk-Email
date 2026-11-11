-- Safe to run more than once (it resets the tables). Run the WHOLE file in Supabase -> SQL Editor.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists messages, contacts, activity_log, profiles cascade;
drop function if exists queue_messages(jsonb), set_role(uuid,text), set_status(uuid,text), log_action(text), ensure_profile(text), my_role(), handle_new_user() cascade;

create table profiles(id uuid primary key references auth.users on delete cascade,name text,username text,role text not null default 'user' check(role in('user','admin','super')),status text not null default 'active' check(status in('active','banned')),created_at timestamptz default now());
create table contacts(id bigint generated always as identity primary key,name text,email text unique,phone text,company text,category text not null default 'Uncategorized',unsubscribed boolean not null default false,created_by uuid default auth.uid(),created_at timestamptz default now());
create table messages(id bigint generated always as identity primary key,channel text not null default 'email',direction text not null default 'out',to_addr text,name text,category text default 'Uncategorized',from_addr text,subject text,body text,btn_text text,btn_link text,meta jsonb,status text not null default 'queued',send_at timestamptz default now(),sent_at timestamptz,claimed_at timestamptz,error text,attempts int default 0,created_by uuid default auth.uid(),created_at timestamptz default now());
create index messages_q on messages(status,channel,send_at);
create table activity_log(id bigint generated always as identity primary key,at timestamptz default now(),username text,action text);

create function my_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=auth.uid() and status='active' $$;

create function handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
declare u text:=lower(coalesce(new.raw_user_meta_data->>'username',split_part(new.email,'@',1)));
begin if u='supreme-admin' then u:=split_part(new.email,'@',1); end if;
insert into profiles(id,name,username) values(new.id,coalesce(new.raw_user_meta_data->>'name',split_part(new.email,'@',1)),u) on conflict (id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function ensure_profile(p_name text) returns void language plpgsql security definer set search_path=public as $$
declare e text;
begin if auth.uid() is null then raise exception 'Not signed in'; end if;
 select email into e from auth.users where id=auth.uid();
 insert into profiles(id,name,username) values(auth.uid(),coalesce(nullif(p_name,''),split_part(e,'@',1)),split_part(e,'@',1)) on conflict (id) do nothing; end $$;

alter table profiles enable row level security;alter table contacts enable row level security;alter table messages enable row level security;alter table activity_log enable row level security;
create policy p_sel on profiles for select to authenticated using(id=auth.uid() or my_role() in('admin','super'));
create policy c_sel on contacts for select to authenticated using(my_role() is not null);
create policy c_ins on contacts for insert to authenticated with check(my_role() is not null);
create policy c_upd on contacts for update to authenticated using(my_role() is not null);
create policy c_del on contacts for delete to authenticated using(my_role() in('admin','super'));
create policy m_sel on messages for select to authenticated using(my_role() is not null and (created_by=auth.uid() or my_role() in('admin','super')));
create policy m_upd on messages for update to authenticated using(my_role() is not null and (created_by=auth.uid() or my_role() in('admin','super')));
create policy l_sel on activity_log for select to authenticated using(my_role() in('admin','super'));

create function log_action(a text) returns void language sql security definer set search_path=public as $$
insert into activity_log(username,action) select p.username,a from profiles p where p.id=auth.uid() and p.status='active' $$;

create function queue_messages(p_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare r text:=my_role(); n int:=jsonb_array_length(p_rows);
begin
 if r is null then raise exception 'Not allowed'; end if;
 if n>1 and r='user' then raise exception 'Bulk sending needs an admin account'; end if;
 if n>2000 then raise exception 'Too many recipients at once (max 2000)'; end if;
 insert into messages(channel,to_addr,name,category,from_addr,subject,body,btn_text,btn_link,meta,send_at,status,created_by)
 select coalesce(x->>'channel','email'),x->>'to_addr',x->>'name',coalesce(x->>'category','Uncategorized'),x->>'from_addr',x->>'subject',x->>'body',x->>'btn_text',x->>'btn_link',x->'meta',coalesce((x->>'send_at')::timestamptz,now()),case when x->>'channel'='pop' then 'active' else 'queued' end,auth.uid()
 from jsonb_array_elements(p_rows) x;
 update messages set status='ready' where channel in('wa','sms') and status='queued' and send_at<=now() and created_by=auth.uid();
 perform log_action('Queued '||n||' '||coalesce(p_rows->0->>'channel','email')||' message(s)');
 return n; end $$;

create function set_role(uid uuid,new_role text) returns void language plpgsql security definer set search_path=public as $$
begin if my_role() is distinct from 'super' then raise exception 'Only the owner can change roles'; end if;
 if new_role not in('user','admin') then raise exception 'Bad role'; end if;
 update profiles set role=new_role where id=uid and role<>'super'; perform log_action('Set role of '||uid::text||' to '||new_role); end $$;

create function set_status(uid uuid,new_status text) returns void language plpgsql security definer set search_path=public as $$
declare r text:=my_role();
begin if r is null or r='user' then raise exception 'Not allowed'; end if;
 if new_status='banned' and r<>'super' then raise exception 'Only the owner can ban accounts'; end if;
 if new_status not in('active','banned') then raise exception 'Bad status'; end if;
 update profiles set status=new_status where id=uid and role<>'super';
 perform log_action(case when new_status='banned' then 'Banned ' else 'Reactivated ' end||uid::text); end $$;

revoke all on function queue_messages(jsonb),set_role(uuid,text),set_status(uuid,text),log_action(text),ensure_profile(text) from public,anon;
grant execute on function queue_messages(jsonb),set_role(uuid,text),set_status(uuid,text),log_action(text),ensure_profile(text) to authenticated;
