import React from 'react';
import './AttendanceRequirementsModal.css';

// Instructional, UI-only gate shown once per login session before personnel
// use the Attendance page. Purely informational — it records nothing and
// does not affect the actual Face ID, location, or Time In/Out logic.
const AttendanceRequirementsModal = ({ hasFaceId = true, radiusMeters, onContinue, onGoToProfile }) => {
  const parsedRadius = Number(radiusMeters);
  const radiusLabel = Number.isFinite(parsedRadius) ? `${Math.round(parsedRadius)} meters` : 'a limited number of meters';

  return (
    <div className="attendance-requirements-overlay" role="presentation">
      <section
        className="attendance-requirements-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendanceRequirementsTitle"
      >
        <header className="attendance-requirements-header">
          <span className="attendance-requirements-eyebrow">IGNIS SAFE · Personnel</span>
          <h2 id="attendanceRequirementsTitle">Attendance Requirements</h2>
          <p>Please review these requirements before recording your attendance.</p>
        </header>

        <ul className="attendance-requirements-list">
          <li>
            <strong>Face ID Required.</strong> Check <strong>Profile</strong> first and make sure your Face
            ID is already registered.
          </li>
          <li>
            <strong>Internet Required.</strong> A stable internet connection is needed.
          </li>
          <li>
            <strong>Location Must Be ON.</strong> Allow browser/location access when prompted.
          </li>
          <li>
            <strong>Must Be Within the Authorized BFP Area.</strong> The attendance radius is only{' '}
            <strong>{radiusLabel}</strong>.
          </li>
          <li>
            <strong>Face Verification Comes First.</strong> Your face must be verified before Location
            Verification becomes available.
          </li>
          <li>
            <strong>Time Out Requires Time In.</strong> You can only Time Out if you already recorded Time
            In.
          </li>
        </ul>

        <div className="attendance-requirements-flow">
          <span>Face ID</span>
          <span aria-hidden="true">→</span>
          <span>Face Verification</span>
          <span aria-hidden="true">→</span>
          <span>Location Verification</span>
          <span aria-hidden="true">→</span>
          <span>Time In / Time Out</span>
          <span aria-hidden="true">→</span>
          <span>Confirm Attendance</span>
        </div>

        <footer className="attendance-requirements-footer">
          {!hasFaceId && (
            <button
              type="button"
              className="attendance-requirements-secondary"
              onClick={onGoToProfile}
            >
              Go to Profile
            </button>
          )}
          <button
            type="button"
            className="attendance-requirements-primary"
            onClick={onContinue}
          >
            I Understand, Continue
          </button>
        </footer>
      </section>
    </div>
  );
};

export default AttendanceRequirementsModal;
