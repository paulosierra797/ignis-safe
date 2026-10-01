export const DASMARINAS_LOCATION = 'Dasmariñas City, Cavite';
export const OUTSIDE_DASMARINAS_LOCATION = 'Outside Dasmariñas City';
export const UNSPECIFIED_LOCATION = 'Not Specified';

export const getMobileUserLocation = (profile = {}, declaredLocation = '') => {
  const city = String(profile.city || '').trim();
  const province = String(profile.province || '').trim();
  const barangay = String(profile.barangay || '').trim();
  const location = String(declaredLocation || '').trim();

  if (city === 'Dasmariñas City' && province === 'Cavite') {
    return { key: 'dasmarinas', label: DASMARINAS_LOCATION };
  }
  if (!city && !province && !barangay && location === OUTSIDE_DASMARINAS_LOCATION) {
    return { key: 'outside', label: OUTSIDE_DASMARINAS_LOCATION };
  }
  if (location === DASMARINAS_LOCATION) {
    return { key: 'dasmarinas', label: DASMARINAS_LOCATION };
  }
  return { key: 'unspecified', label: UNSPECIFIED_LOCATION };
};
