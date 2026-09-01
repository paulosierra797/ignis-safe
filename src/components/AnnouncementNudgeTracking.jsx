import React, { useMemo, useState } from 'react';
import {
  FiBell,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiSearch,
  FiSend
} from 'react-icons/fi';
import './AnnouncementNudgeTracking.css';

const ASIA_MANILA_TIME_ZONE = 'Asia/Manila';

const formatDeadline = (isoDate) => {
  if (!isoDate) return 'No deadline';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'No deadline';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ASIA_MANILA_TIME_ZONE
  });
};

const getDeadline = (person, announcement) =>
  person?.acknowledgement_deadline || announcement?.acknowledgement_deadline || '';

const isPersonOverdue = (person, announcement, currentTime) => {
  if (person?.acknowledged_at) return false;
  const deadline = getDeadline(person, announcement);
  const deadlineTime = deadline ? new Date(deadline).getTime() : NaN;
  return Number.isFinite(deadlineTime) && deadlineTime <= currentTime;
};

// Summary-only panel: the main table lists recipient status at a glance, and the
// "Nudge Personnel" button opens the Acknowledgement Details modal where every
// nudge action (Nudge All, per-person Nudge, per-person history) lives.
export default function AnnouncementNudgeTracking({
  announcement,
  onOpenAcknowledgements
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const currentTime = Date.now();

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
  const announcementDeadline = announcement?.acknowledgement_deadline || '';
  const deadlineLabel = formatDeadline(announcementDeadline);

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

  const hasPendingPeople = tracking.some((person) => !person.acknowledged_at);
  const announcementDeadlineTime = announcementDeadline
    ? new Date(announcementDeadline).getTime()
    : NaN;
  const isAnnouncementOverdue = Number.isFinite(announcementDeadlineTime) &&
    announcementDeadlineTime <= currentTime;

  return (
    <section className="nudge-tracking" aria-label="Acknowledgement and nudge tracking">
      <div className="nudge-tracking-header">
        <div className="nudge-tracking-heading">
          <h4>
            <FiBell aria-hidden="true" />
            Acknowledgement / Nudge Tracking
          </h4>
          <div className="nudge-tracking-summary" aria-label="Announcement acknowledgement summary">
            <button
              type="button"
              className="nudge-tracking-stat nudge-tracking-ack-summary"
              onClick={onOpenAcknowledgements}
              aria-label={`View acknowledgement details: ${summary.acknowledgedCount} of ${summary.totalRecipients} acknowledged`}
            >
              <FiCheckCircle aria-hidden="true" />
              <span className="nudge-tracking-stat-label">Acknowledged</span>
              <b className="nudge-tracking-stat-value">{summary.acknowledgedCount}/{summary.totalRecipients}</b>
              <FiChevronRight aria-hidden="true" />
            </button>
            <span className="nudge-tracking-stat nudge-tracking-pending-summary">
              <FiClock aria-hidden="true" />
              <span className="nudge-tracking-stat-label">Pending</span>
              <b className="nudge-tracking-stat-value">{summary.pendingCount}</b>
            </span>
            <span className={`nudge-tracking-stat nudge-tracking-deadline${isAnnouncementOverdue ? ' is-overdue' : ''}`}>
              <FiClock aria-hidden="true" />
              <span className="nudge-tracking-stat-label">Deadline</span>
              <b className="nudge-tracking-stat-value">{deadlineLabel}</b>
              {isAnnouncementOverdue && <em>Overdue</em>}
            </span>
            <span className="nudge-tracking-stat nudge-tracking-total-nudges">
              <FiSend aria-hidden="true" />
              <span className="nudge-tracking-stat-label">Nudges Sent</span>
              <b className="nudge-tracking-stat-value">{summary.totalNudges}</b>
            </span>
          </div>
        </div>
        <button
          type="button"
          className="nudge-tracking-primary-action"
          onClick={onOpenAcknowledgements}
          disabled={!hasPendingPeople}
        >
          <FiSend aria-hidden="true" />
          Nudge Personnel
        </button>
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
              <th scope="col">Name / Email</th>
              <th scope="col">Rank</th>
              <th scope="col">Status</th>
              <th scope="col">Deadline</th>
              <th scope="col">Nudge Count</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="nudge-tracking-empty">No personnel match your search.</td>
              </tr>
            ) : (
              visibleRows.map((person) => {
                const isOverdue = isPersonOverdue(person, announcement, currentTime);

                return (
                  <tr key={person.personnel_id}>
                    <td data-label="Name / Email">
                      <strong>{person.name}</strong>
                      <span className="nudge-tracking-subtext">{person.email || 'No email available'}</span>
                    </td>
                    <td data-label="Rank">{person.rank || '—'}</td>
                    <td data-label="Status">
                      <span className={`nudge-tracking-badge ${person.acknowledged_at
                        ? 'is-acknowledged'
                        : isOverdue
                          ? 'is-overdue'
                          : 'is-pending'}`}>
                        {person.acknowledged_at ? 'Acknowledged' : isOverdue ? 'Overdue' : 'Pending'}
                      </span>
                    </td>
                    <td data-label="Deadline">{formatDeadline(getDeadline(person, announcement))}</td>
                    <td data-label="Nudge Count">{person.nudge_count}</td>
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
