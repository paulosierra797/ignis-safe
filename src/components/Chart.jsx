import React, { useEffect, useMemo, useState } from 'react';
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

const initialOrgData = {
  top: {
    id: 'chief-1',
    name: 'FCINSP Michael John V Escano',
    title: 'Municipal Fire Marshal',
    avatar_url: '/user-avatar.png'
  },
  second: {
    id: 'chief-2',
    name: 'FCINSP Michael John V Escano',
    title: 'Municipal Fire Marshal',
    avatar_url: '/user-avatar.png'
  },
  departments: [
    {
      id: 'admin',
      name: 'FCINSP Michael John V Escano',
      title: 'Administrative Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'personnel-training',
          name: 'FCINSP Michael John V Escano',
          title: 'Personnel and Training Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'records-legal',
          name: 'FCINSP Michael John V Escano',
          title: 'Records and Legal Management Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'morale-welfare',
          name: 'FCINSP Michael John V Escano',
          title: 'Morale and Welfare Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'finance',
          name: 'FCINSP Michael John V Escano',
          title: 'Finance Unit',
          avatar_url: '/user-avatar.png'
        }
      ]
    },
    {
      id: 'fire-safety',
      name: 'FCINSP Michael John V Escano',
      title: 'Fire Safety and Enforcement Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'fire-prevention',
          name: 'FCINSP Michael John V Escano',
          title: 'Fire Prevention Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'community-relations',
          name: 'FCINSP Michael John V Escano',
          title: 'Community Relations Unit',
          avatar_url: '/user-avatar.png'
        }
      ]
    },
    {
      id: 'operations',
      name: 'FCINSP Michael John V Escano',
      title: 'Operations Section',
      avatar_url: '/user-avatar.png',
      units: [
        {
          id: 'comml',
          name: 'FCINSP Michael John V Escano',
          title: 'COMML',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'intelligence',
          name: 'FCINSP Michael John V Escano',
          title: 'Intelligence and Investigation Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'emergency-medical',
          name: 'FCINSP Michael John V Escano',
          title: 'Emergency Medical Services',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'rescue',
          name: 'FCINSP Michael John V Escano',
          title: 'Rescue Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'logistics',
          name: 'FCINSP Michael John V Escano',
          title: 'Logistics Unit',
          avatar_url: '/user-avatar.png'
        },
        {
          id: 'fire-engine',
          name: 'FCINSP Michael John V Escano',
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

const normalizeNode = (node = {}) => {
  const normalized = {
    ...node,
    avatar_url: node.avatar_url || '/user-avatar.png'
  };

  if (Array.isArray(node.units)) {
    normalized.units = node.units.map((unit) => normalizeNode(unit));
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
  return (
    <div className="org-card">
      <img
        src={node.avatar_url || '/user-avatar.png'}
        alt={node.name}
        className="org-avatar"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = '/user-avatar.png';
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
            <label className="org-avatar-upload">
              Add avatar
              <input
                type="file"
                accept="image/*"
                onChange={(event) => onImageChange(node.id, event)}
              />
            </label>
          )}
        </>
      ) : (
        <>
          <p className="org-name">{node.name}</p>
          <p className="org-title">{node.title}</p>
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
          title="Reports"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="chart-header">
          <div>
            <h2>Organizational Chart</h2>
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
