import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaSearch, FaTimes, FaChevronDown } from 'react-icons/fa';
import { formatStatusLabel } from '../utils/statusUtils';
import './PersonnelPicker.css';

const SUMMARY_CHIP_LIMIT = 3;

const isActiveStatus = (status) => String(status || '').toLowerCase() === 'active';

export default function PersonnelPicker({
  id,
  personnel = [],
  selectedIds = [],
  onChange,
  error = '',
  disabled = false,
  placeholder = 'Choose personnel'
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

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
    return sortedPersonnel.filter((person) => String(person.name || '').toLowerCase().includes(query));
  }, [sortedPersonnel, search]);

  const selectedPersonnel = useMemo(
    () => selectedIds.map((selectedId) => personnelById.get(selectedId)).filter(Boolean),
    [selectedIds, personnelById]
  );

  useEffect(() => {
    if (!open) return undefined;

    const closeAndResetSearch = () => {
      setOpen(false);
      setSearch('');
    };

    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        closeAndResetSearch();
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') closeAndResetSearch();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [open]);

  const toggleOpen = () => {
    if (disabled) return;
    if (open) setSearch('');
    setOpen((prev) => !prev);
  };

  const togglePersonnel = (personId) => {
    const next = selectedIds.includes(personId)
      ? selectedIds.filter((existingId) => existingId !== personId)
      : [...selectedIds, personId];
    onChange(next);
  };

  const handleSelectAll = () => {
    const activeIds = sortedPersonnel.filter((person) => isActiveStatus(person.status)).map((person) => person.admin_id);
    const merged = Array.from(new Set([...selectedIds, ...activeIds]));
    onChange(merged);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  const handleRemove = (personId) => {
    onChange(selectedIds.filter((existingId) => existingId !== personId));
  };

  const triggerLabel = selectedIds.length === 0
    ? placeholder
    : `${selectedIds.length} personnel selected`;

  const showFullChips = selectedPersonnel.length > 0 && selectedPersonnel.length <= SUMMARY_CHIP_LIMIT;
  const showSummary = selectedPersonnel.length > SUMMARY_CHIP_LIMIT;

  return (
    <div
      className={`personnel-picker ${disabled ? 'is-disabled' : ''} ${error ? 'has-error' : ''}`}
      ref={containerRef}
    >
      <button
        id={id}
        type="button"
        className="personnel-picker-trigger"
        onClick={toggleOpen}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selectedIds.length === 0 ? 'personnel-picker-trigger-placeholder' : ''}>
          {triggerLabel}
        </span>
        <FaChevronDown className={`personnel-picker-trigger-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>

      {showFullChips && (
        <div className="personnel-picker-chips">
          {selectedPersonnel.map((person) => (
            <span key={person.admin_id} className="personnel-picker-chip">
              {person.name}
              <button
                type="button"
                className="personnel-picker-chip-remove"
                onClick={() => handleRemove(person.admin_id)}
                aria-label={`Remove ${person.name}`}
              >
                <FaTimes aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}

      {showSummary && (
        <div className="personnel-picker-summary">
          {selectedPersonnel.slice(0, 2).map((person) => person.name).join(', ')}
          {' '}
          <span className="personnel-picker-summary-more">+{selectedPersonnel.length - 2} more</span>
        </div>
      )}

      {open && (
        <div className="personnel-picker-panel" role="listbox" aria-multiselectable="true">
          <label className="personnel-picker-search">
            <FaSearch aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search personnel by name or rank..."
            />
          </label>

          <div className="personnel-picker-toolbar">
            <div className="personnel-picker-toolbar-actions">
              <button type="button" onClick={handleSelectAll}>Select All</button>
              <button type="button" onClick={handleClearAll}>Clear All</button>
            </div>
            <span className="personnel-picker-toolbar-count">{selectedIds.length} selected</span>
          </div>

          <div className="personnel-picker-list">
            {filteredPersonnel.length === 0 ? (
              <div className="personnel-picker-empty">No personnel match your search.</div>
            ) : (
              filteredPersonnel.map((person) => {
                const active = isActiveStatus(person.status);
                const checked = selectedIds.includes(person.admin_id);

                return (
                  <label
                    key={person.admin_id}
                    className={`personnel-picker-item ${!active ? 'is-unavailable' : ''}`}
                  >
                    <input
                      type="checkbox"
                      className="personnel-picker-checkbox"
                      checked={checked}
                      disabled={!active}
                      onChange={() => togglePersonnel(person.admin_id)}
                    />
                    <span className="personnel-picker-item-name">{person.name}</span>
                    <span className={`personnel-picker-status-badge ${active ? 'is-active' : 'is-inactive'}`}>
                      {formatStatusLabel(person.status)}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
