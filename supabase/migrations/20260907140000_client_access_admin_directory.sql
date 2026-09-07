begin;
-- Safe, bounded read projections. No token, hash, or arbitrary private row JSON.
create function public.admin_list_client_invitations(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform client_access_private.assert_admin();
  if page_offset is null or page_offset < 0 then raise exception 'Invalid page.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select i.id, client_access_private.invitation_state(i.state, i.expires_at) as status,
      i.created_at, i.expires_at, i.intended_name, i.mobile, i.source_note,
      i.linked_user_id, p.full_name as linked_client_name
    from client_access_private.client_invitations i
    left join public.client_profiles p on p.user_id=i.linked_user_id
    order by i.created_at desc, i.id limit 50 offset page_offset
  ) r), '[]'::jsonb);
end;
$$;
create function public.admin_list_client_access(page_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform client_access_private.assert_admin();
  if page_offset is null or page_offset < 0 then raise exception 'Invalid page.'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select a.user_id, p.full_name, u.email, p.phone as mobile, a.status,
      a.admission_source, a.admitted_at, a.invitation_id
    from client_access_private.client_access a
    join auth.users u on u.id=a.user_id
    left join public.client_profiles p on p.user_id=a.user_id
    order by a.admitted_at desc, a.user_id limit 50 offset page_offset
  ) r), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_list_client_invitations(integer), public.admin_list_client_access(integer) from public, anon, authenticated;
grant execute on function public.admin_list_client_invitations(integer), public.admin_list_client_access(integer) to authenticated;
commit;
