import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { uploadProfileImage } from '../utils/imageService';
import * as faceapi from 'face-api.js';
import { loadFaceModels } from '../utils/loadFaceModels';
import Webcam from 'react-webcam';
import './PersonnelProfile.css';
import { getFaceByAdminId, registerFace } from '../utils/faceApiService';
import {
  PROFILE_FIELD_OPTIONS,
  getProfileFieldLabel,
  getMyProfileChangeRequests,
  submitProfileChangeRequest
} from '../utils/profileChangeRequestsService';
import { logPersonnelActivity } from '../utils/activityLogService';

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

export default function PersonnelProfile() {
  const { currentUser, setCurrentUser } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [rank, setRank] = useState('');
  const [rankCustom, setRankCustom] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState('/user-avatar.png');
  const resolvedRank = rank === 'OTHER' ? rankCustom.trim() : rank;
  const displayName = `${resolvedRank || currentUser?.rank || ''} ${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 'Personnel';
  const displayPhone = currentUser?.contact_number || currentUser?.phone || currentUser?.phone_number || currentUser?.mobile || 'Not available';
  const displayRole = currentUser?.role
    ? currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)
    : 'Personnel';
  const [isFaceModalOpen, setIsFaceModalOpen] = useState(false);
const [faceDescriptor, setFaceDescriptor] = useState(null);
const [faceLoading, setFaceLoading] = useState(false);
const webcamRef = React.useRef(null);
const [faceBox, setFaceBox] = useState(null);
const [modal, setModal] = useState({
  open: false,
  type: "info", // "success" | "error" | "confirm"
  message: "",
  onConfirm: null,
});
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestField, setRequestField] = useState(PROFILE_FIELD_OPTIONS[0].value);
  const [requestValue, setRequestValue] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [isRequestSaving, setIsRequestSaving] = useState(false);
  const [requestMessage, setRequestMessage] = useState({ type: '', text: '' });
  const [myRequests, setMyRequests] = useState([]);
  const [loadingMyRequests, setLoadingMyRequests] = useState(false);
  useEffect(() => {
  const initModels = async () => {
    await loadFaceModels();
  };

  initModels();
}, []);

  const loadMyRequests = async () => {
    if (!currentUser?.admin_id) return;
    setLoadingMyRequests(true);
    const { data } = await getMyProfileChangeRequests(currentUser.admin_id);
    setMyRequests(data || []);
    setLoadingMyRequests(false);
  };

  useEffect(() => {
    loadMyRequests();
  }, [currentUser?.admin_id]);

  useEffect(() => {
  if (!isFaceModalOpen) return;

  let interval;

  const startDetection = async () => {
    interval = setInterval(async () => {
      if (!webcamRef.current) return;

      const screenshot = webcamRef.current.getScreenshot();
      if (!screenshot) return;

      const img = await faceapi.fetchImage(screenshot);

      const detection = await faceapi
        .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (detection) {
        setFaceBox(detection.detection.box);
      } else {
        setFaceBox(null);
      }
    }, 200); // adjust speed (200ms = smooth)

  };

  startDetection();

  return () => clearInterval(interval);
}, [isFaceModalOpen]);

  useEffect(() => {
    if (currentUser) {
      // Set name fields
      if (currentUser.first_name) {
        setFirstName(currentUser.first_name);
      }
      if (currentUser.last_name) {
        setLastName(currentUser.last_name);
      }
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

  if (data) {
    showModal({
      type: "info",
      message: "Face ID is already registered. You cannot register another one."
    });
    return;
  }

  setIsFaceModalOpen(true);
};
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: imageUrl, error } = await uploadProfileImage(
        currentUser.admin_id,
        file
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
        return String(rawValue || '').replace(/[^0-9]/g, '');
      case 'rank':
        return String(rawValue || '').replace(/[^A-Za-z0-9]/g, '');
      default:
        return rawValue;
    }
  };

  const openRequestModal = () => {
    setRequestField(PROFILE_FIELD_OPTIONS[0].value);
    setRequestValue('');
    setRequestReason('');
    setRequestMessage({ type: '', text: '' });
    setIsRequestModalOpen(true);
  };

  const closeRequestModal = () => {
    if (isRequestSaving) return;
    setIsRequestModalOpen(false);
  };

  const handleSubmitChangeRequest = async () => {
    if (isRequestSaving) return;
    setRequestMessage({ type: '', text: '' });

    let requestedValue = requestValue;
    if (NAME_FIELDS.includes(requestField)) {
      requestedValue = normalizeSpaces(requestValue);
      if (!requestedValue || !NAME_PATTERN.test(requestedValue)) {
        setRequestMessage({ type: 'error', text: 'Only letters and spaces are allowed.' });
        return;
      }
    }

    setIsRequestSaving(true);

    const { error } = await submitProfileChangeRequest(currentUser?.admin_id, {
      fieldName: requestField,
      currentValue: getCurrentFieldValue(requestField),
      requestedValue,
      reason: requestReason
    });

    if (error) {
      setRequestMessage({ type: 'error', text: error });
      setIsRequestSaving(false);
      return;
    }

    setIsRequestSaving(false);
    setIsRequestModalOpen(false);
    setRequestValue('');
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
      details: `Requested to change ${getProfileFieldLabel(requestField)} to "${requestedValue}".`
    });
  };
const captureFace = async () => {
  if (!webcamRef.current) return;

  setFaceLoading(true);

  try {
    const screenshot = webcamRef.current.getScreenshot();

    const img = await faceapi.fetchImage(screenshot);

    const detection = await faceapi
      .detectSingleFace(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      showModal({ type: 'error', message: 'No face detected. Please try again.' });
      setFaceLoading(false);

      return;
    }

    const descriptor = Array.from(detection.descriptor);

    // ✅ SAVE USING SERVICE
    const { error } = await registerFace(
      currentUser.admin_id,
      descriptor
    );

    if (error) {
      console.error("Supabase error:", error);
      showModal({ type: 'error', message: 'Failed to save face data.' });
      return;
    }

    showModal({ type: 'success', message: 'Face registered successfully!' });
    setIsFaceModalOpen(false);

    void logPersonnelActivity({
      personnelId: currentUser.admin_id,
      activityType: 'face_id_registration',
      action: 'Face ID Registered',
      details: 'Registered Face ID for attendance verification.'
    });

  } catch (err) {
    console.error("Face registration error:", err);
    showModal({ type: 'error', message: 'Face registration failed.' });

  } finally {
    setFaceLoading(false);
  }
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

      <div className="personnel-profile-content">
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

        <div className="profile-content">
          <div className="profile-layout">
            <aside className="profile-summary-card">
              <div className="profile-picture profile-picture-large">
                <img src={profileImage} alt="Profile" onError={(e) => (e.target.src = '/user-avatar.png')} />
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
                  onChange={handleImageUpload}
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
  readOnly
/>
                  </div>

                  <div className="form-field">
                    <label htmlFor="lastName">Last Name</label>
                   <input
  id="lastName"
  type="text"
  value={currentUser?.last_name || ''}
  readOnly
/>
                  </div>
                </div>

                <div className="form-field-full">
  <label>Rank</label>

  <input
    type="text"
    value={currentUser?.rank || ''}
    readOnly
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
                    className="change-password-btn"
                    onClick={handleFaceRegisterClick}
                  >
                    Register Face ID
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
                            <span className="my-request-field">{getProfileFieldLabel(request.field_name)}</span>
                            <span className={`my-request-status my-request-status-${request.status}`}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                          </div>
                          <div className="my-request-values">
                            <span>Current: {request.current_value || '—'}</span>
                            <span>Requested: {request.requested_value}</span>
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
        {isRequestModalOpen && (
          <div className="request-modal-overlay" role="dialog" aria-modal="true">
            <div className="request-modal">
              <div className="request-modal-header">
                <h3>Request to Change Information</h3>
                <button
                  type="button"
                  className="request-modal-close"
                  onClick={closeRequestModal}
                  aria-label="Close request modal"
                >
                  ×
                </button>
              </div>

              <div className="request-modal-body">
                <div className="form-field-full">
                  <label htmlFor="requestField">Field</label>
                  <select
                    id="requestField"
                    value={requestField}
                    onChange={(e) => {
                      setRequestField(e.target.value);
                      setRequestValue('');
                    }}
                  >
                    {PROFILE_FIELD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field-full">
                  <label>Current Value</label>
                  <input type="text" value={getCurrentFieldValue(requestField) || '—'} readOnly disabled />
                </div>

                <div className="form-field-full">
                  <label htmlFor="requestValue">Requested New Value</label>
                  <input
                    id="requestValue"
                    type="text"
                    value={requestValue}
                    onChange={(e) => setRequestValue(filterRequestValueForField(requestField, e.target.value))}
                    placeholder={`Enter new ${getProfileFieldLabel(requestField).toLowerCase()}`}
                  />
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
                <button type="button" className="save-btn" onClick={handleSubmitChangeRequest} disabled={isRequestSaving}>
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
      <p>Align your face inside the camera frame</p>

     <div className="face-camera-box">
  <div className="face-wrapper">

    <Webcam
      ref={webcamRef}
      screenshotFormat="image/jpeg"
      videoConstraints={{ facingMode: "user" }}
      className="face-webcam"
    />

    {/* GREEN FACE BOX OVERLAY */}
    {faceBox && (
      <div
        className="face-box"
        style={{
          top: faceBox.y,
          left: faceBox.x,
          width: faceBox.width,
          height: faceBox.height,
        }}
      />
    )}

  </div>
</div>

      <div className="face-modal-actions">
        <button
          className="save-btn"
          onClick={captureFace}
          disabled={faceLoading}
        >
          {faceLoading ? "Processing..." : "Capture Face"}
        </button>

        <button
          className="cancel-btn"
          onClick={() => setIsFaceModalOpen(false)}
        >
          Cancel
        </button>
      </div>

    </div>
  </div>
)}
      </div>
    </div>
  );
}
