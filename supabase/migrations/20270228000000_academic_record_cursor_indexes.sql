-- Stable tenant-scoped cursor pagination for high-volume academic history.
CREATE INDEX IF NOT EXISTS academic_records_tenant_kind_created_id_live_idx
  ON public.academic_records (tenant_id, kind, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS academic_records_tenant_teacher_kind_created_id_live_idx
  ON public.academic_records (tenant_id, teacher_user_id, kind, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND teacher_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS academic_records_tenant_unit_kind_created_id_live_idx
  ON public.academic_records (tenant_id, organization_unit_id, kind, created_at DESC, id DESC)
  WHERE deleted_at IS NULL AND organization_unit_id IS NOT NULL;
