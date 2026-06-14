import { supabase } from './supabaseClient';

export const registerFace = async (adminId, descriptor) => {
  return await supabase
    .from('admin_face')
    .upsert(
      {
        admin_id: adminId,
        face_descriptor: Array.from(descriptor), // ✅ IMPORTANT FIX
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'admin_id'
      }
    );
};

// ✅ ADD THIS
export const getFaceByAdminId = async (adminId) => {
  return await supabase
    .from('admin_face')
    .select('*')
    .eq('admin_id', adminId)
    .maybeSingle();
};