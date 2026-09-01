import React, { useEffect } from 'react';
import { FiBell } from 'react-icons/fi';
import CloseButton from './CloseButton';
import './AnnouncementNudgeHistoryModal.css';

const ASIA_MANILA_TIME_ZONE = 'Asia/Manila';

const formatNudgeDate = (isoDate) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return { date: '—', time: '—' };

  return {
    date: date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: ASIA_MANILA_TIME_ZONE
    }),
    time: date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: ASIA_MANILA_TIME_ZONE
    })
  };
};

export default function AnnouncementNudgeHistoryModal({ person, onClose }) {
  const history = person?.nudge_history || [];

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  return (
    <div
      className="nudge-history-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="nudge-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nudgeHistoryModalTitle"
      >
        <header className="nudge-history-modal-header">
          <div>
            <span className="nudge-history-modal-eyebrow">
              <FiBell aria-hidden="true" />
              Reminder activity
            </span>
            <h2 id="nudgeHistoryModalTitle">Nudge History</h2>
          </div>
          <CloseButton onClick={onClose} label="Close nudge history" />
        </header>

        <div className="nudge-history-modal-person">
          <div>
            <span>Personnel</span>
            <strong>{person?.name || 'Personnel account'}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{person?.email || '—'}</strong>
          </div>
          <div>
            <span>Rank</span>
            <strong>{person?.rank || '—'}</strong>
          </div>
          <div>
            <span>Total Nudges</span>
            <strong>{person?.nudge_count ?? history.length}</strong>
          </div>
        </div>

        <div className="nudge-history-modal-table-wrap">
          <table className="nudge-history-modal-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Nudge Date</th>
                <th scope="col">Nudge Time</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={3}>No nudge history available.</td>
                </tr>
              ) : (
                history.map((entry, index) => {
                  const stamp = formatNudgeDate(entry.at);
                  return (
                    <tr key={`${person.personnel_id}-history-${index}`}>
                      <td data-label="#">{index + 1}</td>
                      <td data-label="Nudge Date">{stamp.date}</td>
                      <td data-label="Nudge Time">{stamp.time}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
