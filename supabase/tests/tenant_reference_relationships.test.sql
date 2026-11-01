-- Structural security and relationship contracts for tenant-owned reference catalogs.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(49);

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.tenant_reference_items'::regclass),
  'reference catalog enforces row-level security'
);
SELECT ok(NOT has_table_privilege('anon', 'public.tenant_reference_items', 'SELECT'), 'anonymous users cannot read reference items');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tenant_reference_items', 'SELECT'), 'browser users cannot read reference items directly');
SELECT ok(
  has_table_privilege('service_role', 'public.tenant_reference_items', 'SELECT')
  AND has_table_privilege('service_role', 'public.tenant_reference_items', 'INSERT')
  AND has_table_privilege('service_role', 'public.tenant_reference_items', 'UPDATE'),
  'trusted API can manage references'
);
SELECT ok(NOT has_table_privilege('service_role', 'public.tenant_reference_items', 'DELETE'), 'references cannot be hard-deleted');

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_records'::regclass AND conname = 'academic_records_tenant_class_reference_fk'), 'academic classes use tenant master-data IDs');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_records'::regclass AND conname = 'academic_records_tenant_subject_reference_fk'), 'academic subjects use tenant reference IDs');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_records'::regclass AND conname = 'academic_records_tenant_curriculum_reference_fk'), 'academic curriculum uses tenant reference IDs');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_records'::regclass AND conname = 'academic_records_tenant_assessment_type_reference_fk'), 'assessment types use tenant reference IDs');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academic_records'::regclass AND conname = 'academic_records_tenant_facility_reference_fk'), 'academic room references are tenant-bound');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.facility_bookings'::regclass AND conname = 'facility_bookings_tenant_facility_reference_fk'), 'facility bookings reference tenant facilities');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_bills'::regclass AND conname = 'finance_bills_tenant_fee_type_reference_fk'), 'finance bills reference tenant fee types');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_expenses'::regclass AND conname = 'finance_expenses_tenant_category_reference_fk'), 'finance expenses reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.marketplace_products'::regclass AND conname = 'marketplace_products_tenant_category_reference_fk'), 'marketplace products reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cooperative_products'::regclass AND conname = 'cooperative_products_tenant_category_reference_fk'), 'cooperative products reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cooperative_suppliers'::regclass AND conname = 'cooperative_suppliers_tenant_category_reference_fk'), 'cooperative suppliers reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.library_books'::regclass AND conname = 'library_books_tenant_category_reference_fk'), 'library books reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_budget_lines'::regclass AND conname = 'finance_budget_lines_tenant_category_reference_fk'), 'budget lines reference finance categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.finance_budget_lines'::regclass AND conname = 'finance_budget_lines_tenant_unit_fk'), 'budget lines reference their tenant organization unit');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.healthcare_medicines'::regclass AND conname = 'healthcare_medicines_tenant_category_reference_fk'), 'healthcare medicines reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.healthcare_medicines'::regclass AND conname = 'healthcare_medicines_tenant_unit_reference_fk'), 'healthcare medicines reference tenant units');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ga_facilities'::regclass AND conname = 'ga_facilities_tenant_category_reference_fk'), 'General Affairs assets reference tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ga_inventory_items'::regclass AND conname = 'ga_inventory_items_tenant_category_reference_fk'), 'General Affairs inventory references tenant categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.ga_inventory_items'::regclass AND conname = 'ga_inventory_items_tenant_unit_reference_fk'), 'General Affairs inventory references tenant units');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.hris_employees'::regclass AND conname = 'hris_employees_tenant_organization_unit_fk'), 'HRIS employees reference tenant organization units');

SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.academic_records'::regclass AND tgname = 'academic_records_link_references' AND NOT tgisinternal), 'academic writes validate active references');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.facility_bookings'::regclass AND tgname = 'facility_bookings_link_reference' AND NOT tgisinternal), 'facility writes validate active references');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.finance_bills'::regclass AND tgname = 'finance_bills_link_fee_type' AND NOT tgisinternal), 'bill writes validate active fee types');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.finance_expenses'::regclass AND tgname = 'finance_expenses_link_category' AND NOT tgisinternal), 'expense writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.marketplace_products'::regclass AND tgname = 'marketplace_products_link_category' AND NOT tgisinternal), 'marketplace writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cooperative_products'::regclass AND tgname = 'cooperative_products_link_category' AND NOT tgisinternal), 'cooperative writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.cooperative_suppliers'::regclass AND tgname = 'cooperative_suppliers_link_category' AND NOT tgisinternal), 'supplier writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.library_books'::regclass AND tgname = 'library_books_link_category' AND NOT tgisinternal), 'library writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.finance_budget_lines'::regclass AND tgname = 'finance_budget_lines_link_references' AND NOT tgisinternal), 'budget writes validate categories and units');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.healthcare_medicines'::regclass AND tgname = 'healthcare_medicines_link_references' AND NOT tgisinternal), 'healthcare writes validate categories and units');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ga_facilities'::regclass AND tgname = 'ga_facilities_link_category' AND NOT tgisinternal), 'asset writes validate active categories');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.ga_inventory_items'::regclass AND tgname = 'ga_inventory_items_link_references' AND NOT tgisinternal), 'inventory writes validate categories and units');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.hris_employees'::regclass AND tgname = 'hris_employees_link_organization_unit' AND NOT tgisinternal), 'HRIS writes validate organization unit links');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.tenant_reference_items'::regclass AND conname = 'tenant_reference_items_description_semantic_check'), 'reference descriptions are meaningful and distinct from selectable names');
SELECT ok(position('department' IN pg_get_triggerdef((SELECT oid FROM pg_trigger WHERE tgrelid = 'public.finance_expenses'::regclass AND tgname = 'finance_expenses_link_category'))) > 0, 'finance department label changes are resolved through the unit trigger');

SELECT ok(EXISTS (
  SELECT 1 FROM public.tenant_reference_items r
  JOIN public.profiles p ON p.tenant_id = r.tenant_id
  WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    AND r.domain = 'library_book_category' AND r.code = 'UMUM' AND r.status = 'active'
), 'existing Admin tenants receive baseline category data');

SELECT throws_ok(
  $$INSERT INTO public.tenant_reference_items (
      tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
    )
    SELECT p.tenant_id, 'library_book_category', 'PGTAP_BAD_DESC', 'Makna Sama', 'Makna Sama', 'active', p.user_id, p.user_id
    FROM public.profiles p WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23514', 'new row for relation "tenant_reference_items" violates check constraint "tenant_reference_items_description_semantic_check"',
  'deskripsi kategori tidak boleh hanya mengulang nama pilihan'
);

WITH inserted AS (
  INSERT INTO public.library_books (
    tenant_id, title, author, category, total_copies, created_by_user_id, category_reference_id
  )
  SELECT p.tenant_id, 'PGTAP_RELATION_LABEL', 'Uji relasi', 'Label yang sengaja keliru', 1, p.user_id, r.id
  FROM public.profiles p
  JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
    AND r.domain = 'library_book_category' AND r.status = 'active'
  WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
  ORDER BY p.created_at, p.user_id
  LIMIT 1
  RETURNING tenant_id, category, category_reference_id
)
SELECT ok(EXISTS (
  SELECT 1 FROM inserted i
  JOIN public.tenant_reference_items r ON r.tenant_id = i.tenant_id
    AND r.domain = 'library_book_category' AND r.id = i.category_reference_id
  WHERE i.category = r.name
), 'database derives display label from the selected category ID');

SELECT throws_ok(
  $$INSERT INTO public.library_books (tenant_id, title, author, category, total_copies, created_by_user_id)
    SELECT p.tenant_id, 'PGTAP_FREE_CATEGORY', 'Uji relasi', 'Kategori bebas yang tidak terdaftar', 1, p.user_id
    FROM public.profiles p WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23503', 'Pilih kategori aktif dari katalog tenant',
  'teks bebas kategori ditolak oleh trigger database'
);

SELECT throws_ok(
  $$INSERT INTO public.library_books (
      tenant_id, title, author, category, total_copies, created_by_user_id, category_reference_id
    )
    SELECT p.tenant_id, 'PGTAP_WRONG_DOMAIN', 'Uji relasi', r.name, 1, p.user_id, r.id
    FROM public.profiles p
    JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
      AND r.domain = 'cooperative_product_category' AND r.status = 'active'
    WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23503', 'Kategori harus cocok dengan referensi tenant yang aktif',
  'kategori dari domain modul lain ditolak'
);

