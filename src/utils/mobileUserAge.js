export const normalizeMobileUserAge = (value) => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[0-9]{1,3}$/.test(value.trim())) return null;
  const age = Number(value);
  return Number.isInteger(age) && age >= 0 && age <= 130 ? age : null;
};

export const formatMobileUserAge = (value) => {
  const age = normalizeMobileUserAge(value);
  return age === null ? 'Not recorded' : `${age} ${age === 1 ? 'year' : 'years'} old`;
};
