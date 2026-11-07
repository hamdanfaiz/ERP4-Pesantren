const BAN_DURATION = '876600h';

function safeCode(error) {
  const rawCode = typeof error?.code === 'string'
    ? error.code
    : typeof error?.name === 'string'
      ? error.name
      : typeof error?.status === 'number'
        ? `HTTP_${error.status}`
        : 'unknown';
  return rawCode.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 80) || 'unknown';
}

/**
 * Append-only audit rows can intentionally prevent deleting a synthetic user's profile or tenant.
 * Disable the fixture instead: suspended tenants/profiles and banned Auth users cannot log in or
 * access operational data, while immutable audit references remain valid.
 */
export async function isolateSyntheticTenantFixture(admin, { tenantIds = [], userIds = [] } = {}) {
  const uniqueTenantIds = [...new Set(tenantIds.filter(Boolean))];
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  const errors = [];

  if (uniqueTenantIds.length) {
    try {
      const { data, error } = await admin.from('tenants')
        .update({ status: 'suspended' })
        .in('id', uniqueTenantIds)
        .select('id,status');
      if (error) throw error;
      const suspended = new Set((data || []).filter((row) => row.status === 'suspended').map((row) => row.id));
      if (uniqueTenantIds.some((id) => !suspended.has(id))) errors.push('tenant_suspension_incomplete');
    } catch (error) {
      errors.push(`tenant_suspension_${safeCode(error)}`);
    }
  }

  if (uniqueUserIds.length) {
    try {
      const { data, error } = await admin.from('profiles')
        .update({ status: 'suspended' })
        .in('user_id', uniqueUserIds)
        .select('user_id,status');
      if (error) throw error;
      const suspended = new Set((data || []).filter((row) => row.status === 'suspended').map((row) => row.user_id));
      if (uniqueUserIds.some((id) => !suspended.has(id))) errors.push('profile_suspension_incomplete');
    } catch (error) {
      errors.push(`profile_suspension_${safeCode(error)}`);
    }

    for (const userId of uniqueUserIds) {
      try {
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: BAN_DURATION });
        if (error) throw error;
      } catch (error) {
        errors.push(`auth_ban_${safeCode(error)}`);
      }
    }
  }

  if (errors.length) {
    const error = new Error(`Synthetic fixture isolation failed (${errors.join(', ')}).`);
    error.code = 'STAGING_FIXTURE_ISOLATION_FAILED';
    throw error;
  }

  return { tenantsSuspended: uniqueTenantIds.length, profilesSuspended: uniqueUserIds.length, authUsersBanned: uniqueUserIds.length };
}
