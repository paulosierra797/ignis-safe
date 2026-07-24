import { supabase } from './supabaseClient';


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

// QR Session Management
export const generateQRSession = async (stationId = 'DEFAULT') => {
  const sessionId = crypto.randomUUID();
  const now = new Date();

  const session = {
    session_id: sessionId,
    station_id: stationId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    used: false
  };

  await supabase.from('qr_sessions').insert(session);

  return session;
};
export const validateQRSession = async (sessionId) => {
  const { data, error } = await supabase
    .from('qr_sessions')
    .select('*')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, reason: 'Invalid QR session' };
  }

  const now = new Date();

  if (new Date(data.expires_at) < now) {
    return { valid: false, reason: 'QR expired' };
  }

  if (data.used) {
    return { valid: false, reason: 'QR already used' };
  }

  return { valid: true, session: data };
};
export const isSessionValid = (session) => {
  if (!session) return false;

 if (new Date(session.expires_at) < new Date()) {
  return "QR expired";
}
};

export const getExpiryTime = (expiresAt) => {
  const now = new Date().getTime();
  const remaining = expiresAt - now;
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, remaining };
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

  const authUser = data.user;
  const accountEmail = authUser.email.toLowerCase();
  const fallbackOfficer = personnelDatabase.find((p) => p.email.toLowerCase() === accountEmail);

  const [adminResult, workspaceResult] = await Promise.all([
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
  const adminProfile = adminResult.data || null;
  const workspaceProfile = workspaceResult.data || null;
  const personnelProfile = workspaceProfile || adminProfile;
  const personnelName = `${personnelProfile?.first_name || ''} ${personnelProfile?.last_name || ''}`.trim();

 const derivedOfficer = {
  admin_id: authUser.id,   // ADD THIS
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

export const getAttendanceRecords = async () => {
  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch attendance records');
  }

  const records = (data || []).map(mapAttendanceRow);
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

export const recordAttendance = async ({ officer, mode, location, qrSessionId, verification }) => {
  const now = new Date();
  const dateIso = now.toISOString().slice(0, 10);
  const signature = `${officer.name} (QR Verified)`;
  let uploadedPhotoPath = null;

  if (mode === 'in') {
    const { data: openRows, error: openRowsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('personnel_id', officer.id)
      .not('time_in', 'is', null)
      .is('time_out', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (openRowsError) {
      throw new Error(openRowsError.message);
    }

    if (openRows && openRows.length > 0) {
      throw new Error(
        'Time In is already recorded and not yet timed out.'
      );
    }
  }


  if (mode === 'out') {
    const { data: openRows, error: openRowsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('personnel_id', officer.id)
      .eq('attendance_date', dateIso)
      .is('time_out', null)
      .order('created_at', { ascending: false })
      .limit(1);


    if (openRowsError) {
      throw new Error(openRowsError.message);
    }


    if (openRows && openRows.length > 0) {
      uploadedPhotoPath = await uploadAttendanceVerificationPhoto({
        officer,
        attendanceId: openRows[0].id,
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

      const { data: updatedRow, error: updateError } = await supabase
        .from('attendance_records')
        .update({
          time_out: now.toISOString(),
          signature,
          updated_at: now.toISOString(),
          ...verificationFields
        })
        .eq('id', openRows[0].id)
        .select()
        .single();


      if (updateError) {
        await removeAttendanceVerificationPhoto(uploadedPhotoPath);
        throw new Error(updateError.message);
      }


      // ✅ Disable QR after successful timeout
      if (qrSessionId) {
        await supabase
          .from('qr_sessions')
          .update({ used: true })
          .eq('session_id', qrSessionId);
      }


      return {
        record: mapAttendanceRow(updatedRow),
        action: 'updated'
      };
    }
  }



  // CREATE NEW ATTENDANCE

  const attendanceId = crypto.randomUUID();
  uploadedPhotoPath = await uploadAttendanceVerificationPhoto({
    officer,
    attendanceId,
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

  const payload = {
    id: attendanceId,
    personnel_id: officer.id,
    name: officer.name,
    rank: officer.rank,

    attendance_date: dateIso,

    time_in: mode === 'in'
      ? now.toISOString()
      : null,

    time_out: mode === 'out'
      ? now.toISOString()
      : null,

    signature,

    ...verificationFields,

    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };


  const { data: insertedRow, error: insertError } =
    await supabase
      .from('attendance_records')
      .insert([payload])
      .select()
      .single();


  if (insertError) {
    await removeAttendanceVerificationPhoto(uploadedPhotoPath);
    throw new Error(insertError.message);
  }



  // ✅ Disable QR after successful attendance creation
  if (qrSessionId) {
    await supabase
      .from('qr_sessions')
      .update({ used: true })
      .eq('session_id', qrSessionId);
  }



  return {
    record: mapAttendanceRow(insertedRow),
    action: 'created'
  };
};

// GPS Validation
export const requestGeoLocation = () => {
  return new Promise((resolve, reject) => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date().getTime()
          });
        },
        (error) => {
          reject(error);
        }
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

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const DEFAULT_RADIUS_METERS = 100;

const defaultStation = {
  latitude: parseNumber(import.meta.env.VITE_STATION_LATITUDE, 14.5994),
  longitude: parseNumber(import.meta.env.VITE_STATION_LONGITUDE, 120.9842),
  name: import.meta.env.VITE_STATION_NAME || 'Station Delta',
  address: import.meta.env.VITE_STATION_ADDRESS || '',
  stationId: 'DEFAULT',
  radius: parseNumber(import.meta.env.VITE_STATION_RADIUS, DEFAULT_RADIUS_METERS)
};

export const STATION_GEO = defaultStation;

export const STATION_GEO_MAP = {
  DEFAULT: defaultStation,
  'ZINI-M3': {
    latitude: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_LATITUDE, defaultStation.latitude),
    longitude: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_LONGITUDE, defaultStation.longitude),
    name: import.meta.env.VITE_STATION_ZINI_M3_NAME || 'Station Delta',
    address: import.meta.env.VITE_STATION_ZINI_M3_ADDRESS || defaultStation.address,
    stationId: 'ZINI-M3',
    radius: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_RADIUS, defaultStation.radius)
  }
};

export const getStationGeo = (stationId) => {
  if (!stationId) return STATION_GEO_MAP.DEFAULT;
  return STATION_GEO_MAP[stationId] || STATION_GEO_MAP.DEFAULT;
};
