import { supabase } from './supabaseClient';

export const BANNER_PHOTO_BUCKET = 'landing_banner_photos';
export const MAX_BANNER_PHOTOS = 5;

const MAX_SOURCE_IMAGE_SIZE = 12 * 1024 * 1024;
const MAX_OUTPUT_WIDTH = 1600;
const MAX_OUTPUT_HEIGHT = 1200;
const OUTPUT_QUALITY = 0.82;
const ALLOWED_BANNER_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const safeSegment = (value, fallback) => String(value || fallback)
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || fallback;

const loadImageFromFile = (file) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(image);
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('The selected photo could not be opened. Please choose a JPG, PNG, or WebP image.'));
  };

  image.src = objectUrl;
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob) {
      resolve(blob);
      return;
    }
    reject(new Error('The selected photo could not be optimized.'));
  }, 'image/jpeg', OUTPUT_QUALITY);
});

export const optimizeBannerPhoto = async (file) => {
  if (!file) {
    throw new Error('Please choose a banner photo.');
  }

  if (!ALLOWED_BANNER_IMAGE_TYPES.has(file.type)) {
    throw new Error('Please upload a JPG, PNG, or WebP photo.');
  }

  if (file.size > MAX_SOURCE_IMAGE_SIZE) {
    throw new Error('Photo is too large. Please upload an image up to 12MB.');
  }

  const image = await loadImageFromFile(file);
  const widthRatio = MAX_OUTPUT_WIDTH / image.naturalWidth;
  const heightRatio = MAX_OUTPUT_HEIGHT / image.naturalHeight;
  const scale = Math.min(1, widthRatio, heightRatio);
  const outputWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const outputHeight = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Your browser could not prepare this photo for upload.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const blob = await canvasToBlob(canvas);
  const baseName = safeSegment(file.name.replace(/\.[^.]+$/, ''), 'banner-photo');

  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  });
};

export const uploadBannerPhoto = async ({ adminId, file, position }) => {
  try {
    const optimizedFile = await optimizeBannerPhoto(file);
    const ownerFolder = safeSegment(adminId, 'admin');
    const filePath = `${ownerFolder}/${Date.now()}-${createId()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from(BANNER_PHOTO_BUCKET)
      .upload(filePath, optimizedFile, {
        cacheControl: '31536000',
        contentType: optimizedFile.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: { publicUrl } } = supabase.storage
      .from(BANNER_PHOTO_BUCKET)
      .getPublicUrl(filePath);

    return {
      data: {
        id: createId(),
        url: publicUrl,
        path: filePath,
        alt: `Main banner photo ${Number(position || 0) + 1}`,
        fileName: optimizedFile.name,
        size: optimizedFile.size,
        uploadedAt: new Date().toISOString(),
      },
      error: null,
    };
  } catch (error) {
    console.error('Error uploading banner photo:', error);
    return { data: null, error: error.message || 'Failed to upload banner photo.' };
  }
};

export const deleteBannerPhotoPaths = async (paths) => {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))];
  if (uniquePaths.length === 0) return { error: null };

  try {
    const { error } = await supabase.storage
      .from(BANNER_PHOTO_BUCKET)
      .remove(uniquePaths);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting banner photos:', error);
    return { error: error.message || 'Failed to delete removed banner photos.' };
  }
};
