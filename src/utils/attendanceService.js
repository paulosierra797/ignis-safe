import { supabase } from './supabaseClient';
import { getManilaToday } from './dateUtils';


export const getFaceByAdminId = async (adminId) => {
  const { data, error } = await supabase
    .from('admin_face')
    .select('*')
    .eq('admin_id', adminId)
    .maybeSingle();

  return { data, error };
};
// Personnel registry used for attendance metadata mapping
const personnelDatabase = [
  { id: 1, name: 'Maria Reyes', rank: 'Fire Officer II', email: 'maria.reyes@ignis-safe.app' },
  { id: 2, name: 'John Santos', rank: 'Fire Officer I', email: 'john.santos@ignis-safe.app' },
  { id: 3, name: 'Carlos Mendez', rank: 'Senior Fire Officer I', email: 'carlos.mendez@ignis-safe.app' },
  { id: 4, name: 'Ana Flores', rank: 'Fire Officer III', email: 'ana.flores@ignis-safe.app' },
  { id: 5, name: 'Rosa Martinez', rank: 'Fire Officer II', email: 'rosa.martinez@ignis-safe.app' }
];

const formatDateDisplay = (date) => {
  return date.toLocaleDateString();
};

const getStoredUserProfile = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const normalizeOfficerProfile = (officer) => {
  if (!officer) return officer;
  if (officer.is_personnel_workspace_profile) return officer;

  const storedUser = getStoredUserProfile();
  if (!storedUser) return officer;

  const officerEmail = officer.email?.toLowerCase?.();
  const storedEmail = storedUser.email?.toLowerCase?.();
  if (!officerEmail || !storedEmail || officerEmail !== storedEmail) {
    return officer;
  }

  const fullName = `${storedUser.first_name || ''} ${storedUser.last_name || ''}`.trim();

  return {
    ...officer,
    name: fullName || storedUser.name || officer.name,
    rank: storedUser.rank || officer.rank
  };
};

const toNumericPersonnelId = (value, fallbackSeed = '') => {
  if (Number.isInteger(value) && value > 0) return value;

  // Deterministic positive integer fallback so attendance_records.personnel_id remains valid.
  const text = String(fallbackSeed || value || 'personnel');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) + 1;
};

const buildOfficerFromAuthUser = async (authUser) => {
  if (!authUser?.id || !authUser?.email) {
    return null;
  }

  const accountEmail = authUser.email.toLowerCase();
  const fallbackOfficer = personnelDatabase.find((p) => p.email.toLowerCase() === accountEmail);

  // is_active_personnel_account() is the single source of truth for "is this
  // an active Personnel account" - the same RPC the record_attendance_action()
  // submission enforces server-side. It checks the real public.admin record's
  // status plus role, accepting both role = 'personnel' and role = 'admin'
  // accounts that also own a personnel_workspace_profiles row (an admin who
  // is also registered as active Personnel). Keeping eligibility on this one
  // DB-backed check - instead of re-deriving it from admin/workspace rows in
  // JS - prevents the login gate and the submission RPC from drifting apart.
  const [eligibilityResult, adminResult, workspaceResult] = await Promise.all([
    supabase.rpc('is_active_personnel_account'),
    supabase
      .from('admin')
      .select('*')
      .eq('admin_id', authUser.id)
      .maybeSingle(),
    supabase
      .from('personnel_workspace_profiles')
      .select('*')
      .eq('admin_id', authUser.id)
      .maybeSingle()
  ]);

  if (eligibilityResult.error || adminResult.error || workspaceResult.error) {
    return null;
  }

  if (!eligibilityResult.data) {
    return null;
  }

  const adminProfile = adminResult.data || null;
  const workspaceProfile = workspaceResult.data || null;
  const personnelProfile = workspaceProfile || adminProfile;
  const personnelName = `${personnelProfile?.first_name || ''} ${personnelProfile?.last_name || ''}`.trim();

  const derivedOfficer = {
    admin_id: authUser.id,
    id: toNumericPersonnelId(
      Number.isInteger(adminProfile?.id) ? adminProfile.id : fallbackOfficer?.id,
      accountEmail
    ),

    name:
      personnelName ||
      personnelProfile?.name ||
      authUser.user_metadata?.name ||
      fallbackOfficer?.name ||
      accountEmail.split('@')[0],

    rank:
      personnelProfile?.rank ||
      authUser.user_metadata?.rank ||
      fallbackOfficer?.rank ||
      'Personnel',

    email: personnelProfile?.email || accountEmail,

    avatarUrl:
      personnelProfile?.avatar_url ||
      authUser.user_metadata?.avatar_url ||
      null,
    is_personnel_workspace_profile: Boolean(workspaceProfile)
  };

  return normalizeOfficerProfile(derivedOfficer);
};

