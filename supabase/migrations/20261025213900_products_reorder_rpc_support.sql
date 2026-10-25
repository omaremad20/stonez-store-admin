-- Products join the shared sparse-gap reorder RPC.
-- Only change vs. catalog_entities_reorder_rpc_sparse: the `products` branch in
-- the entity CASE. products.display_order is globally UNIQUE (nullable), so the
-- scope is the whole table, exactly like brands / collections / departments.
-- Positions are computed from the live table by target id, so a move is correct
-- even when the client has only loaded part of the list.
CREATE OR REPLACE FUNCTION public.reorder_catalog_entity(p_entity text, p_id uuid, p_target_id uuid DEFAULT NULL::uuid, p_position text DEFAULT 'before'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  c_gap          constant bigint := 1024;
  c_max          constant bigint := 2147483647;
  v_table        text;
  v_scope_clause text := 'true';
  v_scope        uuid;
  v_target_scope uuid;
  v_exists       boolean;
  v_ids          uuid[];
  v_values       bigint[];
  v_current      bigint;
  v_n            integer;
  v_idx          integer;
  v_lo           bigint;
  v_hi           bigint;
  v_written      integer := 0;
  v_attempt      integer;
  v_all_ids      uuid[];
  v_changed      uuid[];
  v_positions    integer[];
begin
  if not (select public.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  v_table := case p_entity
    when 'departments' then 'departments'
    when 'brands'      then 'brands'
    when 'categories'  then 'categories'
    when 'collections' then 'collections'
    when 'products'    then 'products'
  end;
  if v_table is null then
    raise exception 'Unsupported entity' using errcode = '22023';
  end if;
  if p_id is null or p_position is null or p_position not in ('before', 'after', 'first', 'last') then
    raise exception 'Invalid reorder request' using errcode = '22023';
  end if;
  if p_position in ('before', 'after') and (p_target_id is null or p_target_id = p_id) then
    raise exception 'A different target row is required' using errcode = '22023';
  end if;

  -- One reorder per table at a time; concurrent requests queue.
  perform pg_advisory_xact_lock(hashtext('public.reorder_catalog_entity:' || v_table));

  execute format('select exists (select 1 from public.%I where id = $1)', v_table) into v_exists using p_id;
  if not v_exists then
    raise exception 'Row not found' using errcode = 'P0002';
  end if;
  if p_position in ('before', 'after') then
    execute format('select exists (select 1 from public.%I where id = $1)', v_table) into v_exists using p_target_id;
    if not v_exists then
      raise exception 'Target row not found' using errcode = 'P0002';
    end if;
  end if;

  if v_table = 'categories' then
    v_scope_clause := 'department_id is not distinct from $1';
    select c.department_id into v_scope from public.categories c where c.id = p_id;
    if p_position in ('before', 'after') then
      select c.department_id into v_target_scope from public.categories c where c.id = p_target_id;
      if v_target_scope is distinct from v_scope then
        raise exception 'Categories can only be reordered within the same department' using errcode = '22023';
      end if;
    end if;
  end if;

  -- Lock every row in the scope for the rest of the transaction.
  execute format('select 1 from public.%I where %s for update', v_table, v_scope_clause) using v_scope;

  for v_attempt in 1..2 loop
    -- Live order of the scope without the moving row.
    execute format(
      'select array_agg(id order by display_order nulls last, id), array_agg(display_order::bigint order by display_order nulls last, id)
         from public.%I where %s and id <> $2',
      v_table, v_scope_clause)
      into v_ids, v_values using v_scope, p_id;
    execute format('select display_order::bigint from public.%I where id = $1', v_table) into v_current using p_id;

    v_n := coalesce(cardinality(v_ids), 0);
    v_lo := null;
    v_hi := null;

    if v_n = 0 or array_position(v_values, null) is null then
      if p_position = 'first' then
        v_lo := 0;
        v_hi := case when v_n = 0 then 2 * c_gap else v_values[1] end;
      elsif p_position = 'last' then
        v_lo := case when v_n = 0 then 0 else v_values[v_n] end;
        v_hi := v_lo + 2 * c_gap;
      else
        v_idx := array_position(v_ids, p_target_id);
        if p_position = 'before' then
          v_hi := v_values[v_idx];
          v_lo := case when v_idx > 1 then v_values[v_idx - 1] else 0 end;
        else
          v_lo := v_values[v_idx];
          v_hi := case when v_idx < v_n then v_values[v_idx + 1] else v_values[v_idx] + 2 * c_gap end;
        end if;
      end if;

      -- Already there: nothing to write. At the end of the scope there is no upper neighbour.
      if v_current is not null and v_current > v_lo and (
           v_current < v_hi
           or p_position = 'last'
           or (p_position = 'after' and v_idx = v_n)
         ) then
        return v_written;
      end if;

      if v_hi - v_lo >= 2 and v_lo + (v_hi - v_lo) / 2 <= c_max then
        execute format('update public.%I set display_order = $1 where id = $2', v_table)
          using (v_lo + (v_hi - v_lo) / 2)::integer, p_id;
        return v_written + 1;
      end if;
    end if;

    if v_attempt = 2 then
      raise exception 'Could not find a free position' using errcode = '40001';
    end if;

    -- Renumber the whole scope (moving row included, in its current place) to
    -- GAP spacing. Two passes so the non-deferrable unique constraint never sees
    -- a duplicate: park changed rows on negative values, then set final values.
    execute format('select array_agg(id order by display_order nulls last, id) from public.%I where %s', v_table, v_scope_clause)
      into v_all_ids using v_scope;
    execute format(
      'select coalesce(array_agg(n.id order by n.pos), ''{}''), coalesce(array_agg((n.pos * $2)::integer order by n.pos), ''{}'')
         from unnest($1::uuid[]) with ordinality as n(id, pos)
         join public.%I t on t.id = n.id
        where t.display_order is distinct from (n.pos * $2)::integer',
      v_table)
      into v_changed, v_positions using v_all_ids, c_gap;
    execute format('update public.%I t set display_order = -c.pos from unnest($1::uuid[], $2::integer[]) as c(id, pos) where t.id = c.id', v_table)
      using v_changed, v_positions;
    execute format('update public.%I t set display_order = c.pos from unnest($1::uuid[], $2::integer[]) as c(id, pos) where t.id = c.id', v_table)
      using v_changed, v_positions;
    v_written := v_written + cardinality(v_changed);
  end loop;

  return v_written;
end;
$function$;
