import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './AppDialog.css';
import { useUser } from '../context/UserContext';
import {
  getOrgChartConfig,
  saveOrgChartConfig,
  uploadOrgChartAvatar
} from '../utils/orgChartService';
import { logAdminActivity } from '../utils/usersService';
import './Chart.css';

const LEGACY_AVATAR_PLACEHOLDER_PATH = '/user-avatar.png';
const AVATAR_MAX_SIZE = 5 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_OUTPUT_SIZE = 512;

const loadLocalImage = (sourceUrl) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The selected image could not be opened.'));
  image.src = sourceUrl;
});

const getCropPreviewStyle = ({ imageWidth, imageHeight, zoom, positionX, positionY }) => {
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

const createCroppedAvatarFile = async (crop) => {
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

const buildAvatarPlaceholder = (name = '') => {
  const safeName = String(name || '').trim();
  const initial = safeName ? safeName.charAt(0).toUpperCase() : '?';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="112" height="112" viewBox="0 0 112 112" role="img" aria-label="User avatar placeholder">
      <rect width="112" height="112" rx="56" fill="#e2e8f0" />
      <circle cx="56" cy="42" r="20" fill="#94a3b8" />
      <path d="M20 96c6-18 20-28 36-28s30 10 36 28" fill="#94a3b8" />
      <text x="56" y="102" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="#334155">${initial}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const initialOrgData = {
  top: {
    id: 'chief-1',
    name: 'FCINSP Michael John V Escano',
    title: 'City Fire Marshal',
    avatar_url: '/user-avatar.png'
  },
  second: {
    id: 'chief-2',
    name: 'SFO3 Warlock R Bautista',
    title: 'Deputy City Fire Marshal',
    avatar_url: '/user-avatar.png'
  },
  departments: [
    {
      id: 'admin',
      name: 'SFO3 John Bryan T Anonuevo',
      title: 'Administrative Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'personnel-training',
          name: 'FO3 Jowan P Bergonio',
          title: 'Personnel and Training Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'records-legal',
          name: 'FO2 Marathess I Ramos',
          title: 'Records and Leave Management Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'morale-welfare',
          name: 'FO2 Karen V Lumbres',
          title: 'Morale and Welfare Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'finance',
          name: 'SFO2 Maridae S Cortez',
          title: 'Finance Unit',
          avatar_url: '/user-avatar.png'
        }
      ]
    },
    {
      id: 'fire-safety',
      name: 'SFO2 Gringo I Laloon',
      title: 'Fire Safety and Enforcement Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'fire-prevention',
          name: 'SFO2 Maridae S Cortez',
          title: 'Fire Prevention',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'community-relations',
          name: 'SFO3 John Bryan T Anonuevo',
          title: 'Community Relations Unit',
          avatar_url: '/user-avatar.png'
        }
      ]
    },
    {
      id: 'operations',
      name: 'SFO3 Warlock R Bautista',
      title: 'Chief Operations Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'comml',
          name: 'FO3 Dennis B Gumalal',
          title: 'Chief Comrel',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'intelligence',
          name: 'SFO1 Ephraim C Lauretas',
          title: 'Intelligence and Investigation Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'emergency-medical',
          name: 'SFO3 John Bryan T Anonuevo',
          title: 'Emergency Medical Services',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'logistics',
          name: 'SFO2 Roland C Canteras',
          title: 'Fire Engine Company',
          avatar_url: '/user-avatar.png'
        }
      ]
    }
  ]
};

const updateNode = (node, id, field, value) => {
  if (node.id === id) {
    return { ...node, [field]: value };
  }

  if (node.units) {
    return {
      ...node,
      units: node.units.map((unit) => updateNode(unit, id, field, value))
    };
  }

  return node;
};

const isDeprecatedRescueUnit = (unit = {}) => {
  const unitId = String(unit.id || '').toLowerCase();
  const unitTitle = String(unit.title || '').toLowerCase();
  return unitId === 'rescue' || unitTitle === 'rescue unit';
};

