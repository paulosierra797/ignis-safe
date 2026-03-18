import { supabase } from './supabaseClient';

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

const formatTimeDisplay = (date) => {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getStoredUserProfile = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const normalizeOfficerProfile = (officer) => {
  if (!officer) return officer;

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
export const generateQRSession = () => {
  const now = new Date();
  const sessionId = `${Math.random().toString(36).slice(2, 6)}-${Math.random().toString(36).slice(2, 4)}`.toUpperCase();
  
  return {
    sessionId,
    createdAt: now.getTime(),
    expiresAt: now.getTime() + 24 * 60 * 60 * 1000, // 24 hours
    scanned: false,
    usedBy: null
  };
};

export const isSessionValid = (session) => {
  if (!session) return false;
  const now = new Date().getTime();
  return session.expiresAt > now && !session.scanned;
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

  let adminProfile = null;
  const { data: adminData } = await supabase
    .from('admin')
    .select('*')
    .eq('admin_id', authUser.id)
    .maybeSingle();
  adminProfile = adminData || null;

  const derivedOfficer = {
    id: toNumericPersonnelId(
      Number.isInteger(adminProfile?.id) ? adminProfile.id : fallbackOfficer?.id,
      accountEmail
    ),
    name:
      adminProfile?.name ||
      authUser.user_metadata?.name ||
      fallbackOfficer?.name ||
      accountEmail.split('@')[0],
    rank:
      adminProfile?.rank ||
      authUser.user_metadata?.rank ||
      fallbackOfficer?.rank ||
      'Personnel',
    email: accountEmail
  };

  return normalizeOfficerProfile(derivedOfficer);
};

export const saveAuthToken = (officer) => {
  const syncedOfficer = normalizeOfficerProfile(officer);
  const token = {
    id: syncedOfficer.id,
    name: syncedOfficer.name,
    rank: syncedOfficer.rank,
    email: syncedOfficer.email,
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
          accuracy: row.accuracy
        }
      : null
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

  return (data || []).map(mapAttendanceRow);
};

export const recordAttendance = async ({ officer, mode, location }) => {
  const now = new Date();
  const dateIso = now.toISOString().slice(0, 10);
  const signature = `${officer.name} (QR Verified)`;

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
      throw new Error(openRowsError.message || 'Failed to validate open attendance record');
    }

    if (openRows && openRows.length > 0) {
      throw new Error('Time In is already recorded and not yet timed out. Please complete Time Out first.');
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
      throw new Error(openRowsError.message || 'Failed to find open attendance record');
    }

    if (openRows && openRows.length > 0) {
      const { data: updatedRow, error: updateError } = await supabase
        .from('attendance_records')
        .update({
          time_out: now.toISOString(),
          signature,
          updated_at: now.toISOString(),
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          accuracy: location?.accuracy ?? null
        })
        .eq('id', openRows[0].id)
        .select()
        .single();

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update attendance timeout');
      }

      return { record: mapAttendanceRow(updatedRow), action: 'updated' };
    }
  }

  const payload = {
    personnel_id: officer.id,
    name: officer.name,
    rank: officer.rank,
    attendance_date: dateIso,
    time_in: mode === 'in' ? now.toISOString() : null,
    time_out: mode === 'out' ? now.toISOString() : null,
    signature,
    latitude: location?.latitude ?? null,
    longitude: location?.longitude ?? null,
    accuracy: location?.accuracy ?? null,
    created_at: now.toISOString(),
    updated_at: now.toISOString()
  };

  const { data: insertedRow, error: insertError } = await supabase
    .from('attendance_records')
    .insert([payload])
    .select()
    .single();

  if (insertError) {
    throw new Error(insertError.message || 'Failed to create attendance record');
  }

  return { record: mapAttendanceRow(insertedRow), action: 'created' };
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
    stationId: 'ZINI-M3',
    radius: parseNumber(import.meta.env.VITE_STATION_ZINI_M3_RADIUS, defaultStation.radius)
  }
};

export const getStationGeo = (stationId) => {
  if (!stationId) return STATION_GEO_MAP.DEFAULT;
  return STATION_GEO_MAP[stationId] || STATION_GEO_MAP.DEFAULT;
};
