import { supabase } from './supabaseClient';

/**
 * Upload a profile image to Supabase Storage
 * @param {string} userId - The admin_id of the user
 * @param {File} file - The image file to upload
 * @returns {Object} - { data: publicUrl, error }
 */
export const uploadProfileImage = async (userId, file) => {
  try {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return { 
        data: null, 
        error: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, or WebP).' 
      };
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      return { 
        data: null, 
        error: 'File size exceeds 5MB. Please upload a smaller image.' 
      };
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}-${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('profile_pic')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Error uploading image:', uploadError);
      return { data: null, error: uploadError.message };
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('profile_pic')
      .getPublicUrl(filePath);

    // Update user profile with image URL
    const { error: updateError } = await supabase
      .from('admin')
      .update({ avatar_url: publicUrl })
      .eq('admin_id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return { data: null, error: updateError.message };
    }

    return { data: publicUrl, error: null };
  } catch (error) {
    console.error('Error in uploadProfileImage:', error);
    return { data: null, error: error.message };
  }
};

/**
 * Delete a profile image from Supabase Storage
 * @param {string} imageUrl - The full URL of the image to delete
 * @returns {Object} - { data, error }
 */
export const deleteProfileImage = async (imageUrl) => {
  try {
    // Extract the file path from the URL
    const urlParts = imageUrl.split('/profile_pic/');
    if (urlParts.length < 2) {
      return { data: null, error: 'Invalid image URL' };
    }

    const filePath = urlParts[1];

    // Delete from storage
    const { data, error } = await supabase.storage
      .from('profile_pic')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting image:', error);
      return { data: null, error: error.message };
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error in deleteProfileImage:', error);
    return { data: null, error: error.message };
  }
};

/**
 * Update profile image for a user
 * @param {string} userId - The admin_id of the user
 * @param {File} newFile - The new image file
 * @param {string} oldImageUrl - The URL of the old image (optional)
 * @returns {Object} - { data: publicUrl, error }
 */
export const updateProfileImage = async (userId, newFile, oldImageUrl = null) => {
  try {
    // Delete old image if it exists
    if (oldImageUrl) {
      await deleteProfileImage(oldImageUrl);
    }

    // Upload new image
    return await uploadProfileImage(userId, newFile);
  } catch (error) {
    console.error('Error in updateProfileImage:', error);
    return { data: null, error: error.message };
  }
};