const normalizeNode = (node = {}) => {
  const normalized = {
    ...node,
    avatar_url:
      node.avatar_url && node.avatar_url !== LEGACY_AVATAR_PLACEHOLDER_PATH
        ? node.avatar_url
        : ''
  };

  if (Array.isArray(node.units)) {
    normalized.units = node.units
      .filter((unit) => !isDeprecatedRescueUnit(unit))
      .map((unit) => normalizeNode(unit));
  }

  return normalized;
};

const normalizeOrgData = (data) => {
  if (!data || !data.top || !data.second || !Array.isArray(data.departments)) {
    return initialOrgData;
  }

  return {
    top: normalizeNode(data.top),
    second: normalizeNode(data.second),
    departments: data.departments.map((department) => normalizeNode(department))
  };
};

const applyNodeUpdate = (data, id, field, value) => ({
  ...data,
  top: updateNode(data.top, id, field, value),
  second: updateNode(data.second, id, field, value),
  departments: data.departments.map((dept) => updateNode(dept, id, field, value))
});

const flattenNodes = (data) => {
  const nodes = [data.top, data.second];
  data.departments.forEach((dept) => {
    nodes.push(dept);
    (dept.units || []).forEach((unit) => nodes.push(unit));
  });
  return nodes;
};

// Builds the list of changed fields (name/title/avatar) between the snapshot taken
// when edit mode was entered and the current in-progress edits, so it can be shown
// in the confirmation modal before anything is persisted.
const buildChangeList = (original, current, pendingAvatarFiles) => {
  const originalMap = new Map(flattenNodes(original).map((node) => [node.id, node]));
  const changes = [];

  flattenNodes(current).forEach((node) => {
    const prev = originalMap.get(node.id);
    if (!prev) return;

    if (prev.name !== node.name) {
      changes.push({
        nodeId: node.id,
        field: 'name',
        label: 'Name',
        oldValue: prev.name,
        newValue: node.name
      });
    }

    if (prev.title !== node.title) {
      changes.push({
        nodeId: node.id,
        field: 'title',
        label: 'Position',
        oldValue: prev.title,
        newValue: node.title
      });
    }

    if (pendingAvatarFiles[node.id]) {
      changes.push({
        nodeId: node.id,
        field: 'avatar',
        label: 'Profile Image',
        personName: node.name
      });
    }
  });

  return changes;
};

const buildActivityDetails = (changes) => {
  if (!changes.length) return 'Organizational chart was updated.';

  return changes
    .map((change) => {
      if (change.field === 'avatar') {
        return `Updated profile image for ${change.personName}.`;
      }
      return `${change.label} changed from "${change.oldValue}" to "${change.newValue}".`;
    })
    .join(' ');
};

const buildSuccessSummary = (changes) =>
  changes.map((change) => {
    if (change.field === 'avatar') {
      return {
        headline: 'Profile image updated successfully.',
        detail: `The profile image of ${change.personName} was changed.`
      };
    }
    if (change.field === 'name') {
      return {
        headline: 'Name updated successfully.',
        detail: `${change.oldValue} was changed to ${change.newValue}.`
      };
    }
    return {
      headline: 'Position updated successfully.',
      detail: `${change.oldValue} was changed to ${change.newValue}.`
    };
  });

