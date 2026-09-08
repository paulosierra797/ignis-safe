import React, { useMemo, useState } from 'react';
import { FaSearch, FaTimes } from 'react-icons/fa';
import { formatStatusLabel } from '../utils/statusUtils';
import './PersonnelPicker.css';

const isActiveStatus = (status) => String(status || '').toLowerCase() === 'active';

const getInitials = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((word) => word.charAt(0).toUpperCase())
  .join('') || 'P';

export default function PersonnelPicker({
  id,
  personnel = [],
  selectedIds = [],
  onChange,
  error = '',
  disabled = false
}) {
  const [search, setSearch] = useState('');

  const personnelById = useMemo(() => {
    const map = new Map();
    personnel.forEach((person) => map.set(person.admin_id, person));
    return map;
  }, [personnel]);

  const sortedPersonnel = useMemo(() => {
    return [...personnel].sort((left, right) => {
      const leftActive = isActiveStatus(left.status);
      const rightActive = isActiveStatus(right.status);
      if (leftActive !== rightActive) return leftActive ? -1 : 1;
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
  }, [personnel]);

  const filteredPersonnel = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedPersonnel;
    return sortedPersonnel.filter((person) => (
      [person.name, person.email, person.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    ));
  }, [sortedPersonnel, search]);

  const selectedPersonnel = useMemo(
    () => selectedIds.map((selectedId) => personnelById.get(selectedId)).filter(Boolean),
    [selectedIds, personnelById]
  );

  const visibleActiveIds = useMemo(
    () => filteredPersonnel.filter((person) => isActiveStatus(person.status)).map((person) => person.admin_id),
    [filteredPersonnel]
  );

  const allVisibleSelected = visibleActiveIds.length > 0
    && visibleActiveIds.every((personId) => selectedIds.includes(personId));

  const togglePersonnel = (personId) => {
    if (disabled) return;
    const next = selectedIds.includes(personId)
      ? selectedIds.filter((existingId) => existingId !== personId)
      : [...selectedIds, personId];
    onChange(next);
  };

  const handleToggleVisible = () => {
    if (disabled) return;
    if (allVisibleSelected) {
      onChange(selectedIds.filter((existingId) => !visibleActiveIds.includes(existingId)));
    } else {
      onChange(Array.from(new Set([...selectedIds, ...visibleActiveIds])));
    }
  };

  const handleClear = () => {
    if (disabled) return;
    onChange([]);
  };

  const handleRemove = (personId) => {
    if (disabled) return;
    onChange(selectedIds.filter((existingId) => existingId !== personId));
  };

  return (
    <div
      id={id}
      className={`personnel-picker-two-col ${disabled ? 'is-disabled' : ''} ${error ? 'has-error' : ''}`}
    >
      <div className="personnel-picker-left">
        <label className="personnel-picker-search">
          <FaSearch aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search personnel by name or rank..."
            disabled={disabled}
          />
        </label>

        <div className="personnel-picker-toolbar">
          <div className="personnel-picker-toolbar-actions">
            <button
              type="button"
              onClick={handleToggleVisible}
              disabled={disabled || !visibleActiveIds.length}
            >
              {allVisibleSelected ? 'Deselect Results' : 'Select Results'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled || !selectedIds.length}
            >
              Clear
            </button>
          </div>
        </div>

        <div className="personnel-picker-list-meta">
          <span>
            {search.trim()
              ? `${filteredPersonnel.length} of ${personnel.length} personnel`
              : `${personnel.length} personnel`}
          </span>
          <strong>{selectedIds.length} selected</strong>
        </div>

        <div className="personnel-picker-checkbox-list" role="listbox" aria-multiselectable="true">
          {filteredPersonnel.length === 0 ? (
            <div className="personnel-picker-empty">No personnel match your search.</div>
          ) : (
            filteredPersonnel.map((person) => {
              const active = isActiveStatus(person.status);
              const checked = selectedIds.includes(person.admin_id);

              return (
                <label
                  key={person.admin_id}
                  className={`personnel-picker-checkbox-item${checked ? ' is-selected' : ''}${!active ? ' is-unavailable' : ''}`}
                  role="option"
                  aria-selected={checked}
                >
                  <input
                    type="checkbox"
                    className="personnel-picker-checkbox-input"
                    checked={checked}
                    disabled={disabled || !active}
                    onChange={() => togglePersonnel(person.admin_id)}
                  />
                  <span className="personnel-picker-avatar" aria-hidden="true">
                    {getInitials(person.name)}
                  </span>
                  <span className="personnel-picker-checkbox-info">
                    <span className="personnel-picker-checkbox-identity">
                      <span className="personnel-picker-checkbox-name">{person.name}</span>
                      <small>{person.email || 'No email available'}</small>
                    </span>
                    <span className={`personnel-picker-status-badge ${active ? 'is-active' : 'is-inactive'}`}>
                      {formatStatusLabel(person.status)}
                    </span>
                  </span>
                </label>
              );
            })
          )}
        </div>
      </div>

      <aside className="personnel-picker-right">
        <div className="personnel-picker-right-header">
          <h5>Selected Personnel</h5>
          <span>{selectedPersonnel.length}</span>
        </div>
        <div className="personnel-picker-right-list">
          {selectedPersonnel.length ? (
            selectedPersonnel.map((person) => (
              <div key={person.admin_id} className="personnel-picker-right-item">
                <span className="personnel-picker-right-avatar" aria-hidden="true">
                  {getInitials(person.name)}
                </span>
                <span className="personnel-picker-right-identity">
                  <strong>{person.name}</strong>
                  <small>{person.email || 'No email available'}</small>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(person.admin_id)}
                  aria-label={`Remove ${person.name}`}
                  disabled={disabled}
                >
                  <FaTimes aria-hidden="true" />
                </button>
              </div>
            ))
          ) : (
            <div className="personnel-picker-empty">No personnel selected.</div>
          )}
        </div>
      </aside>
    </div>
  );
}
