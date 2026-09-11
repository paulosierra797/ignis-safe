export function matchesSpecificRecipient(announcement, query, personnel = []) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  if (announcement.audience_type !== 'specific_personnel') return false;
  const ids = new Set([...(announcement.target_personnel_ids || []), announcement.target_personnel_id].filter(Boolean));
  const people = [
    ...(announcement.acknowledgement_tracking || []),
    ...(announcement.acknowledgement_personnel?.acknowledged || []),
    ...(announcement.acknowledgement_personnel?.pending || []),
    ...personnel.filter(person => ids.has(person.admin_id)),
  ];
  const names = [...(announcement.target_personnel_names || []), announcement.target_personnel_name];
  return names.some(name => String(name || '').toLowerCase().includes(term)) ||
    people.some(person => [person.name, person.rank, person.email].filter(Boolean).join(' ').toLowerCase().includes(term));
}
