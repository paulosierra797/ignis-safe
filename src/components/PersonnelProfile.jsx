import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import { uploadProfileImage } from '../utils/imageService';
import { AVATAR_MAX_SIZE, AVATAR_ALLOWED_TYPES } from '../utils/avatarCrop';
import AvatarCropModal from './AvatarCropModal';
import * as faceapi from '@vladmandic/face-api';
import { loadFaceModels } from '../utils/loadFaceModels';
import LivenessCheck from './LivenessCheck';
import './PersonnelProfile.css';
import { getFaceByAdminId, registerFace, getFaceIdCooldownUntil } from '../utils/faceApiService';
import {
  PROFILE_FIELD_OPTIONS,
  getProfileFieldLabel,
  getMyProfileChangeRequests,
  submitProfileChangeRequest
} from '../utils/profileChangeRequestsService';
import { logPersonnelActivity } from '../utils/activityLogService';
import UnsavedChangesPrompt, { UnsavedChangesDialog } from './UnsavedChangesPrompt';
import { formatStatusLabel } from '../utils/statusUtils';

const RANK_OPTIONS = [
  'FDIR',
  'DFDIR',
  'SSUPT',
  'SUPT',
  'CINSP',
  'SINSP',
  'INSP',
  'SFO4',
  'SFO3',
  'SFO2',
  'SFO1',
  'FO3',
  'FO2',
  'FO1'
];
const RANK_LABELS = {
  FDIR: 'FDIR - Fire Director',
  DFDIR: 'DFDIR - Deputy Fire Director',
  SSUPT: 'SSUPT - Senior Fire Superintendent',
  SUPT: 'SUPT - Fire Superintendent',
  CINSP: 'CINSP - Fire Chief Inspector',
  SINSP: 'SINSP - Fire Senior Inspector',
  INSP: 'INSP - Fire Inspector',
  SFO4: 'SFO4 - Senior Fire Officer IV',
  SFO3: 'SFO3 - Senior Fire Officer III',
  SFO2: 'SFO2 - Senior Fire Officer II',
  SFO1: 'SFO1 - Senior Fire Officer I',
  FO3: 'FO3 - Fire Officer III',
  FO2: 'FO2 - Fire Officer II',
  FO1: 'FO1 - Fire Officer I'
};
const PHONE_NUMBER_ERROR = 'Phone number must contain exactly 11 digits.';
const FACE_ID_COOLDOWN_DAYS = 7;

// Mirrors the 7-day cooldown enforced server-side in register_face() —
// used here only to drive the button/label state; the DB is the source of truth.
const getFaceCooldownUntil = (record) => {
  if (!record?.updated_at) return null;
  const eligibleAt = new Date(record.updated_at);
  eligibleAt.setDate(eligibleAt.getDate() + FACE_ID_COOLDOWN_DAYS);
  return eligibleAt > new Date() ? eligibleAt : null;
};

const formatFaceCooldownDate = (value) =>
  new Date(value).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
const EMPTY_REQUEST_VALUES = Object.fromEntries(
  PROFILE_FIELD_OPTIONS.map((option) => [option.value, ''])
);

