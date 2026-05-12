import React, { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { useUser } from '../context/UserContext';
import {
  getOrgChartConfig,
  saveOrgChartConfig,
  uploadOrgChartAvatar
} from '../utils/orgChartService';
import { logAdminActivity } from '../utils/usersService';
import './Chart.css';

const LEGACY_AVATAR_PLACEHOLDER_PATH = '/user-avatar.png';

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

const OrgCard = ({ node, editMode, canEdit, onChange, onImageChange }) => {
  const fallbackAvatar = useMemo(() => buildAvatarPlaceholder(node.name), [node.name]);
  const fileInputRef = useRef(null);
  const [avatarSrc, setAvatarSrc] = useState(
    node.avatar_url && node.avatar_url !== LEGACY_AVATAR_PLACEHOLDER_PATH
      ? node.avatar_url
      : fallbackAvatar
  );

  useEffect(() => {
    setAvatarSrc(
      node.avatar_url && node.avatar_url !== LEGACY_AVATAR_PLACEHOLDER_PATH
        ? node.avatar_url
        : fallbackAvatar
    );
  }, [node.avatar_url, fallbackAvatar]);

  return (
    <div className="org-card">
      <img
        src={avatarSrc}
        alt={node.name}
        className="org-avatar"
        onError={() => {
          setAvatarSrc((current) => (current === fallbackAvatar ? current : fallbackAvatar));
        }}
      />
      {editMode ? (
        <>
          <input
            className="org-input"
            type="text"
            value={node.name}
            disabled={!canEdit}
            onChange={(event) => onChange(node.id, 'name', event.target.value)}
          />
          <input
            className="org-input"
            type="text"
            value={node.title}
            disabled={!canEdit}
            onChange={(event) => onChange(node.id, 'title', event.target.value)}
          />
          {canEdit && (
            <>
              <button
                type="button"
                className="org-avatar-upload"
                onClick={() => fileInputRef.current?.click()}
              >
                Add avatar
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

export default function Chart() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [orgData, setOrgData] = useState(initialOrgData);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingChart, setIsLoadingChart] = useState(true);
  const [lastEditedAt, setLastEditedAt] = useState(null);
  const { currentUser } = useUser();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

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

  const persistChart = async (chartData, activityDetails = 'Organizational chart was updated.') => {
    setIsSaving(true);
    const { updatedAt, error } = await saveOrgChartConfig(chartData, currentUser?.admin_id || null);
    setIsSaving(false);

    if (error) {
      alert(`Failed to save chart: ${error}`);
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

  const handleEditToggle = async () => {
    if (!isAdmin || isSaving) {
      return;
    }

    if (!editMode) {
      setEditMode(true);
      return;
    }

    const saved = await persistChart(orgData, 'Saved manual edits to organizational chart structure.');
    if (saved) {
      setEditMode(false);
    }
  };

  const handleAvatarUpload = async (id, event) => {
    if (!isAdmin) {
      return;
    }

    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const { data: imageUrl, error } = await uploadOrgChartAvatar(
      id,
      file,
      currentUser?.admin_id || 'admin'
    );

    if (error) {
      alert(`Failed to upload avatar: ${error}`);
      return;
    }

    const nextData = applyNodeUpdate(orgData, id, 'avatar_url', imageUrl);
    setOrgData(nextData);
    await persistChart(nextData, `Updated avatar image for chart node: ${id}.`);
    event.target.value = '';
  };

  return (
    <div className="chart-container">
      <Sidebar />

      <div className="chart-main">
        <PageHeader
          title="Organizational Chart"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
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
              node={orgData.top}
              editMode={editMode}
              canEdit={isAdmin}
              onChange={handleUpdate}
              onImageChange={handleAvatarUpload}
            />
          </div>

          <div className="org-connector vertical" />

          <div className="org-level">
            <OrgCard
              node={orgData.second}
              editMode={editMode}
              canEdit={isAdmin}
              onChange={handleUpdate}
              onImageChange={handleAvatarUpload}
            />
          </div>

          <div className="org-connector vertical" />
          <div className="org-connector horizontal" />

          <div className="org-columns">
            {orgData.departments.map((department) => (
              <div className="org-column" key={department.id}>
                <OrgCard
                  node={department}
                  editMode={editMode}
                  canEdit={isAdmin}
                  onChange={handleUpdate}
                  onImageChange={handleAvatarUpload}
                />
                <div className="org-connector vertical short" />
                <div className="org-subunits">
                  {department.units.map((unit) => (
                    <OrgCard
                      key={unit.id}
                      node={unit}
                      editMode={editMode}
                      canEdit={isAdmin}
                      onChange={handleUpdate}
                      onImageChange={handleAvatarUpload}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