// QR Session Management
export const generateQRSession = async (stationId = 'DEFAULT') => {
  const { data, error } = await supabase.rpc('create_attendance_qr_session', {
    p_station_id: stationId
  });

  if (error) {
    throw new Error(error.message || 'Could not create the attendance QR session.');
  }

  return data;
};

export const getActiveQRSession = async (stationId = 'DEFAULT') => {
  const { data, error } = await supabase.rpc('get_active_attendance_qr_session', {
    p_station_id: stationId
  });

  if (error) {
    throw new Error(error.message || 'Could not load the attendance QR session.');
  }

  return data || null;
};

export const validateQRSession = async (sessionId) => {
  const { data, error } = await supabase.rpc('validate_attendance_qr_session', {
    p_session_id: sessionId
  });

  if (error || !data) {
    return { valid: false, reason: 'Invalid QR session' };
  }

  return data;
};

export const consumeQRSession = async (sessionId) => {
  if (!sessionId) return false;

  const { data, error } = await supabase.rpc('consume_attendance_qr_session', {
    p_session_id: sessionId
  });

  if (error) {
    console.warn('Could not consume attendance QR session:', error);
    return false;
  }

  return data === true;
};
export const isSessionValid = (session) => {
  if (!session) return false;

 if (new Date(session.expires_at) < new Date()) {
  return "QR expired";
}
};

export const getExpiryTime = (expiresAt) => {
  const now = new Date().getTime();
  const remaining = Math.max(0, expiresAt - now);
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
  return { hours, minutes, seconds, remaining };
};

// Personnel Database
export const getPersonnelDatabase = () => personnelDatabase;

export const getPersonnelById = (id) => {
  return personnelDatabase.find(p => p.id === id);
};

export const getPersonnelByName = (name) => {
  return personnelDatabase.find(p => p.name.toLowerCase() === name.toLowerCase());
};

// Authentication
export const authenticatePersonnel = async (email, password) => {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return null;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password
  });

  if (error || !data?.user?.email) {
    return null;
  }

  return buildOfficerFromAuthUser(data.user);
};

export const getActivePersonnelSession = async () => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData?.session) {
    clearAuthToken();
    return null;
  }

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    clearAuthToken();
    return null;
  }

  const officer = await buildOfficerFromAuthUser(data.user);
  if (!officer) {
    clearAuthToken();
  }

  return officer;
};

export const saveAuthToken = (officer) => {
  const syncedOfficer = normalizeOfficerProfile(officer);
  const token = {
    admin_id: syncedOfficer.admin_id,
    id: syncedOfficer.id,
    name: syncedOfficer.name,
    rank: syncedOfficer.rank,
    email: syncedOfficer.email,
    avatarUrl: syncedOfficer.avatarUrl || null,
    faceVerified: Boolean(syncedOfficer.faceVerified),
    faceMatchScore: Number.isFinite(syncedOfficer.faceMatchScore) ? syncedOfficer.faceMatchScore : null,
    faceVerifiedAt: syncedOfficer.faceVerifiedAt || null,
    timestamp: new Date().getTime(),
    sessionId: Math.random().toString(36).slice(2)
  };
  localStorage.setItem('attendanceAuth', JSON.stringify(token));
  return token;
};

export const getAuthToken = () => {
  const token = localStorage.getItem('attendanceAuth');
  return token ? JSON.parse(token) : null;
};

export const clearAuthToken = () => {
  localStorage.removeItem('attendanceAuth');
};

export const isAuthValid = () => {
  const token = getAuthToken();
  if (!token) return false;
  const now = new Date().getTime();
  // Auth token valid for 24 hours
  return (now - token.timestamp) < 24 * 60 * 60 * 1000;
};


const ATTENDANCE_VERIFICATION_BUCKET = 'attendance_verifications';
const SIGNED_PHOTO_URL_TTL_SECONDS = 10 * 60;
const DUPLICATE_ATTENDANCE_MESSAGE = 'Your attendance for this action has already been recorded.';

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const getVerificationStatus = ({ facePassed, locationPassed }) => {
  if (facePassed && locationPassed) return 'passed';
  if (!facePassed && !locationPassed) return 'failed';
  return 'partial';
};

