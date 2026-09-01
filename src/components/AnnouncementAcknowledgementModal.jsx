import React, { useEffect, useMemo, useState } from 'react';
import { FiBell, FiCheckCircle, FiClock, FiSearch, FiSend, FiUsers } from 'react-icons/fi';
import CloseButton from './CloseButton';
import AnnouncementNudgeHistoryModal from './AnnouncementNudgeHistoryModal';
import './AnnouncementAcknowledgementModal.css';

const EMPTY_PERSONNEL = [];
const ASIA_MANILA_TIME_ZONE = 'Asia/Manila';

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: ASIA_MANILA_TIME_ZONE
  });
};

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return 'P';
  return `${parts[0][0] || ''}${parts.at(-1)?.[0] || ''}`.toUpperCase();
};

export default function AnnouncementAcknowledgementModal({
  announcement,
  onClose,
  onNudge,
  nudgingIds,
  cooldownUntilById
}) {
  const acknowledged = announcement?.acknowledgement_personnel?.acknowledged || EMPTY_PERSONNEL;
  const pending = announcement?.acknowledgement_personnel?.pending || EMPTY_PERSONNEL;
  const [activeTab, setActiveTab] = useState(pending.length > 0 ? 'pending' : 'acknowledged');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [historyPerson, setHistoryPerson] = useState(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    // While the nested nudge-history modal is open, let it own Escape so a
    // single press closes only the history view, not this modal too.
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !historyPerson) onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, historyPerson]);

  useEffect(() => {
    const hasActiveCooldown = Array.from(cooldownUntilById.values())
      .some((cooldownUntil) => cooldownUntil > Date.now());
    if (!hasActiveCooldown) return undefined;

    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [cooldownUntilById]);

  const visiblePersonnel = useMemo(() => {
    const source = activeTab === 'acknowledged' ? acknowledged : pending;
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return source;

    return source.filter((person) =>
      [person.name, person.rank, person.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [acknowledged, activeTab, pending, searchQuery]);

  const personnelLeftToNudge = pending.filter(
    (person) => (cooldownUntilById.get(person.personnel_id) || 0) <= currentTime
  );
  const cooldownSeconds = pending
    .map((person) => Math.ceil(((cooldownUntilById.get(person.personnel_id) || 0) - currentTime) / 1000))
    .filter((seconds) => seconds > 0);
  const shortestCooldown = cooldownSeconds.length > 0 ? Math.min(...cooldownSeconds) : 0;
  const isNudgingAll = personnelLeftToNudge.length > 0 &&
    personnelLeftToNudge.every((person) => nudgingIds.has(person.personnel_id));

  return (
    <div
      className="acknowledgement-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="acknowledgement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acknowledgementModalTitle"
      >
        <header className="acknowledgement-modal-header">
          <div className="acknowledgement-modal-heading">
            <span className="acknowledgement-modal-eyebrow">
              <FiUsers aria-hidden="true" />
              Recipient activity
            </span>
            <h2 id="acknowledgementModalTitle">Acknowledgement Details</h2>
            <p title={announcement?.title}>{announcement?.title}</p>
          </div>
          <CloseButton onClick={onClose} label="Close acknowledgement details" />
        </header>

        <div className="acknowledgement-summary">
          <div className="acknowledgement-summary-item is-acknowledged">
            <FiCheckCircle aria-hidden="true" />
            <span>
              <strong>{acknowledged.length}</strong>
              Acknowledged
            </span>
          </div>
          <div className="acknowledgement-summary-item is-pending">
            <FiClock aria-hidden="true" />
            <span>
              <strong>{pending.length}</strong>
              Not Acknowledged
            </span>
          </div>
        </div>

        <div className="acknowledgement-toolbar">
          <div className="acknowledgement-tabs" role="tablist" aria-label="Acknowledgement status">
            <button
              type="button"
              className={activeTab === 'acknowledged' ? 'active' : ''}
              onClick={() => setActiveTab('acknowledged')}
              role="tab"
              aria-selected={activeTab === 'acknowledged'}
            >
              Acknowledged ({acknowledged.length})
            </button>
            <button
              type="button"
              className={activeTab === 'pending' ? 'active' : ''}
              onClick={() => setActiveTab('pending')}
              role="tab"
              aria-selected={activeTab === 'pending'}
            >
              Not Acknowledged ({pending.length})
            </button>
          </div>

          <label className="acknowledgement-search">
            <FiSearch aria-hidden="true" />
            <span className="sr-only">Search personnel</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name, rank, or email"
            />
          </label>
        </div>

        {activeTab === 'pending' && pending.length > 1 && (
          <div className="acknowledgement-bulk-action">
            <div>
              <FiBell aria-hidden="true" />
              <span>
                <strong>Send a reminder</strong>
                Notify every personnel who has not acknowledged yet.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNudge(personnelLeftToNudge.map((person) => person.personnel_id))}
              disabled={isNudgingAll || personnelLeftToNudge.length === 0}
            >
              <FiSend aria-hidden="true" />
              {isNudgingAll
                ? 'Sending...'
                : personnelLeftToNudge.length === 0
                  ? `Wait ${shortestCooldown}s`
                  : `Nudge All (${personnelLeftToNudge.length})`}
            </button>
          </div>
        )}

        <div className="acknowledgement-list" role="tabpanel">
          {visiblePersonnel.length === 0 ? (
            <div className="acknowledgement-empty">
              {searchQuery.trim()
                ? 'No personnel match your search.'
                : activeTab === 'acknowledged'
                  ? 'No personnel have acknowledged this announcement yet.'
                  : 'Everyone has acknowledged this announcement.'}
            </div>
          ) : (
            visiblePersonnel.map((person) => {
              const isNudging = nudgingIds.has(person.personnel_id);
              const remainingCooldown = Math.max(
                0,
                Math.ceil(((cooldownUntilById.get(person.personnel_id) || 0) - currentTime) / 1000)
              );

              return (
                <div key={person.personnel_id} className="acknowledgement-personnel-row">
                  <span className="acknowledgement-avatar" aria-hidden="true">
                    {getInitials(person.name)}
                  </span>
                  <div className="acknowledgement-personnel-details">
                    <strong>{person.name}</strong>
                    <span>
                      {[person.rank, person.email].filter(Boolean).join(' | ') || 'Personnel account'}
                    </span>
                    {person.nudge_count > 0 && (
                      <button
                        type="button"
                        className="acknowledgement-nudge-history-link"
                        onClick={() => setHistoryPerson(person)}
                      >
                        <FiBell aria-hidden="true" />
                        {person.nudge_count} {person.nudge_count === 1 ? 'nudge' : 'nudges'} sent
                      </button>
                    )}
                  </div>
                  {activeTab === 'acknowledged' ? (
                    <span className="acknowledgement-row-status is-acknowledged">
                      <FiCheckCircle aria-hidden="true" />
                      <span>
                        Acknowledged
                        {person.acknowledged_at && <small>{formatDate(person.acknowledged_at)}</small>}
                      </span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`acknowledgement-nudge-button${remainingCooldown > 0 ? ' is-sent' : ''}`}
                      onClick={() => onNudge([person.personnel_id])}
                      disabled={isNudging || remainingCooldown > 0}
                    >
                      <FiBell aria-hidden="true" />
                      {isNudging
                        ? 'Sending...'
                        : remainingCooldown > 0
                          ? `Wait ${remainingCooldown}s`
                          : 'Nudge'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {historyPerson && (
        <AnnouncementNudgeHistoryModal
          person={historyPerson}
          onClose={() => setHistoryPerson(null)}
        />
      )}
    </div>
  );
}
