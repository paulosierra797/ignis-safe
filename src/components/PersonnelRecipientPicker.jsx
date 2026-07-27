import React, { useMemo, useState } from 'react';
import { FiCheck, FiSearch, FiX } from 'react-icons/fi';
import './PersonnelRecipientPicker.css';

const getInitials = (name) => {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return 'P';
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
};

export default function PersonnelRecipientPicker({
  idPrefix,
  recipients,
  value,
  onChange,
}) {
  const [query, setQuery] = useState('');
  const searchId = `${idPrefix}-personnel-search`;
  const selectedRecipient = recipients.find((person) => person.admin_id === value) || null;

  const filteredRecipients = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return recipients;

    return recipients.filter((person) => (
      [person.name, person.email, person.status]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(normalizedQuery))
    ));
  }, [query, recipients]);

  return (
    <section className="personnel-recipient-picker" aria-labelledby={`${idPrefix}-personnel-label`}>
      <div className="personnel-recipient-heading">
        <div>
          <label id={`${idPrefix}-personnel-label`} htmlFor={searchId}>Select Personnel</label>
          <span>Choose one recipient for this announcement.</span>
        </div>
        <span className="personnel-recipient-count">
          {recipients.length} {recipients.length === 1 ? 'person' : 'people'}
        </span>
      </div>

      <div className="personnel-recipient-search">
        <FiSearch aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or email"
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear personnel search"
            title="Clear search"
          >
            <FiX aria-hidden="true" />
          </button>
        )}
      </div>

      {selectedRecipient && (
        <div className="personnel-recipient-selected" aria-live="polite">
          <FiCheck aria-hidden="true" />
          <span>
            Selected: <strong>{selectedRecipient.name}</strong>
          </span>
          <button type="button" onClick={() => onChange('')}>Clear</button>
        </div>
      )}

      <div className="personnel-recipient-list" role="radiogroup" aria-label="Personnel recipients">
        {filteredRecipients.length === 0 ? (
          <div className="personnel-recipient-empty">
            {recipients.length === 0
              ? 'No active personnel are available.'
              : 'No personnel match your search.'}
          </div>
        ) : (
          filteredRecipients.map((person) => {
            const isSelected = person.admin_id === value;

            return (
              <label
                className={`personnel-recipient-option${isSelected ? ' is-selected' : ''}`}
                key={person.admin_id}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-personnel-recipient`}
                  value={person.admin_id}
                  checked={isSelected}
                  onChange={() => onChange(person.admin_id)}
                />
                <span className="personnel-recipient-avatar" aria-hidden="true">
                  {getInitials(person.name)}
                </span>
                <span className="personnel-recipient-identity">
                  <strong>{person.name}</strong>
                  <small>{person.email || 'No email available'}</small>
                </span>
                <span className="personnel-recipient-check" aria-hidden="true">
                  {isSelected && <FiCheck />}
                </span>
              </label>
            );
          })
        )}
      </div>
    </section>
  );
}