const buildVerificationFields = ({ officer, mode, location, verification, photoPath }) => {
  const faceMatchScore = toFiniteNumber(verification?.faceMatchScore);
  const faceMatchPercentage = faceMatchScore == null
    ? null
    : Math.min(100, Math.max(0, faceMatchScore * 100));
  const facePassed = Boolean(verification?.facePassed);
  const locationPassed = Boolean(verification?.locationPassed);

  return {
    personnel_user_id: officer.admin_id || null,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracy: location?.accuracy ?? null,
    location_address: verification?.locationAddress || null,
    distance_from_station_m: toFiniteNumber(verification?.distanceMeters),
    station_id: verification?.stationId || null,
    station_name: verification?.stationName || null,
    face_match_percentage: faceMatchPercentage,
    verification_photo_path: photoPath,
    face_verification_passed: facePassed,
    location_verification_passed: locationPassed,
    verification_status: getVerificationStatus({ facePassed, locationPassed }),
    verification_type: mode,
    verification_recorded_at: new Date().toISOString(),
    verification_metadata: {
      station_radius_m: toFiniteNumber(verification?.stationRadiusMeters),
      face_verified_at: verification?.faceVerifiedAt || null
    }
  };
};

const normalizeShiftId = (shiftId) => String(shiftId || 'DEFAULT').trim() || 'DEFAULT';

