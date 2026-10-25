-- Atomic create / update of a product and its variants.
--
-- SECURITY INVOKER: runs as the calling admin, so RLS (admin-only), the audit
-- triggers (auth.uid()), barcode generation, the variant lock / deletion
-- guards and the image-reference validators all apply exactly as they do for
-- direct table writes. The function only adds one transaction around them.
--
-- Payload contract (validated again here; the Route Handler validates first):
--   p_mode                'create' | 'update'
--   p_product_id          product id (client-generated on create, so an
--                         uncertain create can be verified without duplicates)
--   p_product             product columns. Image columns are written only when
--                         their *_url key is present (absent = keep).
--   p_variants            array of { op: 'insert'|'update', ref, id?, ...cols }.
--                         'update' writes only the keys present, so untouched
--                         fields (e.g. stock adjusted by orders) are never
--                         overwritten with a stale value.
--   p_removed_variant_ids variants to delete. Printed / in-cart variants are
--                         rejected by variants_protect_deletion (23001).
--   p_expected_updated_at optimistic-concurrency token (update only).
--   p_force               skip the token check ("save mine anyway").
--
-- Errors raised for a specific variant are re-raised with the same SQLSTATE and
-- message, and a detail prefixed with `variant_ref=<ref>;op=<op>;constraint=<name>;`
-- so the client can attach them to the right row.
create or replace function public.save_product_with_variants(
  p_mode text,
  p_product_id uuid,
  p_product jsonb,
  p_variants jsonb default '[]'::jsonb,
  p_removed_variant_ids uuid[] default '{}'::uuid[],
  p_expected_updated_at timestamptz default null,
  p_force boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  v_row        public.products;
  v_variant    jsonb;
  v_ref        text;
  v_op         text;
  v_vid        uuid;
  v_count      integer;
  v_state      text;
  v_msg        text;
  v_detail     text;
  v_hint       text;
  v_constraint text;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('create', 'update')
     or p_product_id is null
     or p_product is null or jsonb_typeof(p_product) <> 'object'
     or p_variants is null or jsonb_typeof(p_variants) <> 'array'
     or (p_mode = 'create' and coalesce(cardinality(p_removed_variant_ids), 0) > 0) then
    raise exception 'Invalid save request' using errcode = '22023', detail = 'reason=invalid_payload';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_variants) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'op', '') not in ('insert', 'update')
       or (e ->> 'op' = 'update' and (p_mode = 'create' or coalesce(e ->> 'id', '') = ''))
  ) then
    raise exception 'Invalid variant entry' using errcode = '22023', detail = 'reason=invalid_payload';
  end if;

  /* ------------------------------------------------------------ product */

  if p_mode = 'create' then
    insert into public.products (
      id, name, description, price, discount, label, label_color, label_bg,
      brand_id, category_id, collection_id, is_active,
      cover_image_url, cover_image_storage_path, size_table_image_url, size_table_storage_path
    ) values (
      p_product_id,
      p_product ->> 'name',
      p_product ->> 'description',
      (p_product ->> 'price')::numeric,
      coalesce((p_product ->> 'discount')::numeric, 0),
      p_product ->> 'label',
      p_product ->> 'label_color',
      p_product ->> 'label_bg',
      (p_product ->> 'brand_id')::uuid,
      (p_product ->> 'category_id')::uuid,
      (p_product ->> 'collection_id')::uuid,
      coalesce((p_product ->> 'is_active')::boolean, true),
      p_product ->> 'cover_image_url',
      p_product ->> 'cover_image_storage_path',
      p_product ->> 'size_table_image_url',
      p_product ->> 'size_table_storage_path'
    )
    returning * into v_row;
  else
    select * into v_row from public.products where id = p_product_id for update;
    if not found then
      raise exception 'Product not found' using errcode = 'P0002', detail = 'reason=product_not_found';
    end if;
    if not coalesce(p_force, false)
       and (p_expected_updated_at is null or v_row.updated_at is distinct from p_expected_updated_at) then
      raise exception 'Product was changed by someone else' using errcode = '40001', detail = 'reason=stale_product';
    end if;

    -- Always touches the row, so updated_at (the concurrency token) moves on
    -- every save, including saves that only change variants.
    update public.products p set
      name                     = p_product ->> 'name',
      description              = p_product ->> 'description',
      price                    = (p_product ->> 'price')::numeric,
      discount                 = coalesce((p_product ->> 'discount')::numeric, 0),
      label                    = p_product ->> 'label',
      label_color              = p_product ->> 'label_color',
      label_bg                 = p_product ->> 'label_bg',
      brand_id                 = (p_product ->> 'brand_id')::uuid,
      category_id              = (p_product ->> 'category_id')::uuid,
      collection_id            = (p_product ->> 'collection_id')::uuid,
      is_active                = coalesce((p_product ->> 'is_active')::boolean, p.is_active),
      cover_image_url          = case when p_product ? 'cover_image_url' then p_product ->> 'cover_image_url' else p.cover_image_url end,
      cover_image_storage_path = case when p_product ? 'cover_image_url' then p_product ->> 'cover_image_storage_path' else p.cover_image_storage_path end,
      size_table_image_url     = case when p_product ? 'size_table_image_url' then p_product ->> 'size_table_image_url' else p.size_table_image_url end,
      size_table_storage_path  = case when p_product ? 'size_table_image_url' then p_product ->> 'size_table_storage_path' else p.size_table_storage_path end
    where p.id = p_product_id
    returning * into v_row;

    /* ------------------------------------------------ removed variants */
    -- First, so a removed variant's size/colour can be reused below.
    foreach v_vid in array coalesce(p_removed_variant_ids, '{}'::uuid[]) loop
      begin
        -- Already gone = goal reached (idempotent).
        delete from public.variants where id = v_vid and product_id = p_product_id;
      exception when others then
        get stacked diagnostics
          v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
          v_hint = pg_exception_hint, v_constraint = constraint_name;
        raise exception using
          errcode = v_state, message = v_msg, hint = coalesce(v_hint, ''),
          detail  = format('variant_ref=%s;op=delete;constraint=%s;%s', v_vid, coalesce(v_constraint, ''), coalesce(v_detail, ''));
      end;
    end loop;
  end if;

  /* ------------------------------------------------- variants: updates */

  for v_variant in select e from jsonb_array_elements(p_variants) e where e ->> 'op' = 'update' loop
    v_ref := coalesce(v_variant ->> 'ref', v_variant ->> 'id');
    begin
      update public.variants t set
        size                      = case when v_variant ? 'size' then v_variant ->> 'size' else t.size end,
        color_hash                = case when v_variant ? 'color_hash' then v_variant ->> 'color_hash' else t.color_hash end,
        color_name                = case when v_variant ? 'color_name' then v_variant ->> 'color_name' else t.color_name end,
        stock                     = case when v_variant ? 'stock' then (v_variant ->> 'stock')::bigint else t.stock end,
        is_active                 = case when v_variant ? 'is_active' then (v_variant ->> 'is_active')::boolean else t.is_active end,
        preorder_enabled          = case when v_variant ? 'preorder_enabled' then (v_variant ->> 'preorder_enabled')::boolean else t.preorder_enabled end,
        maximum_preorder_quantity = case when v_variant ? 'maximum_preorder_quantity' then (v_variant ->> 'maximum_preorder_quantity')::bigint else t.maximum_preorder_quantity end,
        image_url                 = case when v_variant ? 'image_url' then v_variant ->> 'image_url' else t.image_url end,
        image_storage_path        = case when v_variant ? 'image_url' then v_variant ->> 'image_storage_path' else t.image_storage_path end
      where t.id = (v_variant ->> 'id')::uuid and t.product_id = v_row.id;

      get diagnostics v_count = row_count;
      if v_count = 0 then
        raise exception 'Variant not found' using errcode = 'P0002', detail = 'reason=variant_not_found';
      end if;
    exception when others then
      get stacked diagnostics
        v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
        v_hint = pg_exception_hint, v_constraint = constraint_name;
      raise exception using
        errcode = v_state, message = v_msg, hint = coalesce(v_hint, ''),
        detail  = format('variant_ref=%s;op=update;constraint=%s;%s', v_ref, coalesce(v_constraint, ''), coalesce(v_detail, ''));
    end;
  end loop;

  /* ------------------------------------------------- variants: inserts */
  -- barcode, is_printed and audit columns are never taken from the payload:
  -- the triggers own them.
  for v_variant in select e from jsonb_array_elements(p_variants) e where e ->> 'op' = 'insert' loop
    v_ref := coalesce(v_variant ->> 'ref', v_variant ->> 'id', '');
    begin
      insert into public.variants (
        id, product_id, size, color_hash, color_name, stock, is_active,
        preorder_enabled, maximum_preorder_quantity, image_url, image_storage_path
      ) values (
        coalesce(nullif(v_variant ->> 'id', '')::uuid, gen_random_uuid()),
        v_row.id,
        v_variant ->> 'size',
        v_variant ->> 'color_hash',
        v_variant ->> 'color_name',
        (v_variant ->> 'stock')::bigint,
        coalesce((v_variant ->> 'is_active')::boolean, true),
        coalesce((v_variant ->> 'preorder_enabled')::boolean, false),
        coalesce((v_variant ->> 'maximum_preorder_quantity')::bigint, 0),
        v_variant ->> 'image_url',
        v_variant ->> 'image_storage_path'
      );
    exception when others then
      get stacked diagnostics
        v_state = returned_sqlstate, v_msg = message_text, v_detail = pg_exception_detail,
        v_hint = pg_exception_hint, v_constraint = constraint_name;
      raise exception using
        errcode = v_state, message = v_msg, hint = coalesce(v_hint, ''),
        detail  = format('variant_ref=%s;op=insert;constraint=%s;%s', v_ref, coalesce(v_constraint, ''), coalesce(v_detail, ''));
    end;
  end loop;

  return jsonb_build_object('id', v_row.id, 'updated_at', v_row.updated_at);
end;
$function$;

comment on function public.save_product_with_variants(text, uuid, jsonb, jsonb, uuid[], timestamptz, boolean) is
  'Admin-only atomic create/update of a product and its variants (SECURITY INVOKER: RLS, audit, barcode and lock triggers apply). Used by the admin dashboard product form.';

revoke all on function public.save_product_with_variants(text, uuid, jsonb, jsonb, uuid[], timestamptz, boolean) from public, anon;
grant execute on function public.save_product_with_variants(text, uuid, jsonb, jsonb, uuid[], timestamptz, boolean) to authenticated;
