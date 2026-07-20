import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { uploadProfileImage } from '../utils/imageService';
import { updateUser, logAdminActivity } from '../utils/usersService';
import './AdminProfile.css';

const NAME_PATTERN = /^[A-Za-z]+(?: [A-Za-z]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');

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

  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savingSecurity, setSavingSecurity] = useState(false);

  const [modal, setModal] = useState({ open: false, type: 'info', message: '' });

  const displayName = `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 'Admin';
  const displayRole = formatRoleLabel(currentUser?.role);
  const displayPhone = currentUser?.contact_number || currentUser?.phone || currentUser?.phone_number || 'Not available';

  const showModal = (type, message) => setModal({ open: true, type, message });
  const closeModal = () => setModal((prev) => ({ ...prev, open: false }));

  useEffect(() => {
    if (!currentUser) return;
    setFirstName(currentUser.first_name || '');
    setLastName(currentUser.last_name || '');
    setPosition(currentUser.rank || '');
    setEmail(currentUser.email || '');
    setPhone(currentUser.contact_number || currentUser.phone || currentUser.phone_number || '');
    if (currentUser.avatar_url) {
      setProfileImage(currentUser.avatar_url);
    }
  }, [currentUser]);

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const { data: imageUrl, error } = await uploadProfileImage(currentUser.admin_id, file);

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

    if (!normalizedFirst || !NAME_PATTERN.test(normalizedFirst)) {
      showModal('error', 'First name may only contain letters and spaces.');
      return;
    }
    if (!normalizedLast || !NAME_PATTERN.test(normalizedLast)) {
      showModal('error', 'Last name may only contain letters and spaces.');
      return;
    }

    setSavingGeneral(true);
    const { error } = await updateUser(currentUser.admin_id, {
      first_name: normalizedFirst,
      last_name: normalizedLast,
      rank: position.trim()
    });
    setSavingGeneral(false);

    if (error) {
      showModal('error', 'Failed to update general information: ' + error);
      return;
    }

    setFirstName(normalizedFirst);
    setLastName(normalizedLast);
    if (setCurrentUser) {
      setCurrentUser({ ...currentUser, first_name: normalizedFirst, last_name: normalizedLast, rank: position.trim() });
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

    const normalizedEmail = String(email || '').trim();
    const normalizedPhone = String(phone || '').replace(/[^0-9+ ]/g, '').trim();

    if (!normalizedEmail || !EMAIL_PATTERN.test(normalizedEmail)) {
      showModal('error', 'Please enter a valid email address.');
      return;
    }

    setSavingSecurity(true);
    const { error } = await updateUser(currentUser.admin_id, {
      email: normalizedEmail,
      contact_number: normalizedPhone
    });
    setSavingSecurity(false);

    if (error) {
      showModal('error', 'Failed to update security details: ' + error);
      return;
    }

    setEmail(normalizedEmail);
    setPhone(normalizedPhone);
    if (setCurrentUser) {
      setCurrentUser({ ...currentUser, email: normalizedEmail, contact_number: normalizedPhone });
    }
    showModal('success', 'Security details updated successfully!');

    void logAdminActivity({
      actorId: currentUser.admin_id,
      actorName: displayName,
      action: 'Security Details Updated',
      actionType: 'edit',
      details: 'Updated admin email/phone number.'
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
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="adminLastName">Last Name</label>
                    <input
                      id="adminLastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
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
                    <p>Review and update the account details tied to your login.</p>
                  </div>
                </div>

                <div className="security-grid">
                  <div className="form-field-full">
                    <label htmlFor="adminEmail">Email</label>
                    <input
                      id="adminEmail"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-field-full">
                    <label htmlFor="adminPhone">Phone Number</label>
                    <input
                      id="adminPhone"
                      type="text"
                      value={phone}
                      placeholder="e.g. 09171234567"
                      onChange={(e) => setPhone(e.target.value)}
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
      </div>
    </div>
  );
}
