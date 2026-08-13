export const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
export const AVATAR_OUTPUT_SIZE = 512;

export const loadLocalImage = (sourceUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The selected image could not be opened.'));
  image.src = sourceUrl;
});

export const getCropPreviewStyle = ({ imageWidth, imageHeight, zoom, positionX, positionY }) => {
  const aspectRatio = imageWidth / imageHeight;
  const baseWidth = aspectRatio >= 1 ? aspectRatio * 100 : 100;
  const baseHeight = aspectRatio >= 1 ? 100 : (1 / aspectRatio) * 100;
  const renderedWidth = baseWidth * zoom;
  const renderedHeight = baseHeight * zoom;
  const maxShiftX = Math.max(0, (renderedWidth - 100) / 2);
  const maxShiftY = Math.max(0, (renderedHeight - 100) / 2);

  return {
    width: `${renderedWidth}%`,
    height: `${renderedHeight}%`,
    left: `${50 + (positionX / 100) * maxShiftX}%`,
    top: `${50 + (positionY / 100) * maxShiftY}%`
  };
};

export const createCroppedAvatarFile = async (crop) => {
  const image = await loadLocalImage(crop.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_OUTPUT_SIZE;
  canvas.height = AVATAR_OUTPUT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Image cropping is not supported by this browser.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE);

  const baseScale = Math.max(
    AVATAR_OUTPUT_SIZE / image.naturalWidth,
    AVATAR_OUTPUT_SIZE / image.naturalHeight
  );
  const scale = baseScale * crop.zoom;
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const maxShiftX = Math.max(0, (renderedWidth - AVATAR_OUTPUT_SIZE) / 2);
  const maxShiftY = Math.max(0, (renderedHeight - AVATAR_OUTPUT_SIZE) / 2);
  const drawX = (AVATAR_OUTPUT_SIZE - renderedWidth) / 2 + (crop.positionX / 100) * maxShiftX;
  const drawY = (AVATAR_OUTPUT_SIZE - renderedHeight) / 2 + (crop.positionY / 100) * maxShiftY;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, drawX, drawY, renderedWidth, renderedHeight);

  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });

  if (!blob) {
    throw new Error('The cropped image could not be created.');
  }

  const originalName = crop.file.name.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${originalName}-cropped.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now()
  });
};
