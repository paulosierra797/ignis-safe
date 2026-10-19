export const getAccountTier = (account) => {
  if (account?.is_super_admin === true) return 'super_admin';
  return String(account?.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'personnel';
};

export const planAccountRoleChange = (account, target) => {
  const from = getAccountTier(account);
  if (!target || target === from) return { kind: 'none' };
  const transitions = {
    'personnel:admin': { kind: 'promote', label: 'Personnel to Admin' },
    'admin:super_admin': { kind: 'promote', label: 'Admin to Super Admin' },
    'super_admin:admin': { kind: 'demote', label: 'Super Admin to Admin' },
    'admin:personnel': { kind: 'demote', label: 'Admin to Personnel' },
  };
  return transitions[`${from}:${target}`] || {
    kind: 'invalid',
    reason: target === 'super_admin' && from === 'personnel'
      ? 'Personnel must be promoted to Admin first'
      : from === 'super_admin' && target === 'personnel'
        ? 'Revoke Super Admin privileges before demoting to Personnel'
        : 'Role change not allowed',
  };
};
