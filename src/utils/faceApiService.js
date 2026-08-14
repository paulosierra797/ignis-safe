import { supabase } from './supabaseClient';

// The 7-day re-registration cooldown is enforced server-side inside the
// register_face() RPC (and backstopped by a DB trigger on admin_face), so it
// can't be bypassed by calling the table directly. See
// supabase/migrations/20260815140000_add_face_registration_cooldown.sql.
export const registerFace = async (adminId, descriptor) => {
  return await supabase.rpc('register_face', {
    p_face_descriptor: Array.from(descriptor)
  });
};

// Prefix used by register_face() when it rejects a call still inside the
// 7-day cooldown; the remainder of the error message is the ISO timestamp
// of when the next registration becomes eligible.
export const FACE_ID_COOLDOWN_PREFIX = 'FACE_ID_COOLDOWN_ACTIVE:';

export const getFaceIdCooldownUntil = (error) => {
  const message = error?.message || '';
  if (!message.startsWith(FACE_ID_COOLDOWN_PREFIX)) return null;
  return message.slice(FACE_ID_COOLDOWN_PREFIX.length).trim();
};

// ✅ ADD THIS
export const getFaceByAdminId = async (adminId) => {
  return await supabase
    .from('admin_face')
    .select('*')
    .eq('admin_id', adminId)
    .maybeSingle();
};