const OrgCard = ({ node, editMode, canEdit, onChange, onImageChange }) => {
  const fallbackAvatar = useMemo(() => buildAvatarPlaceholder(node.name), [node.name]);
  const fileInputRef = useRef(null);
  const [failedAvatarSrc, setFailedAvatarSrc] = useState(null);
  const preferredAvatarSrc =
    node.avatar_url && node.avatar_url !== LEGACY_AVATAR_PLACEHOLDER_PATH
      ? node.avatar_url
      : fallbackAvatar;
  const avatarSrc = failedAvatarSrc === preferredAvatarSrc
    ? fallbackAvatar
    : preferredAvatarSrc;

  return (
    <div className={`org-card${editMode ? ' org-card-editing' : ''}`}>
      <img
        src={avatarSrc}
        alt={node.name}
        className="org-avatar"
        onError={() => {
          if (preferredAvatarSrc !== fallbackAvatar) {
            setFailedAvatarSrc(preferredAvatarSrc);
          }
        }}
      />
      {editMode ? (
        <>
          <div className="org-edit-fields">
            <label className="org-edit-field">
              <span>Full name</span>
              <input
                className="org-input"
                type="text"
                value={node.name}
                disabled={!canEdit}
                onChange={(event) => onChange(node.id, 'name', event.target.value)}
              />
            </label>
            <label className="org-edit-field">
              <span>Position</span>
              <input
                className="org-input"
                type="text"
                value={node.title}
                disabled={!canEdit}
                onChange={(event) => onChange(node.id, 'title', event.target.value)}
              />
            </label>
          </div>
          {canEdit && (
            <>
              <button
                type="button"
                className="org-avatar-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="org-avatar-upload-icon" aria-hidden="true">+</span>
                {node.avatar_url && node.avatar_url !== LEGACY_AVATAR_PLACEHOLDER_PATH
                  ? 'Change photo'
                  : 'Add photo'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => onImageChange(node.id, event)}
                hidden
              />
            </>
          )}
        </>
      ) : (
        <>
          <p className="org-name" title={node.name} aria-label={node.name}>{node.name}</p>
          <p className="org-title" title={node.title} aria-label={node.title}>{node.title}</p>
        </>
      )}
    </div>
  );
};

const OrgChangeLine = ({ change }) => {
  if (change.field === 'avatar') {
    return (
      <>
        <strong>Profile Image:</strong> Profile image of {change.personName} will be changed.
      </>
    );
  }

  return (
    <>
      <strong>{change.label}:</strong> {change.oldValue || '—'} → {change.newValue || '—'}
    </>
  );
};

