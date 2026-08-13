import { useEffect, useRef, useState } from 'react';
import {
  loadLocalImage,
  getCropPreviewStyle,
  createCroppedAvatarFile
} from '../utils/avatarCrop';
import './AvatarCropModal.css';

export default function AvatarCropModal({ file, onCancel, onApply, onError, theme }) {
  const [crop, setCrop] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const sourceUrlRef = useRef(null);

  const revokeSourceUrl = () => {
    if (sourceUrlRef.current) {
      URL.revokeObjectURL(sourceUrlRef.current);
      sourceUrlRef.current = null;
    }
  };

  useEffect(() => {
    revokeSourceUrl();

    if (!file) {
      setCrop(null);
      return undefined;
    }

    let cancelled = false;
    const sourceUrl = URL.createObjectURL(file);
    sourceUrlRef.current = sourceUrl;

    loadLocalImage(sourceUrl)
      .then((image) => {
        if (cancelled) return;
        setCrop({
          sourceUrl,
          imageWidth: image.naturalWidth,
          imageHeight: image.naturalHeight,
          zoom: 1,
          positionX: 0,
          positionY: 0
        });
      })
      .catch((error) => {
        if (cancelled) return;
        revokeSourceUrl();
        onError?.(error?.message || 'The selected image could not be opened.');
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  useEffect(() => () => revokeSourceUrl(), []);

  useEffect(() => {
    if (!crop) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || isApplying) return;
      handleCancel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, isApplying]);

  if (!file || !crop) return null;

  const updateCrop = (field, value) => {
    setCrop((current) => (current ? { ...current, [field]: Number(value) } : current));
  };

  const resetCrop = () => {
    setCrop((current) => (current ? { ...current, zoom: 1, positionX: 0, positionY: 0 } : current));
  };

  const handleCancel = () => {
    if (isApplying) return;
    revokeSourceUrl();
    setCrop(null);
    onCancel?.();
  };

  const handleApply = async () => {
    if (!crop || isApplying) return;
    setIsApplying(true);
    try {
      const croppedFile = await createCroppedAvatarFile({ ...crop, file });
      revokeSourceUrl();
      setCrop(null);
      onApply?.(croppedFile);
    } catch (error) {
      onError?.(error?.message || 'The avatar could not be cropped.');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className={`avatar-crop-overlay${theme === 'admin' ? ' avatar-crop-admin' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatarCropTitle"
      aria-describedby="avatarCropDescription"
    >
      <div className="avatar-crop-modal">
        <div className="avatar-crop-heading">
          <div>
            <p className="avatar-crop-kicker">Profile photo</p>
            <h3 id="avatarCropTitle" className="avatar-crop-title">Crop and resize</h3>
          </div>
          <span className="avatar-crop-output">512 × 512</span>
        </div>

        <p id="avatarCropDescription" className="avatar-crop-message">
          Adjust the zoom and position so the face fits naturally inside the circular guide.
        </p>

        <div className="avatar-crop-workspace">
          <div className="avatar-crop-preview" aria-label="Circular avatar crop preview">
            <img
              src={crop.sourceUrl}
              alt="Selected profile crop preview"
              className="avatar-crop-image"
              style={getCropPreviewStyle(crop)}
              draggable="false"
            />
            <div className="avatar-crop-guide" aria-hidden="true" />
          </div>

          <div className="avatar-crop-controls">
            <label className="avatar-crop-control">
              <span>
                <strong>Zoom</strong>
                <output>{Math.round(crop.zoom * 100)}%</output>
              </span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={crop.zoom}
                onChange={(event) => updateCrop('zoom', event.target.value)}
                disabled={isApplying}
              />
            </label>

            <label className="avatar-crop-control">
              <span>
                <strong>Horizontal position</strong>
                <output>{Math.round(crop.positionX)}</output>
              </span>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={crop.positionX}
                onChange={(event) => updateCrop('positionX', event.target.value)}
                disabled={isApplying}
              />
            </label>

            <label className="avatar-crop-control">
              <span>
                <strong>Vertical position</strong>
                <output>{Math.round(crop.positionY)}</output>
              </span>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={crop.positionY}
                onChange={(event) => updateCrop('positionY', event.target.value)}
                disabled={isApplying}
              />
            </label>

            <button
              type="button"
              className="avatar-crop-reset"
              onClick={resetCrop}
              disabled={isApplying}
            >
              Reset crop
            </button>
          </div>
        </div>

        <div className="avatar-crop-actions">
          <button
            type="button"
            className="avatar-crop-btn avatar-crop-btn-cancel"
            onClick={handleCancel}
            disabled={isApplying}
          >
            Cancel
          </button>
          <button
            type="button"
            className="avatar-crop-btn avatar-crop-btn-save"
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying ? 'Applying...' : 'Use Photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
