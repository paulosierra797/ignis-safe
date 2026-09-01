import React, { useEffect, useMemo, useState } from 'react';
import {
  FiBell,
  FiCheckCircle,
  FiChevronRight,
  FiClock,
  FiSearch,
  FiSend
} from 'react-icons/fi';
import AnnouncementNudgeHistoryModal from './AnnouncementNudgeHistoryModal';
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

export default function AnnouncementNudgeTracking({
  announcement,
  onOpenAcknowledgements,
  onNudge,
  nudgingIds = new Set(),
  cooldownUntilById = new Map()
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openHistoryId, setOpenHistoryId] = useState('');
  const [currentTime, setCurrentTime] = useState(() => Date.now());

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

  useEffect(() => {
    const hasActiveCooldown = Array.from(cooldownUntilById.values())
      .some((cooldownUntil) => cooldownUntil > Date.now());
    if (!hasActiveCooldown) return undefined;

    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [cooldownUntilById]);

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

  const pendingPeople = tracking.filter((person) => !person.acknowledged_at);
  const actionablePendingPeople = pendingPeople.filter(
    (person) => (cooldownUntilById.get(person.personnel_id) || 0) <= currentTime
  );
  const isNudgingAll = pendingPeople.length > 0 && pendingPeople.every(
    (person) => nudgingIds.has(person.personnel_id)
  );
  const historyPerson = tracking.find((person) => person.personnel_id === openHistoryId);
  const announcementDeadlineTime = announcementDeadline
    ? new Date(announcementDeadline).getTime()
    : NaN;
  const isAnnouncementOverdue = Number.isFinite(announcementDeadlineTime) &&
    announcementDeadlineTime <= currentTime;

  const handleNudgeAll = () => {
    if (actionablePendingPeople.length > 0 && onNudge) {
      onNudge(actionablePendingPeople.map((person) => person.personnel_id));
    }
  };

  return (
    <>
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
                className="nudge-tracking-ack-summary"
                onClick={onOpenAcknowledgements}
                aria-label={`View acknowledgement details: ${summary.acknowledgedCount} of ${summary.totalRecipients} acknowledged`}
              >
                <FiCheckCircle aria-hidden="true" />
                <span>
                  <strong>Acknowledged</strong>
                  <b>{summary.acknowledgedCount}/{summary.totalRecipients}</b>
                </span>
                <FiChevronRight aria-hidden="true" />
              </button>
              <span className="nudge-tracking-pending-summary">
                <FiClock aria-hidden="true" />
                <strong>{summary.pendingCount} Pending</strong>
              </span>
              <span className={`nudge-tracking-deadline${isAnnouncementOverdue ? ' is-overdue' : ''}`}>
                <FiClock aria-hidden="true" />
                <span>
                  <small>Deadline</small>
                  <strong>{deadlineLabel}</strong>
                </span>
                {isAnnouncementOverdue && <em>Overdue</em>}
              </span>
              <span className="nudge-tracking-total-nudges">
                {summary.totalNudges} nudge(s) sent
              </span>
            </div>
          </div>
          <button
            type="button"
            className="nudge-tracking-primary-action"
            onClick={handleNudgeAll}
            disabled={isNudgingAll || actionablePendingPeople.length === 0}
          >
            <FiSend aria-hidden="true" />
            {isNudgingAll ? 'Sending...' : 'Nudge Personnel'}
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
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="nudge-tracking-empty">No personnel match your search.</td>
                </tr>
              ) : (
                visibleRows.map((person) => {
                  const history = person.nudge_history || [];
                  const isPending = !person.acknowledged_at;
                  const isOverdue = isPersonOverdue(person, announcement, currentTime);
                  const remainingCooldown = Math.max(
                    0,
                    Math.ceil(((cooldownUntilById.get(person.personnel_id) || 0) - currentTime) / 1000)
                  );
                  const isNudging = nudgingIds.has(person.personnel_id);

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
                      <td data-label="Action" className="nudge-tracking-actions-cell">
                        {isPending && (
                          <button
                            type="button"
                            className="nudge-tracking-nudge-button"
                            onClick={() => onNudge?.([person.personnel_id])}
                            disabled={isNudging || remainingCooldown > 0}
                          >
                            <FiBell aria-hidden="true" />
                            {isNudging ? 'Sending...' : remainingCooldown > 0 ? `Wait ${remainingCooldown}s` : 'Nudge'}
                          </button>
                        )}
                        {history.length > 0 && (
                          <button
                            type="button"
                            className="nudge-tracking-history-toggle"
                            onClick={() => setOpenHistoryId(person.personnel_id)}
                          >
                            View {history.length} Nudges
                          </button>
                        )}
                        {!isPending && history.length === 0 && (
                          <span className="nudge-tracking-no-action">—</span>
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

      {historyPerson && (
        <AnnouncementNudgeHistoryModal
          person={historyPerson}
          onClose={() => setOpenHistoryId('')}
        />
      )}
    </>
  );
}
