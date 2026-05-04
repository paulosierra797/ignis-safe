import React, { useState, useEffect } from 'react';
import { useUser } from '../context/UserContext';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import { uploadProfileImage } from '../utils/imageService';
import { updateUser } from '../utils/usersService';
import { updatePassword, verifyCurrentPassword } from '../utils/authService';
import './PersonnelProfile.css';

export default function PersonnelProfile() {
  const { currentUser, setCurrentUser } = useUser();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profileImage, setProfileImage] = useState('/user-avatar.png');
  const [enablePasswordChange, setEnablePasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const displayName = `${currentUser?.rank || ''} ${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() || 'Personnel';
  const displayPhone = currentUser?.phone || currentUser?.phone_number || currentUser?.mobile || 'Not available';
  const [isSaving, setIsSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);
  const hasNameChanges = (firstName !== (currentUser?.first_name || '')) || (lastName !== (currentUser?.last_name || ''));

  useEffect(() => {
    if (currentUser) {
      // Set name fields
      if (currentUser.first_name) {
        setFirstName(currentUser.first_name);
      }
      if (currentUser.last_name) {
        setLastName(currentUser.last_name);
      }
      // Set profile image
      if (currentUser.avatar_url) {
        setProfileImage(currentUser.avatar_url);
      }
    }
  }, [currentUser]);

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
        alert('Error uploading image: ' + error);
      } else {
        setProfileImage(imageUrl);
        // Update local user context
        if (setCurrentUser) {
          setCurrentUser({ ...currentUser, avatar_url: imageUrl });
        }
        alert('Profile image updated successfully!');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      alert('Error uploading image');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (isSaving) return;
    const isPasswordChangeRequested = enablePasswordChange;
    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

    if (isPasswordChangeRequested) {
      if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in current password, new password, and confirm password.');
        return;
      }

      if (!strongPasswordRegex.test(newPassword)) {
        alert('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
        return;
      }

      const { valid, error: verifyError } = await verifyCurrentPassword(currentPassword);
      if (verifyError) {
        alert('Could not verify current password: ' + verifyError);
        return;
      }

      if (!valid) {
        alert('Current password is incorrect.');
        return;
      }

      if (newPassword !== confirmPassword) {
        alert('New password and confirm password do not match.');
        return;
      }
    }

    try {
      setIsSaving(true);
      const { error } = await updateUser(currentUser.admin_id, {
        first_name: firstName,
        last_name: lastName
      });

      if (error) {
        alert('Error saving changes: ' + error);
      } else {
        if (isPasswordChangeRequested) {
          const { error: passwordError } = await updatePassword(newPassword);
          if (passwordError) {
            alert('Profile updated, but password change failed: ' + passwordError);
            return;
          }
        }

        // Update local user context
        if (setCurrentUser) {
          setCurrentUser({ ...currentUser, first_name: firstName, last_name: lastName });
        }
        setEnablePasswordChange(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        alert(isPasswordChangeRequested ? 'Profile and password updated successfully!' : 'Profile updated successfully!');
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Error saving changes:', err);
      alert('Error saving changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Save only the password (allow independent save from profile update)
  const handleSavePassword = async () => {
    if (isPasswordSaving) return;
    setIsPasswordSaving(true);

    try {
      if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please complete all password fields.');
        return;
      }

      const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
      if (!strongPasswordRegex.test(newPassword)) {
        alert('Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.');
        return;
      }

      const { valid, error: verifyError } = await verifyCurrentPassword(currentPassword);
      if (verifyError) {
        alert('Could not verify current password: ' + verifyError);
        return;
      }

      if (!valid) {
        alert('Current password is incorrect.');
        return;
      }

      if (newPassword !== confirmPassword) {
        alert('New password and confirm password do not match.');
        return;
      }

      const { error: passwordError } = await updatePassword(newPassword);
      if (passwordError) {
        alert('Error updating password: ' + passwordError);
        return;
      }

      // Reset password form
      setEnablePasswordChange(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      alert('Password updated successfully!');
    } catch (err) {
      console.error('Error saving password:', err);
      alert('Error saving password');
    } finally {
      setIsPasswordSaving(false);
    }
  };

  return (
    <div className="personnel-profile-container">
      <Sidebar variant="personnel" />

      <div className="personnel-profile-content">
        <PageHeader
          title="Profile"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          userName={displayName}
          userRole={currentUser?.role || 'Personnel'}
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
              <div className="profile-summary-role">{currentUser?.role || 'Personnel'}</div>

              <div className="profile-summary-meta">
                <span>{currentUser?.email || 'No email set'}</span>
                <span>{displayPhone}</span>
              </div>
            </aside>

            <div className="profile-details-column">
              <section className="profile-info-card">
                <div className="profile-card-header">
                  <div>
                    <h3>General Information</h3>
                    <p>Manage the name shown on your account.</p>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-field">
                    <label htmlFor="firstName">First Name</label>
                    <input
                      id="firstName"
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>

                  <div className="form-field">
                    <label htmlFor="lastName">Last Name</label>
                    <input
                      id="lastName"
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-field-full">
                  <label htmlFor="rank">Rank</label>
                  <div className="input-with-icon">
                    <input id="rank" type="text" value={currentUser?.rank || ''} disabled />
                    <span className="lock-icon">🔒</span>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    className="save-btn"
                    onClick={handleSaveChanges}
                    disabled={!hasNameChanges || isSaving}
                    type="button"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
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

                <div className="change-password-option">
                  <button
                    type="button"
                    className="change-password-btn"
                    onClick={() => {
                      const nextState = !enablePasswordChange;
                      setEnablePasswordChange(nextState);
                      if (!nextState) {
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setShowCurrentPassword(false);
                        setShowNewPassword(false);
                        setShowConfirmPassword(false);
                      }
                    }}
                  >
                    {enablePasswordChange ? 'Cancel Password Change' : 'Change Password'}
                  </button>
                </div>

                {enablePasswordChange && (
                  <div className="password-change-panel">
                    <div className="form-field-full">
                      <label htmlFor="currentPassword">Current Password</label>
                      <div className="password-input-wrapper">
                        <input
                          id="currentPassword"
                          type={showCurrentPassword ? 'text' : 'password'}
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          placeholder="Enter current password"
                        />
                        <button
                          type="button"
                          className="toggle-password-btn"
                          onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        >
                          {showCurrentPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    <div className="form-field-full">
                      <label htmlFor="newPassword">New Password</label>
                      <div className="password-input-wrapper">
                        <input
                          id="newPassword"
                          type={showNewPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          className="toggle-password-btn"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                        >
                          {showNewPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                      <small className="password-hint">
                        Must be at least 8 characters with uppercase, lowercase, number, and symbol.
                      </small>
                    </div>

                    <div className="form-field-full">
                      <label htmlFor="confirmPassword">Confirm New Password</label>
                      <div className="password-input-wrapper">
                        <input
                          id="confirmPassword"
                          type={showConfirmPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm new password"
                        />
                        <button
                          type="button"
                          className="toggle-password-btn"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        >
                          {showConfirmPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                    <div className="form-actions" style={{ marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        className="save-btn"
                        onClick={handleSavePassword}
                        disabled={isPasswordSaving}
                      >
                        {isPasswordSaving ? 'Saving...' : 'Save Password'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
