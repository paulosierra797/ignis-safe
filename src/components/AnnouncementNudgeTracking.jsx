import React, { useMemo, useState } from 'react';
import { FiBell, FiCheckCircle, FiClock, FiSearch } from 'react-icons/fi';
import './AnnouncementNudgeTracking.css';

const formatDeadline = (isoDate) => {
  if (!isoDate) return 'No deadline';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatNudgeStamp = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
};

export default function AnnouncementNudgeTracking({ announcement }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openHistoryId, setOpenHistoryId] = useState('');

  const tracking = useMemo(
    () => announcement?.acknowledgement_tracking || [],
    [announcement]
  );
  const summary = announcement?.acknowledgement_tracking_summary || {
    totalRecipients: tracking.length,
    acknowledgedCount: 0,
    pendingCount: 0,
    totalNudges: 0
  };
  const deadlineLabel = formatDeadline(announcement?.acknowledgement_deadline);

  const visibleRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const rows = normalizedQuery
      ? tracking.filter((person) =>
          [person.name, person.rank, person.email]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : tracking.slice();

    // Pending first, then most-nudged, so the people who still need chasing
    // sit at the top of the list.
    return rows.sort((left, right) => {
      const leftPending = left.acknowledged_at ? 1 : 0;
      const rightPending = right.acknowledged_at ? 1 : 0;
      if (leftPending !== rightPending) return leftPending - rightPending;
      if (right.nudge_count !== left.nudge_count) return right.nudge_count - left.nudge_count;
      return String(left.name).localeCompare(String(right.name));
    });
  }, [tracking, searchQuery]);

  if (tracking.length === 0) {
    return null;
  }

  return (
    <section className="nudge-tracking" aria-label="Acknowledgement and nudge tracking">
      <div className="nudge-tracking-header">
        <h4>
          <FiBell aria-hidden="true" />
          Acknowledgement / Nudge Tracking
        </h4>
        <div className="nudge-tracking-stats">
          <span className="is-acknowledged">
            <FiCheckCircle aria-hidden="true" />
            {summary.acknowledgedCount} acknowledged
          </span>
          <span className="is-pending">
            <FiClock aria-hidden="true" />
            {summary.pendingCount} pending
          </span>
          <span className="is-deadline">Deadline: {deadlineLabel}</span>
          <span className="is-nudges">{summary.totalNudges} nudge(s) sent</span>
        </div>
      </div>

      {tracking.length > 5 && (
        <label className="nudge-tracking-search">
          <FiSearch aria-hidden="true" />
          <span className="sr-only">Search personnel</span>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search name, rank, or email"
          />
        </label>
      )}

      <div className="nudge-tracking-table-wrap">
        <table className="nudge-tracking-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Status</th>
              <th scope="col">Deadline</th>
              <th scope="col">Nudge Count</th>
              <th scope="col">Nudge History</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="nudge-tracking-empty">No personnel match your search.</td>
              </tr>
            ) : (
              visibleRows.map((person) => {
                const isHistoryOpen = openHistoryId === person.personnel_id;
                const history = person.nudge_history || [];

                return (
                  <tr key={person.personnel_id}>
                    <td data-label="Name">
                      <strong>{person.name}</strong>
                      {(person.rank || person.email) && (
                        <span className="nudge-tracking-subtext">
                          {[person.rank, person.email].filter(Boolean).join(' | ')}
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span className={`nudge-tracking-badge ${person.acknowledged_at ? 'is-acknowledged' : 'is-pending'}`}>
                        {person.acknowledged_at ? 'Acknowledged' : 'Pending'}
                      </span>
                      {person.acknowledged_at && (
                        <span className="nudge-tracking-subtext">{formatNudgeStamp(person.acknowledged_at)}</span>
                      )}
                    </td>
                    <td data-label="Deadline">{formatDeadline(person.acknowledgement_deadline)}</td>
                    <td data-label="Nudge Count">{person.nudge_count}</td>
                    <td data-label="Nudge History">
                      {history.length === 0 ? (
                        <span className="nudge-tracking-subtext">No nudges yet</span>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="nudge-tracking-history-toggle"
                            onClick={() =>
                              setOpenHistoryId((prev) => (prev === person.personnel_id ? '' : person.personnel_id))
                            }
                            aria-expanded={isHistoryOpen}
                          >
                            {isHistoryOpen ? 'Hide' : `View ${history.length} nudge(s)`}
                          </button>
                          {isHistoryOpen && (
                            <ol className="nudge-tracking-history">
                              {history.map((entry, index) => (
                                <li key={`${person.personnel_id}-nudge-${index}`}>
                                  Nudge #{index + 1} &ndash; {formatNudgeStamp(entry.at)}
                                  {entry.auto ? '' : ' (manual)'}
                                </li>
                              ))}
                            </ol>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