export default function PersonnelProfile() {
  const { currentUser, setCurrentUser } = useUser();
  const [rank, setRank] = useState('');
  const [rankCustom, setRankCustom] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState('/user-avatar.svg');
  const [cropFile, setCropFile] = useState(null);
  const resolvedRank = rank === 'OTHER' ? rankCustom.trim() : rank;
  const displayName = `${resolvedRank || currentUser?.rank || ''} ${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 'Personnel';
  const displayPhone = currentUser?.contact_number || currentUser?.phone || currentUser?.phone_number || currentUser?.mobile || 'Not available';
  const displayRole = currentUser?.role
    ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)
    : 'Personnel';
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
const [faceLoading, setFaceLoading] = useState(false);
const [faceRecord, setFaceRecord] = useState(null);
// Liveness verification state - mirrors the Attendance Face ID flow
// (see AttendanceConfirm.jsx/useLivenessCheck) so a photo held up to the
// camera (e.g. on another phone) can't be registered as a live face.
const [showLiveness, setShowLiveness] = useState(false);
const [livenessAttemptKey, setLivenessAttemptKey] = useState(0);
const [livenessPhase, setLivenessPhase] = useState('idle');
const [livenessSessionId, setLivenessSessionId] = useState(null);
const [faceRegError, setFaceRegError] = useState('');
const videoRef = useRef(null);
const streamRef = useRef(null);
// Monotonic token for the in-flight registration attempt, so async camera/
// liveness/capture callbacks from a stale attempt can never apply their
// result after the modal has moved on (closed, retried, etc.).
const attemptIdRef = useRef(0);
const [modal, setModal] = useState({
  open: false,
  type: "info", // "success" | "error" | "confirm"
  message: "",
  onConfirm: null,
  });
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestValues, setRequestValues] = useState({ ...EMPTY_REQUEST_VALUES });
  const [requestReason, setRequestReason] = useState('');
  const [isRequestSaving, setIsRequestSaving] = useState(false);
  const [requestMessage, setRequestMessage] = useState({ type: '', text: '' });
  const [isDiscardRequestOpen, setIsDiscardRequestOpen] = useState(false);
  const [myRequests, setMyRequests] = useState([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);
  const profileHeaderRef = useRef(null);
  const profileContentRef = useRef(null);
  const hasUnsavedRequest = isRequestModalOpen && Boolean(
    Object.values(requestValues).some((value) => String(value || '').trim())
    || requestReason.trim()
  );

  useLayoutEffect(() => {
    const headerEl = profileHeaderRef.current;
    const contentEl = profileContentRef.current;
    if (!headerEl || !contentEl) return;

    const syncHeaderOffset = () => {
      contentEl.style.setProperty('--profile-header-height', `${headerEl.offsetHeight}px`);
    };

    syncHeaderOffset();

    const resizeObserver = new ResizeObserver(syncHeaderOffset);
    resizeObserver.observe(headerEl);
    window.addEventListener('resize', syncHeaderOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncHeaderOffset);
    };
  }, []);

  useEffect(() => {
  const initModels = async () => {
    await loadFaceModels();
  };

  initModels();
}, []);

  useEffect(() => {
    const loadFaceRecord = async () => {
      if (!currentUser?.admin_id) return;
      const { data } = await getFaceByAdminId(currentUser.admin_id);
      setFaceRecord(data || null);
    };
    loadFaceRecord();
  }, [currentUser?.admin_id]);

  const loadMyRequests = useCallback(async () => {
    if (!currentUser?.admin_id) return;
    setLoadingMyRequests(true);
    const { data } = await getMyProfileChangeRequests(currentUser.admin_id);
    setMyRequests(data || []);
    setLoadingMyRequests(false);
  }, [currentUser?.admin_id]);

  useEffect(() => {
    loadMyRequests();
  }, [loadMyRequests]);

  const stopFaceCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startFaceCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 }
      },
      audio: false
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  };

  // Opening the modal immediately starts the camera and the same left/right
  // liveness challenge used in Attendance - there is no manual capture path,
  // so registration can't proceed until liveness passes. Closing the modal
  // tears the camera back down.
  useEffect(() => {
    if (!isFaceModalOpen) return undefined;

    let cancelled = false;
    const attemptId = attemptIdRef.current + 1;
    attemptIdRef.current = attemptId;

    setFaceRegError('');
    setShowLiveness(false);
    setLivenessPhase('idle');

    (async () => {
      try {
        await startFaceCamera();
        if (cancelled || attemptIdRef.current !== attemptId) return;
        setLivenessSessionId(crypto.randomUUID());
        setLivenessAttemptKey(attemptId);
        setShowLiveness(true);
      } catch (err) {
        if (cancelled) return;
        console.error('Failed to start camera for Face ID registration:', err);
        setFaceRegError('Unable to access the camera. Please allow camera permissions and try again.');
      }
    })();

    return () => {
      cancelled = true;
      stopFaceCamera();
    };
  }, [isFaceModalOpen]);

  useEffect(() => {
    if (currentUser) {
      const currentRank = currentUser.rank || '';
      if (!currentRank || RANK_OPTIONS.includes(currentRank)) {
        setRank(currentRank);
        setRankCustom('');
      } else {
        setRank('OTHER');
        setRankCustom(currentRank);
      }
      // Set profile image
      if (currentUser.avatar_url) {
        setProfileImage(currentUser.avatar_url);
      }
    }
  }, [currentUser]);

  const handleFaceRegisterClick = async () => {
  const { data, error } = await getFaceByAdminId(currentUser.admin_id);

  if (error) {
    console.error(error);
    showModal({
      type: "error",
      message: "Failed to check existing Face ID."
    });
    return;
  }

  setFaceRecord(data || null);

  const cooldownUntil = getFaceCooldownUntil(data);
  if (cooldownUntil) {
    showModal({
      type: "info",
      message: `Face ID is already registered. You can update your Face ID again on ${formatFaceCooldownDate(cooldownUntil)}.`
    });
    return;
  }

  setIsFaceModalOpen(true);
};
  const handleImageSelected = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      showModal({ type: 'error', message: 'Invalid file type. Please upload an image (JPEG, PNG, GIF, or WebP).' });
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      showModal({ type: 'error', message: 'File size exceeds 5MB. Please upload a smaller image.' });
      return;
    }

    setCropFile(file);
  };

  const handleCropCancel = () => {
    setCropFile(null);
  };

  const handleCropError = (message) => {
    setCropFile(null);
    showModal({ type: 'error', message: message || 'The avatar could not be cropped.' });
  };

  const handleCropApply = async (croppedFile) => {
    setCropFile(null);
    setUploading(true);
    try {
      const { data: imageUrl, error } = await uploadProfileImage(
        currentUser.admin_id,
        croppedFile,
        { workspaceProfile: Boolean(currentUser.is_personnel_workspace_profile) }
      );

      if (error) {
        showModal({ type: 'error', message: 'Error uploading image: ' + error });
      } else {
        setProfileImage(imageUrl);
        // Update local user context
        if (setCurrentUser) {
          setCurrentUser({ ...currentUser, avatar_url: imageUrl });
        }
        showModal({ type: 'success', message: 'Profile image updated successfully!' });

        void logPersonnelActivity({
          personnelId: currentUser.admin_id,
          activityType: 'profile_image_update',
          action: 'Profile Image Updated',
          details: 'Updated profile picture.'
        });
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      showModal({ type: 'error', message: 'Error uploading image.' });
    } finally {
      setUploading(false);
    }
  };

  const getCurrentFieldValue = (fieldName) => {
    switch (fieldName) {
      case 'first_name':
        return currentUser?.first_name || '';
      case 'last_name':
        return currentUser?.last_name || '';
      case 'rank':
        return currentUser?.rank || '';
      case 'email':
        return currentUser?.email || '';
      case 'contact_number':
        return displayPhone === 'Not available' ? '' : displayPhone;
      default:
        return '';
    }
  };

  const NAME_FIELDS = ['first_name', 'last_name'];
  const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

  const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');

  const requestedPhoneDigits = String(requestValues.contact_number || '');
  const phoneError = requestedPhoneDigits && requestedPhoneDigits.length !== 11
    ? PHONE_NUMBER_ERROR
    : '';
  const requestedRank = String(requestValues.rank || '');
  const rankError = requestedRank && !RANK_OPTIONS.includes(requestedRank)
    ? 'Please select a valid rank.'
    : '';
  const isRequestSubmitDisabled = isRequestSaving || Boolean(phoneError) || Boolean(rankError);

  const filterRequestValueForField = (fieldName, rawValue) => {
    switch (fieldName) {
      case 'first_name':
      case 'last_name': {
        let value = String(rawValue || '').replace(/[^A-Za-z ]/g, '');
        value = value.replace(/^ +/, '');
        value = value.replace(/ {2,}/g, ' ');
        return value;
      }
      case 'email':
        return String(rawValue || '').replace(/[^A-Za-z0-9@._%+-]/g, '');
      case 'contact_number':
        return String(rawValue || '').replace(/[^0-9]/g, '').slice(0, 11);
      case 'rank':
        return RANK_OPTIONS.includes(rawValue) ? rawValue : '';
      default:
        return rawValue;
    }
  };

  const openRequestModal = () => {
    setRequestValues({ ...EMPTY_REQUEST_VALUES });
    setRequestReason('');
    setRequestMessage({ type: '', text: '' });
    setIsRequestModalOpen(true);
  };

  const closeRequestModal = () => {
    if (isRequestSaving) return;
    if (hasUnsavedRequest) {
      setIsDiscardRequestOpen(true);
      return;
    }
    setIsRequestModalOpen(false);
  };

  const discardRequestChanges = () => {
    setIsDiscardRequestOpen(false);
    setIsRequestModalOpen(false);
    setRequestValues({ ...EMPTY_REQUEST_VALUES });
    setRequestReason('');
    setRequestMessage({ type: '', text: '' });
  };

  const handleSubmitChangeRequest = async () => {
    if (isRequestSaving) return;
    setRequestMessage({ type: '', text: '' });

    if (rankError) {
      setRequestMessage({ type: 'error', text: 'Please select a valid rank.' });
      return;
    }

    if (phoneError) {
      setRequestMessage({ type: 'error', text: PHONE_NUMBER_ERROR });
      return;
    }

    const changes = {};
    for (const option of PROFILE_FIELD_OPTIONS) {
      let requestedValue = String(requestValues[option.value] || '').trim();
      if (!requestedValue) continue;

      if (NAME_FIELDS.includes(option.value)) {
        requestedValue = normalizeSpaces(requestedValue);
        if (!NAME_PATTERN.test(requestedValue)) {
          setRequestMessage({
            type: 'error',
            text: `${option.label} may only contain letters and spaces.`
          });
          return;
        }
      }

      changes[option.value] = {
        currentValue: getCurrentFieldValue(option.value),
        requestedValue
      };
    }

    if (Object.keys(changes).length === 0) {
      setRequestMessage({ type: 'error', text: 'Enter at least one detail you want to change.' });
      return;
    }

    setIsRequestSaving(true);

    const { error } = await submitProfileChangeRequest(currentUser?.admin_id, {
      changes,
      reason: requestReason
    });

    if (error) {
      setRequestMessage({ type: 'error', text: error });
      setIsRequestSaving(false);
      return;
    }

    setIsRequestSaving(false);
    setIsRequestModalOpen(false);
    setRequestValues({ ...EMPTY_REQUEST_VALUES });
    setRequestReason('');
    loadMyRequests();
    showModal({
      type: 'success',
      message: 'Your change request has been submitted for admin review.'
    });

    void logPersonnelActivity({
      personnelId: currentUser.admin_id,
      activityType: 'profile_change_request',
      action: 'Profile Change Request Submitted',
      details: `Requested changes to ${Object.keys(changes).map(getProfileFieldLabel).join(', ')}.`
    });
  };
const FACE_LIVENESS_FAILURE_MESSAGE =
  'Live face verification failed. Please use your actual face and follow the on-screen instructions.';

// Runs only after LivenessCheck reports a pass, on the exact live frame
// captured the instant the left/right challenge and re-center settled - a
// static photo (printed, on-screen, or on another phone) can't reach this
// point. Mirrors handleLivenessPassed in AttendanceConfirm.jsx.
const handleFaceLivenessPassed = async ({ canvas }, attemptId) => {
  if (attemptIdRef.current !== attemptId) return; // stale attempt, ignore

  setShowLiveness(false);
  setLivenessPhase('idle');
  setFaceRegError('');
  setFaceLoading(true);

  try {
    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (attemptIdRef.current !== attemptId) return;

    if (!detection) {
      setFaceRegError('No face detected. Please try again.');
      setFaceLoading(false);
      return;
    }

    const descriptor = Array.from(detection.descriptor);

    const { error } = await registerFace(currentUser.admin_id, descriptor);

    if (attemptIdRef.current !== attemptId) return;

    if (error) {
      console.error("Supabase error:", error);
      const cooldownUntil = getFaceIdCooldownUntil(error);
      setFaceLoading(false);
      setIsFaceModalOpen(false);
      showModal(
        cooldownUntil
          ? { type: 'info', message: `Face ID is already registered. You can update your Face ID again on ${formatFaceCooldownDate(cooldownUntil)}.` }
          : { type: 'error', message: 'Failed to save face data.' }
      );
      return;
    }

    setFaceLoading(false);
    setIsFaceModalOpen(false);
    setFaceRecord({ updated_at: new Date().toISOString() });
    showModal({ type: 'success', message: 'Face registered successfully!' });

    void logPersonnelActivity({
      personnelId: currentUser.admin_id,
      activityType: 'face_id_registration',
      action: 'Face ID Registered',
      details: 'Registered Face ID for attendance verification.'
    });
  } catch (err) {
    if (attemptIdRef.current !== attemptId) return;
    console.error("Face registration error:", err);
    setFaceRegError('Face registration failed. Please try again.');
    setFaceLoading(false);
  }
};

const handleFaceLivenessFailed = (reason, attemptId) => {
  if (attemptIdRef.current !== attemptId) return; // stale attempt, ignore

  setShowLiveness(false);
  setLivenessPhase('idle');
  setFaceRegError(FACE_LIVENESS_FAILURE_MESSAGE);
  // Liveness failed before any capture/registration ever ran - the camera
  // stays live so "Try Again" can restart the challenge instantly.
};

const retryFaceLiveness = () => {
  const attemptId = attemptIdRef.current + 1;
  attemptIdRef.current = attemptId;
  setFaceRegError('');
  setLivenessPhase('idle');
  setLivenessSessionId(crypto.randomUUID());
  setLivenessAttemptKey(attemptId);
  setShowLiveness(true);
};
const showModal = ({ type = "info", message, onConfirm }) => {
  setModal({
    open: true,
    type,
    message,
    onConfirm: onConfirm || null,
  });
};

    // send to backend
   
  return (
    <div className="personnel-profile-container">
      <Sidebar variant="personnel" />

      <div className="personnel-profile-content" ref={profileContentRef}>
        <div className="personnel-profile-header-fixed" ref={profileHeaderRef}>
          <PageHeader
            title="Profile"
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            userName={displayName}
            userRole={displayRole}
            userAvatar={profileImage}
            variant="personnel"
            showSearch={false}
          />
        </div>

        <div className="profile-content">
          <div className="profile-layout">
            <aside className="profile-summary-card">
              <div className="profile-picture profile-picture-large">
                <img src={profileImage} alt="Profile" onError={(e) => (e.target.src = '/user-avatar.svg')} />
                <button
                  className="edit-picture-btn"
                  onClick={() => document.getElementById('profileImageInput').click()}
                  disabled={uploading}
                  title="Change profile picture"
                >
                  <span>{uploading ? '⏳' : '✏️'}</span>
                </button>
                <input
                  id="profileImageInput"
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleImageSelected}
                />
              </div>

              <div className="profile-summary-name">{displayName}</div>
              <div className="profile-summary-role">{displayRole}</div>

              <div className="profile-summary-meta">
                <span><strong>Email:</strong> {currentUser?.email || 'No email set'}</span>
                <span><strong>Phone Number:</strong> {displayPhone}</span>
              </div>
            </aside>

            <div className="profile-details-column">
              <section className="profile-info-card">
                <div className="profile-card-header">
                  <div>
                    <h3>General Information</h3>
                    <p>Your account information is displayed below. To request an update to any profile detail, click the &quot;Request to Change Information&quot; button.</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="firstName">First Name</label>
                   <input
  id="firstName"
  type="text"
  value={currentUser?.first_name || ''}
  disabled
/>
                  </div>

                  <div className="form-field">
                    <label htmlFor="lastName">Last Name</label>
                   <input
  id="lastName"
  type="text"
  value={currentUser?.last_name || ''}
  disabled
/>
                  </div>
                </div>

                <div className="form-field-full">
  <label>Rank</label>

  <input
    type="text"
    value={currentUser?.rank || ''}
    disabled
  />
</div>

             
                
              </section>

              <section className="profile-info-card profile-security-card">
                <div className="profile-card-header">
                  <div>
                    <h3>Security</h3>
                    <p>Review the account details tied to your login.</p>
                  </div>
                </div>

                <div className="security-grid">
                  <div className="form-field-full">
                    <label htmlFor="email">Email</label>
                    <input id="email" type="email" value={currentUser?.email || ''} disabled />
                  </div>

                  <div className="form-field-full">
                    <label htmlFor="phone">Phone Number</label>
                    <input id="phone" type="text" value={displayPhone} disabled />
                  </div>
                </div>

                <div className="profile-actions-row">
                  <button
                    type="button"
                    className="change-password-btn"
                    onClick={openRequestModal}
                  >
                    Request to Change Information
                  </button>
                  <button
                    type="button"
                    className="change-password-btn register-face-btn"
                    onClick={handleFaceRegisterClick}
                  >
                    {faceRecord ? 'Update Face ID' : 'Register Face ID'}
                  </button>
                </div>

                <div className="my-requests-section">
                  <h4>Your Change Requests</h4>
                  {loadingMyRequests ? (
                    <p className="my-requests-empty">Loading your requests...</p>
                  ) : myRequests.length === 0 ? (
                    <p className="my-requests-empty">You have not submitted any change requests yet.</p>
                  ) : (
                    <div className="my-requests-list">
                      {myRequests.map((request) => (
                        <div className="my-request-item" key={request.request_id}>
                          <div className="my-request-item-header">
                            <span className="my-request-field">
                              {request.change_items?.length > 1
                                ? `${request.change_items.length} details`
                                : getProfileFieldLabel(request.field_name)}
                            </span>
                            <span className={`my-request-status my-request-status-${request.status}`}>
                              {formatStatusLabel(request.status)}
                            </span>
                          </div>
                          <div className="my-request-change-list">
                            {(request.change_items || []).map((change) => (
                              <div className="my-request-change" key={change.field_name}>
                                <strong>{change.field_label}</strong>
                                <span>{change.current_value || '—'} to {change.requested_value}</span>
                              </div>
                            ))}
                          </div>
                          {request.reason && (
                            <div className="my-request-reason">Reason: {request.reason}</div>
                          )}
                          <div className="my-request-dates">
                            <span>Requested {new Date(request.requested_at).toLocaleDateString()}</span>
                            {request.reviewed_at && (
                              <span>Reviewed {new Date(request.reviewed_at).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

               {modal.open && (
  <div className="modal-overlay" role="dialog" aria-modal="true">
    <div className={`modal modal-${modal.type}`}>

      <div className={`modal-icon modal-icon-${modal.type}`}>
        {modal.type === 'success' ? '✓' : modal.type === 'error' ? '!' : modal.type === 'confirm' ? '?' : 'i'}
      </div>

      <p>{modal.message}</p>

      <div className="modal-actions">
        {modal.type === "confirm" ? (
          <>
            <button
              className="cancel-btn"
              onClick={() => setModal({ ...modal, open: false })}
            >
              Cancel
            </button>

            <button
              className="save-btn"
              onClick={() => {
                modal.onConfirm?.();
                setModal({ ...modal, open: false });
              }}
            >
              Replace
            </button>
          </>
        ) : (
          <button
            className="save-btn"
            onClick={() => setModal({ ...modal, open: false })}
          >
            OK
          </button>
        )}
      </div>

    </div>
  </div>
)}

        <AvatarCropModal
          file={cropFile}
          onCancel={handleCropCancel}
          onApply={handleCropApply}
          onError={handleCropError}
        />

        {isRequestModalOpen && (
          <div className="request-modal-overlay" role="dialog" aria-modal="true">
            <div className="request-modal">
              <div className="request-modal-header">
                <h3>Request to Change Information</h3>
                <CloseButton
                  className="request-modal-close"
                  onClick={closeRequestModal}
                  label="Close request modal"
                />
              </div>

              <div className="request-modal-body">
                <p className="request-modal-intro">
                  Enter only the details you want changed. All entered details will be submitted as one request.
                </p>

                <div className="request-change-fields">
                  {PROFILE_FIELD_OPTIONS.map((option) => (
                    <div className="request-change-field" key={option.value}>
                      <label htmlFor={`request-${option.value}`}>{option.label}</label>
                      <span className="request-current-value">
                        Current: {getCurrentFieldValue(option.value) || '—'}
                      </span>
                      {option.value === 'rank' ? (
                        <select
                          id={`request-${option.value}`}
                          value={requestValues.rank || ''}
                          onChange={(event) => setRequestValues((current) => ({
                            ...current,
                            rank: filterRequestValueForField('rank', event.target.value)
                          }))}
                        >
                          <option value="">Select new rank...</option>
                          {RANK_OPTIONS.map((code) => (
                            <option key={code} value={code}>{RANK_LABELS[code]}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={`request-${option.value}`}
                          type={option.value === 'email' ? 'email' : 'text'}
                          inputMode={option.value === 'contact_number' ? 'numeric' : undefined}
                          maxLength={option.value === 'contact_number' ? 11 : undefined}
                          value={requestValues[option.value] || ''}
                          onChange={(event) => setRequestValues((current) => ({
                            ...current,
                            [option.value]: filterRequestValueForField(option.value, event.target.value)
                          }))}
                          placeholder={`New ${option.label.toLowerCase()}`}
                        />
                      )}
                      {option.value === 'contact_number' && phoneError && (
                        <span className="request-field-error">{phoneError}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="form-field-full">
                  <label htmlFor="requestReason">Reason (optional)</label>
                  <textarea
                    id="requestReason"
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Explain why you are requesting this change"
                    rows={3}
                  />
                </div>

                {requestMessage.text && (
                  <div className={`request-modal-message request-modal-message-${requestMessage.type}`}>
                    {requestMessage.text}
                  </div>
                )}
              </div>

              <div className="request-modal-footer">
                <button type="button" className="cancel-btn" onClick={closeRequestModal} disabled={isRequestSaving}>
                  Cancel
                </button>
                <button type="button" className="save-btn" onClick={handleSubmitChangeRequest} disabled={isRequestSubmitDisabled}>
                  {isRequestSaving ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        )}
        {isFaceModalOpen && (
  <div className="face-modal-overlay">
    <div className="face-modal">

      <h2>Face Registration</h2>
      <p>
        {faceLoading
          ? 'Registering your Face ID...'
          : showLiveness
            ? 'Follow the on-screen instructions to verify you are live.'
            : 'Center your face, then follow the on-screen instructions to verify you are live.'}
      </p>

      <div className={`face-camera-box face-camera-box--${showLiveness ? livenessPhase : 'idle'}`}>
        {/* Raw, non-inverted <video> - the mirror below is a CSS-only
            display transform (matches a normal front-camera app); the
            underlying frame MediaPipe/face-api read is never flipped. */}
        <video ref={videoRef} className="face-video" autoPlay muted playsInline />
        {showLiveness && <div className="face-camera-guide" aria-hidden="true" />}
      </div>

      {showLiveness && (
        <LivenessCheck
          key={livenessAttemptKey}
          videoRef={videoRef}
          qrSessionId={livenessSessionId}
          onPassed={(result) => handleFaceLivenessPassed(result, livenessAttemptKey)}
          onFailed={(reason) => handleFaceLivenessFailed(reason, livenessAttemptKey)}
          onPhaseChange={setLivenessPhase}
        />
      )}

      {faceRegError && <div className="face-reg-error">{faceRegError}</div>}

      <div className="face-modal-actions">
        {faceRegError && !showLiveness && !faceLoading && (
          <button
            className="save-btn"
            onClick={retryFaceLiveness}
          >
            Try Again
          </button>
        )}

        <button
          className="cancel-btn"
          onClick={() => setIsFaceModalOpen(false)}
          disabled={faceLoading}
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}

        <UnsavedChangesPrompt
          when={hasUnsavedRequest}
          title="Leave without submitting?"
          message="Your profile change request has not been submitted. Are you sure you want to leave this page?"
          stayLabel="Keep Editing"
        />

        {isDiscardRequestOpen && (
          <UnsavedChangesDialog
            title="Discard this request?"
            message="The information you entered has not been submitted. Are you sure you want to close this request?"
            stayLabel="Keep Editing"
            leaveLabel="Discard Changes"
            onStay={() => setIsDiscardRequestOpen(false)}
            onLeave={discardRequestChanges}
          />
        )}
      </div>
    </div>
  );
}
