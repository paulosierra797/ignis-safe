export const hasWorkspacePermission = (account, permission) => {
  if (!account) return false;
  const status = String(account.status || '').trim().toLowerCase();
  if (['inactive', 'suspended', 'archived'].includes(status)) return false;
  if (String(account.role || '').trim().toLowerCase() === 'admin' && account.is_super_admin === true) return true;
  return Array.isArray(account.permissions) && account.permissions.includes(permission);
};