const uploadAttendanceVerificationPhoto = async ({ officer, attendanceId, mode, photoBlob }) => {
  if (!photoBlob || !officer?.admin_id) {
    throw new Error('A current verification photo and authenticated personnel ID are required.');
  }

  const dateFolder = new Date().toISOString().slice(0, 10);
  const photoPath = `${officer.admin_id}/${dateFolder}/${attendanceId}-${mode}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(ATTENDANCE_VERIFICATION_BUCKET)
    .upload(photoPath, photoBlob, {
      cacheControl: '3600',
      contentType: 'image/jpeg',
      upsert: false
    });

  if (error) {
    throw new Error(error.message || 'Failed to save the verification photo.');
  }

  return photoPath;
};

const removeAttendanceVerificationPhoto = async (photoPath) => {
  if (!photoPath) return;
  await supabase.storage.from(ATTENDANCE_VERIFICATION_BUCKET).remove([photoPath]);
};

// Attendance Records
const mapAttendanceRow = (row) => {
  const rowDate = row.attendance_date ? new Date(`${row.attendance_date}T00:00:00`) : null;
  const timeIn = row.time_in ? new Date(row.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const timeOut = row.time_out ? new Date(row.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  return {
    id: row.id,
    personnelId: row.personnel_id,
    personnelUserId: row.personnel_user_id || '',
    shiftId: row.shift_id || row.station_id || 'DEFAULT',
    qrSessionId: row.qr_session_id || '',
    name: row.name,
    rank: row.rank,
    date: rowDate ? formatDateDisplay(rowDate) : '',
    dateIso: row.attendance_date || '',
    timestamp: row.created_at,
    timeIn,
    timeOut,
    signature: row.signature || `${row.name} (QR Verified)`,
    location: row.latitude != null && row.longitude != null
      ? {
          latitude: row.latitude,
          longitude: row.longitude,
          accuracy: row.accuracy,
          address: row.location_address || ''
        }
      : null,
    distanceFromStationMeters: row.distance_from_station_m,
    stationId: row.station_id || '',
    stationName: row.station_name || '',
    faceMatchPercentage: row.face_match_percentage,
    verificationPhotoPath: row.verification_photo_path || '',
    verificationPhotoUrl: '',
    faceVerificationPassed: row.face_verification_passed,
    locationVerificationPassed: row.location_verification_passed,
    verificationStatus: row.verification_status || 'not_recorded',
    verificationType: row.verification_type || '',
    verificationRecordedAt: row.verification_recorded_at || null
  };
};

const attachSignedPhotoUrls = async (records) => {
  const photoPaths = [...new Set(records
    .map((record) => record.verificationPhotoPath)
    .filter(Boolean))];

  if (photoPaths.length === 0) {
    return records;
  }

  const { data: signedPhotos, error: signedPhotoError } = await supabase.storage
    .from(ATTENDANCE_VERIFICATION_BUCKET)
    .createSignedUrls(photoPaths, SIGNED_PHOTO_URL_TTL_SECONDS);

  if (signedPhotoError) {
    console.warn('Unable to create signed attendance photo URLs:', signedPhotoError.message);
    return records;
  }

  const signedUrlByPath = new Map(
    (signedPhotos || [])
      .filter((photo) => photo?.path && photo?.signedUrl)
      .map((photo) => [photo.path, photo.signedUrl])
  );

  return records.map((record) => ({
    ...record,
    verificationPhotoUrl: signedUrlByPath.get(record.verificationPhotoPath) || ''
  }));
};

export const getAttendanceRecords = async () => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch attendance records');
  }

  const records = (data || []).map(mapAttendanceRow);
  return attachSignedPhotoUrls(records);
};

export const getAttendanceStatus = async ({ shiftId = 'DEFAULT', qrSessionId } = {}) => {
  const { data, error } = await supabase.rpc('get_own_attendance_status', {
    p_shift_id: normalizeShiftId(shiftId),
    p_qr_session_id: qrSessionId || null
  });

  if (error) {
    throw new Error(error.message || 'Failed to load attendance status.');
  }

  const record = data?.record ? mapAttendanceRow(data.record) : null;
  return {
    state: data?.state || 'none',
    attendanceDate: data?.attendance_date || getManilaToday(),
    shiftId: data?.shift_id || normalizeShiftId(shiftId),
    canTimeIn: Boolean(data?.can_time_in),
    canTimeOut: Boolean(data?.can_time_out),
    message: data?.message || '',
    record
  };
};

export const getMyAttendanceHistory = async (limit = 20) => {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user?.id) {
    throw new Error('You must be signed in to view your attendance history.');
  }

  // Scope explicitly by personnel_user_id (the authenticated account's id) rather than
  // relying only on RLS - admin accounts are allowed to read every row under RLS, so an
  // admin viewing the Personnel workspace would otherwise see everyone's attendance here.
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('personnel_user_id', userData.user.id)
    .order('attendance_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Failed to load attendance history.');
  }

  const records = (data || []).map(mapAttendanceRow);
  return attachSignedPhotoUrls(records);
};

export const recordAttendance = async ({ officer, mode, location, qrSessionId, verification }) => {
  const now = new Date();
  const dateIso = getManilaToday();
  let uploadedPhotoPath = null;
  const shiftId = normalizeShiftId(verification?.stationId);

  if (!qrSessionId) {
    throw new Error('Invalid QR session');
  }

  uploadedPhotoPath = await uploadAttendanceVerificationPhoto({
    officer,
    attendanceId: crypto.randomUUID(),
    mode,
    photoBlob: verification?.photoBlob
  });

  const verificationFields = buildVerificationFields({
    officer,
    mode,
    location,
    verification,
    photoPath: uploadedPhotoPath
  });

  const { data, error } = await supabase.rpc('record_attendance_action', {
    p_mode: mode,
    p_shift_id: shiftId,
    p_qr_session_id: qrSessionId,
    p_location: {
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      attendance_date: dateIso
    },
    p_verification: {
      ...verificationFields,
      recorded_at: now.toISOString()
    },
    p_photo_path: uploadedPhotoPath
  });

  if (error) {
    await removeAttendanceVerificationPhoto(uploadedPhotoPath);
    const message = error.message?.includes(DUPLICATE_ATTENDANCE_MESSAGE)
      ? DUPLICATE_ATTENDANCE_MESSAGE
      : error.message || 'Failed to save attendance.';
    throw new Error(message);
  }

  return {
    record: mapAttendanceRow(data.record),
    action: data.action || (mode === 'out' ? 'updated' : 'created'),
    status: data.status || null
  };
};

// GPS Validation

// Loose bounding box covering all Philippine territory. Used to catch
// obviously wrong GPS fixes (e.g. a browser/OS falling back to an
// IP-based or cached location in another country) before they are ever
// accepted as a valid attendance location.
const PHILIPPINES_BOUNDS = {
  minLat: 4.5,
  maxLat: 21.5,
  minLng: 116.0,
  maxLng: 127.0
};

export const isWithinPhilippines = (latitude, longitude) => (
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= PHILIPPINES_BOUNDS.minLat &&
  latitude <= PHILIPPINES_BOUNDS.maxLat &&
  longitude >= PHILIPPINES_BOUNDS.minLng &&
  longitude <= PHILIPPINES_BOUNDS.maxLng
);

export const requestGeoLocation = () => {
  return new Promise((resolve, reject) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;

          if (!isWithinPhilippines(latitude, longitude)) {
            console.error(
              `[Attendance GPS] Rejected out-of-country fix — lat=${latitude}, lng=${longitude}, accuracy=${accuracy}m. ` +
              'Expected a location within the Philippines.'
            );
            reject(new Error('Detected location is outside the Philippines. Please enable GPS and try again.'));
            return;
          }

          console.log(
            `[Attendance GPS] Detected fix — lat=${latitude}, lng=${longitude}, accuracy=${accuracy}m, timestamp=${new Date().toISOString()}`
          );

          resolve({
            latitude,
            longitude,
            accuracy,
            timestamp: new Date().getTime()
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true }
      );
    } else {
      reject(new Error('Geolocation not supported'));
    }
  });
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
};

export const validateProximity = (userGeo, stationGeo, radiusMeters = 100) => {
  const distance = calculateDistance(
    userGeo.latitude,
    userGeo.longitude,
    stationGeo.latitude,
    stationGeo.longitude
  );
  const distanceMeters = distance * 1000;
  return {
    isValid: distanceMeters <= radiusMeters,
    distance: distanceMeters,
    radius: radiusMeters
  };
};

// eslint-disable-next-line no-unused-vars -- kept for the commented-out production radius/coords below (TEST ONLY overrides are active)
const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DEFAULT_RADIUS_METERS = 100;

// --- REAL BFP LOCATION (production) ---
// const defaultStation = {
//   latitude: parseNumber(import.meta.env.VITE_STATION_LATITUDE, 14.5994),
//   longitude: parseNumber(import.meta.env.VITE_STATION_LONGITUDE, 120.9842),
//   name: import.meta.env.VITE_STATION_NAME || 'Station Delta',
//   address: import.meta.env.VITE_STATION_ADDRESS || '',
//   stationId: 'DEFAULT',
//   radius: parseNumber(import.meta.env.VITE_STATION_RADIUS, DEFAULT_RADIUS_METERS)
// };

// TEST ONLY — temporary attendance test location
// Captured live from navigator.geolocation (browser/device GPS fix) on 2026-08-14
// for testing the full Time In / Time Out flow. Restore the REAL BFP LOCATION
// block above when done testing.
const defaultStation = {
  latitude: 14.364417324719483, // TEST ONLY
  longitude: 120.88277998427404, // TEST ONLY
  name: import.meta.env.VITE_STATION_NAME || 'Station Delta',
  address: import.meta.env.VITE_STATION_ADDRESS ||
    'Block 2 Lot 74 Tennyson St., Brighton 2, Lancaster New City, Brgy. Pasong Camachile I, General Trias, Cavite, Philippines',
  stationId: 'DEFAULT',
  // radius: parseNumber(import.meta.env.VITE_STATION_RADIUS, DEFAULT_RADIUS_METERS), // ORIGINAL — restore this line when done testing
  radius: 50 // TEST ONLY — widened to absorb GPS accuracy drift while testing
};

export const STATION_GEO = defaultStation;

export const STATION_GEO_MAP = {
  DEFAULT: defaultStation,
  // --- REAL BFP LOCATION (production) ---
  // 'ZINI-M3': {
  //   latitude: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_LATITUDE, defaultStation.latitude),
  //   longitude: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_LONGITUDE, defaultStation.longitude),
  //   name: import.meta.env.VITE_STATION_ZINI_M3_NAME || 'Station Delta',
  //   address: import.meta.env.VITE_STATION_ZINI_M3_ADDRESS || defaultStation.address,
  //   stationId: 'ZINI-M3',
  //   radius: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_RADIUS, defaultStation.radius)
  // },
  // TEST ONLY — temporary attendance test location
  // Captured live from navigator.geolocation (browser/device GPS fix) on 2026-08-14
  // for testing the full Time In / Time Out flow. Restore the REAL BFP LOCATION
  // block above when done testing.
  'ZINI-M3': {
    latitude: 14.364417324719483, // TEST ONLY
    longitude: 120.88277998427404, // TEST ONLY
    name: import.meta.env.VITE_STATION_ZINI_M3_NAME || 'Station Delta',
    address: import.meta.env.VITE_STATION_ZINI_M3_ADDRESS || defaultStation.address,
    stationId: 'ZINI-M3',
    // radius: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_RADIUS, defaultStation.radius), // ORIGINAL — restore this line when done testing
    radius: 50 // TEST ONLY — widened to absorb GPS accuracy drift while testing
  }
};

export const getStationGeo = (stationId) => {
  if (!stationId) return STATION_GEO_MAP.DEFAULT;
  return STATION_GEO_MAP[stationId] || STATION_GEO_MAP.DEFAULT;
};