export default function Chart() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [orgData, setOrgData] = useState(initialOrgData);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [lastEditedAt, setLastEditedAt] = useState(null);
  const [pendingAvatarFiles, setPendingAvatarFiles] = useState({});
  const [avatarPreviewUrls, setAvatarPreviewUrls] = useState({});
  const [avatarCrop, setAvatarCrop] = useState(null);
  const [isApplyingCrop, setIsApplyingCrop] = useState(false);
  const [pendingChanges, setPendingChanges] = useState([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [successSummary, setSuccessSummary] = useState(null);
  const [errorInfo, setErrorInfo] = useState(null);
  const [hasPendingManualNavigation, setHasPendingManualNavigation] = useState(false);
  const editSnapshotRef = useRef(null);
  const activeCropUrlRef = useRef(null);
  const pendingManualNavigationRef = useRef(null);
  const bypassNavigationRef = useRef(false);
  const { currentUser } = useUser();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const currentChanges = useMemo(
    () => editMode
      ? buildChangeList(editSnapshotRef.current || orgData, orgData, pendingAvatarFiles)
      : [],
    [editMode, orgData, pendingAvatarFiles]
  );
  const isDirty = editMode && currentChanges.length > 0;

  const shouldBlockNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassNavigationRef.current) {
      bypassNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;

    return isDirty && currentPath !== nextPath;
  }, [isDirty]);

  const blocker = useBlocker(shouldBlockNavigation);
  const hasPendingNavigation = hasPendingManualNavigation || blocker.state === 'blocked';

  const lastEditLabel = useMemo(() => {
    if (!lastEditedAt) {
      return 'Not yet saved';
    }

    return new Date(lastEditedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }, [lastEditedAt]);

  useEffect(() => {
    const loadChartConfig = async () => {
      setIsLoadingChart(true);

      const { data, updatedAt, error } = await getOrgChartConfig();
      if (error) {
        console.error(error);
        setIsLoadingChart(false);
        return;
      }

      if (data) {
        setOrgData(normalizeOrgData(data));
      }

      if (updatedAt) {
        setLastEditedAt(updatedAt);
      }

      setIsLoadingChart(false);
    };

    loadChartConfig();
  }, []);

  useEffect(() => {
    if (!isDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (blocker.state === 'blocked') {
      setIsConfirmModalOpen(false);
      setPendingChanges([]);
    }
  }, [blocker.state]);

  useEffect(() => {
    return () => {
      Object.values(avatarPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
      if (activeCropUrlRef.current) {
        URL.revokeObjectURL(activeCropUrlRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!avatarCrop) {
      return undefined;
    }

    const handleCropEscape = (event) => {
      if (event.key !== 'Escape' || isApplyingCrop) return;
      if (activeCropUrlRef.current) {
        URL.revokeObjectURL(activeCropUrlRef.current);
        activeCropUrlRef.current = null;
      }
      setAvatarCrop(null);
    };

    window.addEventListener('keydown', handleCropEscape);
    return () => window.removeEventListener('keydown', handleCropEscape);
  }, [avatarCrop, isApplyingCrop]);

  const clearPendingAvatars = () => {
    Object.values(avatarPreviewUrls).forEach((url) => URL.revokeObjectURL(url));
    setAvatarPreviewUrls({});
    setPendingAvatarFiles({});
  };

  const persistChart = async (chartData, activityDetails = 'Organizational chart was updated.') => {
    const { updatedAt, error } = await saveOrgChartConfig(chartData, currentUser?.admin_id || null);

    if (error) {
      console.error(error);
      return false;
    }

    if (updatedAt) {
      setLastEditedAt(updatedAt);
    }

    await logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Organizational Chart Updated',
      actionType: 'edit',
      details: activityDetails,
      metadata: {
        page: 'chart',
        updated_at: updatedAt || new Date().toISOString()
      }
    });

    return true;
  };

  const handleUpdate = (id, field, value) => {
    if (!isAdmin) {
      return;
    }

    setOrgData((prev) => applyNodeUpdate(prev, id, field, value));
  };

  const handleEditToggle = () => {
    if (!isAdmin || isSaving) {
      return;
    }

    if (!editMode) {
      editSnapshotRef.current = orgData;
      setEditMode(true);
      return;
    }

    const changes = buildChangeList(editSnapshotRef.current || orgData, orgData, pendingAvatarFiles);

    if (changes.length === 0) {
      setEditMode(false);
      editSnapshotRef.current = null;
      return;
    }

    setPendingChanges(changes);
    setIsConfirmModalOpen(true);
  };

  const handleCancelConfirm = () => {
    if (isSaving) return;
    setIsConfirmModalOpen(false);
  };

  const saveChartChanges = async (changes) => {
    let finalData = orgData;

    for (const [nodeId, file] of Object.entries(pendingAvatarFiles)) {
      const { data: imageUrl, error } = await uploadOrgChartAvatar(
        nodeId,
        file,
        currentUser?.admin_id || 'admin'
      );

      if (error) {
        throw new Error(error);
      }

      finalData = applyNodeUpdate(finalData, nodeId, 'avatar_url', imageUrl);
    }

    const saved = await persistChart(finalData, buildActivityDetails(changes));

    if (!saved) {
      throw new Error('Failed to save organizational chart changes.');
    }

    return finalData;
  };

  const clearEditSession = (finalData) => {
    setOrgData(finalData);
    clearPendingAvatars();
    setEditMode(false);
    editSnapshotRef.current = null;
    setIsConfirmModalOpen(false);
    setPendingChanges([]);
  };

  const runManualNavigation = (navigation) => {
    bypassNavigationRef.current = true;

    try {
      const actionResult = navigation.action();
      Promise.resolve(actionResult).finally(() => {
        bypassNavigationRef.current = false;
      });
    } catch (error) {
      bypassNavigationRef.current = false;
      throw error;
    }
  };

  const resumePendingNavigation = () => {
    const manualNavigation = pendingManualNavigationRef.current;
    pendingManualNavigationRef.current = null;
    setHasPendingManualNavigation(false);

    if (manualNavigation) {
      if (blocker.state === 'blocked') {
        blocker.reset();
      }
      runManualNavigation(manualNavigation);
      return;
    }

    if (blocker.state === 'blocked') {
      blocker.proceed();
    }
  };

  const handleHeaderNavigationRequest = (navigation) => {
    if (!isDirty) {
      navigation.action();
      return;
    }

    if (pendingManualNavigationRef.current || blocker.state === 'blocked') {
      return;
    }

    pendingManualNavigationRef.current = navigation;
    setHasPendingManualNavigation(true);
    setIsConfirmModalOpen(false);
    setPendingChanges([]);
  };

  const handleCancelNavigation = () => {
    if (isSaving) return;

    pendingManualNavigationRef.current = null;
    setHasPendingManualNavigation(false);

    if (blocker.state === 'blocked') {
      blocker.reset();
    }
  };

  const discardEditSession = () => {
    if (editSnapshotRef.current) {
      setOrgData(editSnapshotRef.current);
    }
    clearPendingAvatars();
    setEditMode(false);
    editSnapshotRef.current = null;
    setIsConfirmModalOpen(false);
    setPendingChanges([]);
  };

  const handleLeaveWithoutSaving = () => {
    if (isSaving) return;
    discardEditSession();
    resumePendingNavigation();
  };

  const handleSaveAndContinue = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const changes = currentChanges;
      const finalData = await saveChartChanges(changes);
      clearEditSession(finalData);
      resumePendingNavigation();
    } catch (error) {
      console.error(error);
      setErrorInfo({
        message: 'Failed to save organizational chart changes. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);

    try {
      const changes = pendingChanges.length > 0 ? pendingChanges : currentChanges;
      const finalData = await saveChartChanges(changes);
      clearEditSession(finalData);
      setSuccessSummary(buildSuccessSummary(changes));
    } catch (error) {
      console.error(error);
      setIsConfirmModalOpen(false);
      setErrorInfo({
        message: 'Failed to save organizational chart changes. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const closeAvatarCrop = () => {
    if (isApplyingCrop) return;
    if (activeCropUrlRef.current) {
      URL.revokeObjectURL(activeCropUrlRef.current);
      activeCropUrlRef.current = null;
    }
    setAvatarCrop(null);
  };

  const handleAvatarSelect = async (id, event) => {
    if (!isAdmin) {
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      setErrorInfo({ message: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, or WebP).' });
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      setErrorInfo({ message: 'File size exceeds 5MB. Please upload a smaller image.' });
      return;
    }

    const sourceUrl = URL.createObjectURL(file);

    try {
      const image = await loadLocalImage(sourceUrl);
      activeCropUrlRef.current = sourceUrl;
      setAvatarCrop({
        nodeId: id,
        file,
        sourceUrl,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        zoom: 1,
        positionX: 0,
        positionY: 0
      });
    } catch (imageError) {
      URL.revokeObjectURL(sourceUrl);
      setErrorInfo({ message: imageError?.message || 'The selected image could not be opened.' });
    }
  };

  const updateAvatarCrop = (field, value) => {
    setAvatarCrop((current) => current ? { ...current, [field]: Number(value) } : current);
  };

  const resetAvatarCrop = () => {
    setAvatarCrop((current) => current ? {
      ...current,
      zoom: 1,
      positionX: 0,
      positionY: 0
    } : current);
  };

  const handleApplyAvatarCrop = async () => {
    if (!avatarCrop || isApplyingCrop) return;
    setIsApplyingCrop(true);

    try {
      const croppedFile = await createCroppedAvatarFile(avatarCrop);
      const previewUrl = URL.createObjectURL(croppedFile);

      setAvatarPreviewUrls((prev) => {
        if (prev[avatarCrop.nodeId]) {
          URL.revokeObjectURL(prev[avatarCrop.nodeId]);
        }
        return { ...prev, [avatarCrop.nodeId]: previewUrl };
      });

      setPendingAvatarFiles((prev) => ({
        ...prev,
        [avatarCrop.nodeId]: croppedFile
      }));

      if (activeCropUrlRef.current) {
        URL.revokeObjectURL(activeCropUrlRef.current);
        activeCropUrlRef.current = null;
      }
      setAvatarCrop(null);
    } catch (cropError) {
      setErrorInfo({ message: cropError?.message || 'The avatar could not be cropped.' });
    } finally {
      setIsApplyingCrop(false);
    }
  };

  const withPreview = (node) =>
    avatarPreviewUrls[node.id] ? { ...node, avatar_url: avatarPreviewUrls[node.id] } : node;

  return (
    <div className="chart-container">
      <Sidebar onNavigationRequest={handleHeaderNavigationRequest} />

      <div className="chart-main">
        <PageHeader
          title="Organizational Chart"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onNavigationRequest={handleHeaderNavigationRequest}
        />

        <div className="chart-header">
          <div>

            <p className="chart-subtitle">Last edit: {lastEditLabel}</p>
          </div>
          <button
            className="chart-edit-btn"
            disabled={!isAdmin || isSaving || isLoadingChart}
            onClick={handleEditToggle}
          >
            {isSaving ? 'Saving...' : editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        <div className="org-chart">
          {isLoadingChart && <p className="chart-loading">Loading chart...</p>}
          <div className="org-level">
            <OrgCard
              node={withPreview(orgData.top)}
              editMode={editMode}
              canEdit={isAdmin}
              onChange={handleUpdate}
              onImageChange={handleAvatarSelect}
            />
          </div>

          <div className="org-connector vertical" />

          <div className="org-level">
            <OrgCard
              node={withPreview(orgData.second)}
              editMode={editMode}
              canEdit={isAdmin}
              onChange={handleUpdate}
              onImageChange={handleAvatarSelect}
            />
          </div>

          <div className="org-connector vertical" />
          <div className="org-connector horizontal" />

          <div className="org-columns">
            {orgData.departments.map((department) => (
              <div className="org-column" key={department.id}>
                <OrgCard
                  node={withPreview(department)}
                  editMode={editMode}
                  canEdit={isAdmin}
                  onChange={handleUpdate}
                  onImageChange={handleAvatarSelect}
                />
                <div className="org-connector vertical short" />
                <div className="org-subunits">
                  {department.units.map((unit) => (
                    <OrgCard
                      key={unit.id}
                      node={withPreview(unit)}
                      editMode={editMode}
                      canEdit={isAdmin}
                      onChange={handleUpdate}
                      onImageChange={handleAvatarSelect}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {avatarCrop && !errorInfo && (
        <div
          className="org-modal-overlay org-crop-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orgCropTitle"
          aria-describedby="orgCropDescription"
        >
          <div className="org-modal org-crop-modal">
            <div className="org-crop-heading">
              <div>
                <p className="org-crop-kicker">Profile photo</p>
                <h3 id="orgCropTitle" className="org-modal-title">Crop and resize</h3>
              </div>
              <span className="org-crop-output">512 × 512</span>
            </div>

            <p id="orgCropDescription" className="org-modal-message org-crop-message">
              Adjust the zoom and position so the face fits naturally inside the circular guide.
            </p>

            <div className="org-crop-workspace">
              <div className="org-crop-preview" aria-label="Circular avatar crop preview">
                <img
                  src={avatarCrop.sourceUrl}
                  alt="Selected profile crop preview"
                  className="org-crop-image"
                  style={getCropPreviewStyle(avatarCrop)}
                  draggable="false"
                />
                <div className="org-crop-guide" aria-hidden="true" />
              </div>

              <div className="org-crop-controls">
                <label className="org-crop-control">
                  <span>
                    <strong>Zoom</strong>
                    <output>{Math.round(avatarCrop.zoom * 100)}%</output>
                  </span>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.05"
                    value={avatarCrop.zoom}
                    onChange={(event) => updateAvatarCrop('zoom', event.target.value)}
                    disabled={isApplyingCrop}
                  />
                </label>

                <label className="org-crop-control">
                  <span>
                    <strong>Horizontal position</strong>
                    <output>{Math.round(avatarCrop.positionX)}</output>
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={avatarCrop.positionX}
                    onChange={(event) => updateAvatarCrop('positionX', event.target.value)}
                    disabled={isApplyingCrop}
                  />
                </label>

                <label className="org-crop-control">
                  <span>
                    <strong>Vertical position</strong>
                    <output>{Math.round(avatarCrop.positionY)}</output>
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="1"
                    value={avatarCrop.positionY}
                    onChange={(event) => updateAvatarCrop('positionY', event.target.value)}
                    disabled={isApplyingCrop}
                  />
                </label>

                <button
                  type="button"
                  className="org-crop-reset"
                  onClick={resetAvatarCrop}
                  disabled={isApplyingCrop}
                >
                  Reset crop
                </button>
              </div>
            </div>

            <div className="org-modal-actions org-crop-actions">
              <button
                type="button"
                className="org-modal-btn org-modal-btn-cancel"
                onClick={closeAvatarCrop}
                disabled={isApplyingCrop}
              >
                Cancel
              </button>
              <button
                type="button"
                className="org-modal-btn org-modal-btn-save"
                onClick={handleApplyAvatarCrop}
                disabled={isApplyingCrop}
              >
                {isApplyingCrop ? 'Applying...' : 'Use Photo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {hasPendingNavigation && !errorInfo && (
        <div
          className="org-modal-overlay app-unsaved-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orgUnsavedTitle"
          aria-describedby="orgUnsavedDescription"
        >
          <div className="org-modal org-unsaved-modal app-unsaved-dialog">
            <div
              className="org-modal-icon org-modal-icon-warning app-unsaved-icon"
              aria-hidden="true"
            >
              !
            </div>
            <h3 id="orgUnsavedTitle" className="org-modal-title app-unsaved-title">
              Unsaved Organizational Chart Changes
            </h3>
            <p id="orgUnsavedDescription" className="org-modal-message app-unsaved-message">
              You have unsaved changes in the Organizational Chart. What would you like to do before leaving this page?
            </p>

            <div className="org-modal-actions org-unsaved-actions app-unsaved-actions">
              <button
                type="button"
                className="org-modal-btn org-modal-btn-save app-unsaved-button app-unsaved-button--save"
                onClick={handleSaveAndContinue}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save and Continue'}
              </button>
              <button
                type="button"
                className="org-modal-btn org-modal-btn-leave app-unsaved-button app-unsaved-button--discard"
                onClick={handleLeaveWithoutSaving}
                disabled={isSaving}
              >
                Leave Without Saving
              </button>
              <button
                type="button"
                className="org-modal-btn org-modal-btn-cancel app-unsaved-button app-unsaved-button--cancel"
                onClick={handleCancelNavigation}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmModalOpen && !hasPendingNavigation && !errorInfo && (
        <div className="org-modal-overlay" role="dialog" aria-modal="true">
          <div className="org-modal org-confirm-modal">
            <h3 className="org-modal-title">Confirm Organizational Chart Changes</h3>
            <p className="org-modal-subtitle">Are you sure you want to save the following changes?</p>

            <ul className="org-change-list">
              {pendingChanges.map((change, index) => (
                <li className="org-change-item" key={`${change.nodeId}-${change.field}-${index}`}>
                  <OrgChangeLine change={change} />
                </li>
              ))}
            </ul>

            <div className="org-modal-actions">
              <button
                type="button"
                className="org-modal-btn org-modal-btn-cancel"
                onClick={handleCancelConfirm}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="org-modal-btn org-modal-btn-save"
                onClick={handleConfirmSave}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {successSummary && !hasPendingNavigation && !errorInfo && (
        <div className="org-modal-overlay" role="dialog" aria-modal="true">
          <div className="org-modal org-result-modal">
            <div className="org-modal-icon org-modal-icon-success">✓</div>

            {successSummary.length > 1 ? (
              <>
                <h3 className="org-modal-title">Organizational Chart Updated Successfully</h3>
                <ul className="org-change-list org-summary-list">
                  {successSummary.map((item, index) => (
                    <li className="org-change-item" key={index}>
                      <strong>{item.headline}</strong>
                      <span className="org-change-detail">{item.detail}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h3 className="org-modal-title">{successSummary[0]?.headline}</h3>
                <p className="org-modal-message">{successSummary[0]?.detail}</p>
              </>
            )}

            <button
              type="button"
              className="org-modal-btn org-modal-btn-save"
              onClick={() => setSuccessSummary(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {errorInfo && (
        <div className="org-modal-overlay" role="dialog" aria-modal="true">
          <div className="org-modal org-result-modal">
            <div className="org-modal-icon org-modal-icon-error">!</div>
            <h3 className="org-modal-title">Save Failed</h3>
            <p className="org-modal-message">{errorInfo.message}</p>
            <button
              type="button"
              className="org-modal-btn org-modal-btn-save"
              onClick={() => setErrorInfo(null)}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