SELECT throws_ok(
  $$INSERT INTO public.library_books (
      tenant_id, title, author, category, total_copies, created_by_user_id, category_reference_id
    )
    SELECT gen_random_uuid(), 'PGTAP_WRONG_TENANT', 'Uji relasi', r.name, 1, p.user_id, r.id
    FROM public.profiles p
    JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
      AND r.domain = 'library_book_category' AND r.status = 'active'
    WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23503', 'Kategori harus cocok dengan referensi tenant yang aktif',
  'kategori dari tenant lain ditolak'
);

INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
SELECT p.tenant_id, 'library_book_category', 'PGTAP_INACTIVE', 'Kategori Uji Nonaktif',
  'Nilai sementara untuk menguji penolakan kategori nonaktif.', 'inactive', p.user_id, p.user_id
FROM public.profiles p
WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
ORDER BY p.created_at, p.user_id
LIMIT 1;

SELECT throws_ok(
  $$INSERT INTO public.library_books (
      tenant_id, title, author, category, total_copies, created_by_user_id, category_reference_id
    )
    SELECT p.tenant_id, 'PGTAP_INACTIVE_CATEGORY', 'Uji relasi', r.name, 1, p.user_id, r.id
    FROM public.profiles p
    JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
      AND r.domain = 'library_book_category' AND r.code = 'PGTAP_INACTIVE' AND r.status = 'inactive'
    WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23503', 'Kategori harus cocok dengan referensi tenant yang aktif',
  'kategori nonaktif ditolak untuk record baru'
);

SELECT throws_ok(
  $$INSERT INTO public.finance_expenses (
      tenant_id, category, description, amount, expense_date, department,
      requester_user_id, requester_name, category_reference_id
    )
    SELECT p.tenant_id, r.name, 'Uji pengeluaran tanpa unit', 1000, CURRENT_DATE,
      'Unit bebas', p.user_id, p.display_name, r.id
    FROM public.profiles p
    JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
      AND r.domain = 'finance_expense_category' AND r.status = 'active'
    WHERE p.status = 'active' AND lower(p.role) IN ('admin', 'super_admin')
    ORDER BY p.created_at, p.user_id LIMIT 1$$,
  '23503', 'Unit pengeluaran wajib berasal dari unit organisasi aktif tenant',
  'pengeluaran baru tidak menerima unit atau bagian teks bebas'
);

WITH profile AS (
  SELECT tenant_id, user_id, display_name FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY created_at, user_id LIMIT 1
), unit AS (
  INSERT INTO public.organization_units (
    tenant_id, code, name, unit_type, location, created_by_user_id, updated_by_user_id
  )
  SELECT p.tenant_id, 'PGTAP_UNIT', 'Unit Uji Relasi', 'lainnya', '', p.user_id, p.user_id
  FROM profile p
  RETURNING tenant_id, id, name
), inserted AS (
  INSERT INTO public.finance_expenses (
    tenant_id, category, description, amount, expense_date, department,
    requester_user_id, requester_name, category_reference_id, unit_id
  )
  SELECT p.tenant_id, r.name, 'Uji penurunan label dari referensi', 5000, CURRENT_DATE,
    'Label bebas yang harus diganti', p.user_id, p.display_name, r.id, u.id
  FROM profile p
  JOIN unit u ON u.tenant_id = p.tenant_id
  JOIN public.tenant_reference_items r ON r.tenant_id = p.tenant_id
    AND r.domain = 'finance_expense_category' AND r.status = 'active'
  ORDER BY r.code
  LIMIT 1
  RETURNING tenant_id, category, department, unit_id, category_reference_id
)
SELECT ok(EXISTS (
  SELECT 1 FROM inserted i
  JOIN unit u ON u.tenant_id = i.tenant_id AND u.id = i.unit_id
  JOIN public.tenant_reference_items r ON r.tenant_id = i.tenant_id
    AND r.domain = 'finance_expense_category' AND r.id = i.category_reference_id
  WHERE i.category = r.name AND i.department = u.name
), 'transaksi mengambil label kategori dan unit organisasi dari ID referensi');

SELECT * FROM finish();
ROLLBACK;
