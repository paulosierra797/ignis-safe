// Tab-scoped device identity used to ask the server "has this device
// already completed OTP verification and been remembered?" These values are
// opaque markers only: presenting them merely lets an already
// password-authenticated Supabase session (auth.uid() present) query the
// check_trusted_device RPC. They never grant a session by themselves — the
// real Supabase session/refresh-token handling is entirely managed by the
// supabase-js SDK (see supabaseClient.js), not by this module.
const DEVICE_ID_KEY = 'ignis-safe:device_id';
const DEVICE_SECRET_KEY = 'ignis-safe:device_secret';

const randomHex = (byteLength) => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

export const getOrCreateDeviceCredentials = () => {
  let deviceId = sessionStorage.getItem(DEVICE_ID_KEY);
  let deviceSecret = sessionStorage.getItem(DEVICE_SECRET_KEY);

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    sessionStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  if (!deviceSecret) {
    deviceSecret = randomHex(32);
    sessionStorage.setItem(DEVICE_SECRET_KEY, deviceSecret);
  }

  return { deviceId, deviceSecret };
};

export const getStoredDeviceId = () => sessionStorage.getItem(DEVICE_ID_KEY);

export const getStoredDeviceSecret = () => sessionStorage.getItem(DEVICE_SECRET_KEY);

export const clearDeviceSecret = () => {
  sessionStorage.removeItem(DEVICE_SECRET_KEY);
};

export const clearDeviceCredentials = () => {
  sessionStorage.removeItem(DEVICE_ID_KEY);
  clearDeviceSecret();
};
