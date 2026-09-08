import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { uploadProfileImage } from '../utils/imageService';
import { updateUser, logAdminActivity } from '../utils/usersService';
import { AVATAR_MAX_SIZE, AVATAR_ALLOWED_TYPES } from '../utils/avatarCrop';
import AvatarCropModal from './AvatarCropModal';
import UnsavedChangesPrompt from './UnsavedChangesPrompt';
import './AdminProfile.css';

const NAME_PATTERN = /^\p{L}+(?:[ '-]\p{L}+)*$/u;

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const sanitizeName = (value) => String(value || '').replace(/[^\p{L}\s'-]/gu, '');
const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

const formatRoleLabel = (role) => {
  if (!role) return 'Admin';
  return role
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function AdminProfile() {
  const { currentUser, setCurrentUser } = useUser();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState('/user-avatar.svg');
  const [cropFile, setCropFile] = useState(null);

  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);

  const [modal, setModal] = useState({ open: false, type: 'info', message: '' });
  const [confirmModal, setConfirmModal] = useState({ open: false, changes: [], onConfirm: null });
  const [profileInitialized, setProfileInitialized] = useState(false);

  const displayName = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 'Admin';
  const displayRole = formatRoleLabel(currentUser?.role);
  const displayPhone = currentUser?.contact_number || currentUser?.phone || currentUser?.phone_number || 'Not available';
  const savedPhone = digitsOnly(currentUser?.contact_number || currentUser?.phone || currentUser?.phone_number || '');
  const hasUnsavedProfileChanges = profileInitialized && Boolean(currentUser) && (
    normalizeSpaces(firstName) !== (currentUser.first_name || '')
    || normalizeSpaces(lastName) !== (currentUser.last_name || '')
    || position.trim() !== (currentUser.rank || '')
    || digitsOnly(phone) !== savedPhone
  );

  const showModal = (type, message) => setModal({ open: true, type, message });
  const closeModal = () => setModal((prev) => ({ ...prev, open: false }));

  useEffect(() => {
    if (!currentUser) return;
    setFirstName(currentUser.first_name || '');
    setLastName(currentUser.last_name || '');
    setPosition(currentUser.rank || '');
    setEmail(currentUser.email || '');
    setPhone(digitsOnly(currentUser.contact_number || currentUser.phone || currentUser.phone_number || '').slice(0, 11));
    if (currentUser.avatar_url) {
      setProfileImage(currentUser.avatar_url);
    }
    setProfileInitialized(true);
  }, [currentUser]);

  const handleImageSelected = (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      showModal('error', 'Invalid file type. Please upload an image (JPEG, PNG, GIF, or WebP).');
      return;
    }

    if (file.size > AVATAR_MAX_SIZE) {
      showModal('error', 'File size exceeds 5MB. Please upload a smaller image.');
      return;
    }

    setCropFile(file);
  };

  const handleCropCancel = () => {
    setCropFile(null);
  };

  const handleCropError = (message) => {
    setCropFile(null);
    showModal('error', message || 'The avatar could not be cropped.');
  };

  const handleCropApply = async (croppedFile) => {
    setCropFile(null);
    setUploading(true);
    try {
      const { data: imageUrl, error } = await uploadProfileImage(currentUser.admin_id, croppedFile);

      if (error) {
        showModal('error', 'Error uploading image: ' + error);
      } else {
        setProfileImage(imageUrl);
        if (setCurrentUser) {
          setCurrentUser({ ...currentUser, avatar_url: imageUrl });
        }
        showModal('success', 'Profile image updated successfully!');

        void logAdminActivity({
          actorId: currentUser.admin_id,
          actorName: displayName,
          action: 'Profile Image Updated',
          actionType: 'edit',
          details: 'Updated admin profile picture.'
        });
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      showModal('error', 'Error uploading image.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveGeneral = async () => {
    if (savingGeneral) return;

    const normalizedFirst = normalizeSpaces(firstName);
    const normalizedLast = normalizeSpaces(lastName);
    const normalizedPosition = position.trim();

    if (!normalizedFirst || !NAME_PATTERN.test(normalizedFirst)) {
      showModal('error', 'First name may only contain letters, spaces, hyphens, and apostrophes.');
      return;
    }
    if (!normalizedLast || !NAME_PATTERN.test(normalizedLast)) {
      showModal('error', 'Last name may only contain letters, spaces, hyphens, and apostrophes.');
      return;
    }

    const changes = [];
    if (normalizedFirst !== (currentUser.first_name || '')) {
      changes.push({ label: 'First Name', oldValue: currentUser.first_name || '—', newValue: normalizedFirst });
    }
    if (normalizedLast !== (currentUser.last_name || '')) {
      changes.push({ label: 'Last Name', oldValue: currentUser.last_name || '—', newValue: normalizedLast });
    }
    if (normalizedPosition !== (currentUser.rank || '')) {
      changes.push({ label: 'Position', oldValue: currentUser.rank || '—', newValue: normalizedPosition || '—' });
    }

    if (changes.length === 0) return;

    setConfirmModal({
      open: true,
      changes,
      onConfirm: () => saveGeneral(normalizedFirst, normalizedLast, normalizedPosition)
    });
  };

  const saveGeneral = async (normalizedFirst, normalizedLast, normalizedPosition) => {
    setSavingGeneral(true);
    const { error } = await updateUser(currentUser.admin_id, {
      first_name: normalizedFirst,
      last_name: normalizedLast,
      rank: normalizedPosition
    });
    setSavingGeneral(false);

    if (error) {
      showModal('error', 'Failed to update general information: ' + error);
      return;
    }

    setFirstName(normalizedFirst);
    setLastName(normalizedLast);
    setPosition(normalizedPosition);
    if (setCurrentUser) {
      setCurrentUser({ ...currentUser, first_name: normalizedFirst, last_name: normalizedLast, rank: normalizedPosition });
    }
    showModal('success', 'General information updated successfully!');

    void logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: `${normalizedFirst} ${normalizedLast}`.trim(),
      action: 'General Information Updated',
      actionType: 'edit',
      details: 'Updated admin general information.'
    });
  };

  const handleSaveSecurity = async () => {
    if (savingSecurity) return;

    const normalizedPhone = digitsOnly(phone);

    if (normalizedPhone.length !== 11) {
      showModal('error', 'Phone number must contain exactly 11 digits.');
      return;
    }

    const currentPhone = digitsOnly(currentUser.contact_number || currentUser.phone || currentUser.phone_number || '');
    const changes = [];
    if (normalizedPhone !== currentPhone) {
      changes.push({ label: 'Phone Number', oldValue: currentPhone || '—', newValue: normalizedPhone || '—' });
    }

    if (changes.length === 0) return;

    setConfirmModal({
      open: true,
      changes,
      onConfirm: () => saveSecurity(normalizedPhone)
    });
  };

  const saveSecurity = async (normalizedPhone) => {
    setSavingSecurity(true);
    const { error } = await updateUser(currentUser.admin_id, {
      contact_number: normalizedPhone
    });
    setSavingSecurity(false);

    if (error) {
      showModal('error', 'Failed to update security details: ' + error);
      return;
    }

    setPhone(normalizedPhone);
    if (setCurrentUser) {
      setCurrentUser({ ...currentUser, contact_number: normalizedPhone });
    }
    showModal('success', 'Phone number updated successfully!');

    void logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: displayName,
      action: 'Security Details Updated',
      actionType: 'edit',
      details: 'Updated admin phone number.'
    });
  };

  return (
    <div className="admin-profile-container">
      <Sidebar variant="admin" />

      <div className="admin-profile-content">
        <PageHeader
          title="Profile"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          userName={displayName}
          userRole={displayRole}
          userAvatar={profileImage}
          variant="admin"
          showSearch={false}
        />

        <div className="profile-content">
          <div className="profile-layout">
            <aside className="profile-summary-card">
              <div className="profile-picture profile-picture-large">
                <img src={profileImage} alt="Profile" onError={(e) => (e.target.src = '/user-avatar.svg')} />
                <button
                  className="edit-picture-btn"
                  onClick={() => document.getElementById('adminProfileImageInput').click()}
                  disabled={uploading}
                  title="Change profile picture"
                >
                  <span>{uploading ? '⏳' : '✏️'}</span>
                </button>
                <input
                  id="adminProfileImageInput"
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
                    <p>Your account information is displayed below. Update your details and click &quot;Save Changes&quot; to apply them.</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="adminFirstName">First Name</label>
                    <input
                      id="adminFirstName"
                      type="text"
                      value={firstName}
                      autoComplete="given-name"
                      onChange={(e) => setFirstName(sanitizeName(e.target.value))}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="adminLastName">Last Name</label>
                    <input
                      id="adminLastName"
                      type="text"
                      value={lastName}
                      autoComplete="family-name"
                      onChange={(e) => setLastName(sanitizeName(e.target.value))}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="adminRole">Role</label>
                    <input id="adminRole" type="text" value={displayRole} readOnly disabled />
                  </div>

                  <div className="form-field">
                    <label htmlFor="adminPosition">Position</label>
                    <input
                      id="adminPosition"
                      type="text"
                      value={position}
                      placeholder="e.g. System Administrator"
                      onChange={(e) => setPosition(e.target.value)}
                    />
                  </div>
                </div>

                <div className="profile-actions-row">
                  <button
                    type="button"
                    className="save-changes-btn"
                    onClick={handleSaveGeneral}
                    disabled={savingGeneral}
                  >
                    {savingGeneral ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </section>

              <section className="profile-info-card profile-security-card">
                <div className="profile-card-header">
                  <div>
                    <h3>Security</h3>
                    <p>Review your assigned login email and update your phone number.</p>
                  </div>
                </div>

                <div className="security-grid">
                  <div className="form-field-full">
                    <label htmlFor="adminEmail">Email</label>
                    <input
                      id="adminEmail"
                      type="email"
                      value={email}
                      disabled
                      aria-disabled="true"
                      title="The assigned administrator email cannot be changed."
                    />
                  </div>

                  <div className="form-field-full">
                    <label htmlFor="adminPhone">Phone Number</label>
                    <input
                      id="adminPhone"
                      type="tel"
                      value={phone}
                      placeholder="e.g. 09171234567"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      pattern="[0-9]{11}"
                      onChange={(e) => setPhone(digitsOnly(e.target.value).slice(0, 11))}
                    />
                  </div>
                </div>

                <div className="profile-actions-row">
                  <button
                    type="button"
                    className="save-changes-btn"
                    onClick={handleSaveSecurity}
                    disabled={savingSecurity}
                  >
                    {savingSecurity ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>

        {confirmModal.open && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal confirm-changes-modal">
              <h3>Confirm Changes</h3>
              <p>Are you sure you want to save these changes?</p>
              <ul className="confirm-changes-list">
                {confirmModal.changes.map((change) => (
                  <li key={change.label}>
                    <strong>{change.label}:</strong> {change.oldValue} → {change.newValue}
                  </li>
                ))}
              </ul>
              <div className="modal-actions">
                <button
                  className="cancel-btn"
                  onClick={() => setConfirmModal({ open: false, changes: [], onConfirm: null })}
                >
                  Cancel
                </button>
                <button
                  className="save-btn"
                  onClick={() => {
                    const { onConfirm } = confirmModal;
                    setConfirmModal({ open: false, changes: [], onConfirm: null });
                    onConfirm?.();
                  }}
                >
                  Confirm Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {modal.open && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className={`modal modal-${modal.type}`}>
              <div className={`modal-icon modal-icon-${modal.type}`}>
                {modal.type === 'success' ? '✓' : modal.type === 'error' ? '!' : 'i'}
              </div>
              <p>{modal.message}</p>
              <div className="modal-actions">
                <button className="save-btn" onClick={closeModal}>OK</button>
              </div>
            </div>
          </div>
        )}

        <AvatarCropModal
          file={cropFile}
          onCancel={handleCropCancel}
          onApply={handleCropApply}
          onError={handleCropError}
          theme="admin"
        />

        <UnsavedChangesPrompt
          when={hasUnsavedProfileChanges}
          title="Leave without saving?"
          message="Your profile changes have not been saved. Are you sure you want to leave this page?"
          stayLabel="Keep Editing"
        />
      </div>
    </div>
  );
}
