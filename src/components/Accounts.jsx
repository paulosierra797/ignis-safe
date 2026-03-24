import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Accounts.css';
import { signUp } from '../utils/authService';
import { getAllUsers, deleteUser, logAdminActivity } from '../utils/usersService';
import { useUser } from '../context/UserContext';

export default function Accounts() {
  const { currentUser } = useUser();
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [personnelSearch, setPersonnelSearch] = useState('');
  const [rankFilter, setRankFilter] = useState('All Ranks');
  const [statusFilter, setStatusFilter] = useState('All Status');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    role: '',
    rank: '',
    password: ''
  });

  const handleClearFilters = () => {
    setPersonnelSearch('');
    setRankFilter('All Ranks');
    setStatusFilter('All Status');
  };

  // Fetch accounts on component mount
  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const { data, error } = await getAllUsers();
      if (error) {
        console.error('Error fetching accounts:', error);
      } else {
        setAccounts(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleDeleteUser = async (adminId) => {
    if (!adminId) {
      alert('Cannot delete this account because its ID is missing.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this user?')) {
      return;
    }

    try {
      const target = accounts.find((account) => account.admin_id === adminId);
      const { error, deletedCount } = await deleteUser(adminId);
      if (error) {
        alert('Error deleting user: ' + error);
      } else {
        if (!deletedCount) {
          alert('Delete request completed but no account was removed. Please check permissions/policies.');
          return;
        }

        await logAdminActivity({
          actorId: currentUser?.admin_id || null,
          actorName: currentUser?.name || currentUser?.email || 'Admin User',
          action: 'Account Deleted',
          actionType: 'archive',
          details: `Deleted account ${target?.email || adminId}${target?.role ? ` (${target.role})` : ''}.`,
          metadata: {
            deleted_admin_id: adminId,
            deleted_email: target?.email || null,
            deleted_role: target?.role || null
          }
        });

        alert('User deleted successfully');
        fetchAccounts(); // Refresh the list
      }
    } catch (err) {
      alert('Error deleting user: ' + err.message);
    }
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    const fieldName = id.replace('personnel-', '').replace(/-/g, '_');
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const handleAddPersonnel = async () => {
    // Validation
    if (!formData.first_name || !formData.last_name || !formData.email || !formData.role || !formData.rank || !formData.password) {
      setMessage({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    setIsLoading(true);
    setMessage({ type: '', text: '' });

    const submittedForm = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      role: formData.role,
      rank: formData.rank
    };

    try {
      console.log('Attempting to add personnel with email verification...');

      // Use signUp to create auth user and send verification email
      const result = await signUp(formData.email, formData.password, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        rank: formData.rank
      });
      
      console.log('Sign up result:', result);

      if (result.error) {
        console.error('Error from signup:', result.error);
        setMessage({ type: 'error', text: `Error: ${result.error}` });
        setIsLoading(false);
        return;
      }

      setMessage({ 
        type: 'success', 
        text: 'Personnel added successfully! Verification email sent to ' + formData.email 
      });

      await logAdminActivity({
        actorId: currentUser?.admin_id || null,
        actorName: currentUser?.name || currentUser?.email || 'Admin User',
        action: 'Account Created',
        actionType: 'registration',
        details: `Created account for ${submittedForm.first_name} ${submittedForm.last_name} (${submittedForm.role}, ${submittedForm.rank}) - ${submittedForm.email}.`,
        metadata: {
          created_email: submittedForm.email,
          created_role: submittedForm.role,
          created_rank: submittedForm.rank
        }
      });
      
      // Refresh accounts list
      fetchAccounts();
      
      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        role: '',
        rank: '',
        password: ''
      });

      // Close modal after success
      setTimeout(() => {
        setIsAddModalOpen(false);
        setMessage({ type: '', text: '' });
      }, 2500);
    } catch (err) {
      console.error('Error adding personnel:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to add personnel. Please check console for details.' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      role: '',
      rank: '',
      password: ''
    });
    setMessage({ type: '', text: '' });
  };

  const filteredAccounts = accounts.filter((account) => {
    const fullName = `${account.first_name || ''} ${account.last_name || ''}`.toLowerCase().trim();
    const matchSearch = fullName.includes(personnelSearch.toLowerCase());
    const matchRank = rankFilter === 'All Ranks' || account.rank === rankFilter;
    const matchStatus = statusFilter === 'All Status' || account.status === statusFilter;
    return matchSearch && matchRank && matchStatus;
  });

  return (
    <div className="accounts-container">
      <Sidebar />

      <div className="accounts-main">
        <PageHeader
          title="Accounts"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="accounts-header">
          <h2>Personnel Accounts</h2>
          <button className="add-personnel-btn" onClick={() => setIsAddModalOpen(true)}>
            Add Personnel
          </button>
        </div>

        <div className="accounts-filters">
          <div className="accounts-filter-item">
            <label>Search by Name</label>
            <input
              type="text"
              placeholder="Type a user name"
              value={personnelSearch}
              onChange={(event) => setPersonnelSearch(event.target.value)}
            />
          </div>

          <div className="accounts-filter-item">
            <label>Filter by Rank</label>
            <select
              value={rankFilter}
              onChange={(event) => setRankFilter(event.target.value)}
            >
              <option>All Ranks</option>
              <option>FDIR</option>
              <option>DFDIR</option>
              <option>SSUPT</option>
              <option>SUPT</option>
              <option>CINSP</option>
              <option>SINSP</option>
              <option>INSP</option>
              <option>SFO4</option>
              <option>SFO3</option>
              <option>SFO2</option>
              <option>SFO1</option>
              <option>FO3</option>
              <option>FO2</option>
              <option>FO1</option>
            </select>
          </div>

          <div className="accounts-filter-item">
            <label>Filter by Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All Status</option>
              <option>Active</option>
              <option>Inactive</option>
              <option>Suspended</option>
              <option>Pending Activation</option>
              <option>Pending Verification</option>
              <option>Expired</option>
            </select>
          </div>

          <button className="accounts-clear-btn" onClick={handleClearFilters}>
            CLEAR FILTERS
          </button>
        </div>

        <div className="accounts-table-card">
          {loadingAccounts ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>Loading accounts...</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <p>No accounts found.</p>
            </div>
          ) : (
            <table className="accounts-table">
              <thead>
                <tr>
                  <th>No.</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Rank</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((account, index) => (
                  <tr key={account.admin_id || account.id}>
                    <td>{index + 1}.</td>
                    <td>{account.first_name} {account.last_name}</td>
                    <td>{account.email}</td>
                    <td>{account.rank}</td>
                    <td>{account.role}</td>
                    <td>
                      <span
                        className={`status-pill ${account.status
                          .toLowerCase()
                          .replace(/\s+/g, '-')}`}
                      >
                        {account.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <button 
                        className="delete-btn"
                        onClick={() => handleDeleteUser(account.admin_id || account.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {isAddModalOpen && (
          <div className="accounts-modal-overlay" role="dialog" aria-modal="true">
            <div className="accounts-modal">
              <div className="accounts-modal-header">
                <h3>Add New Personnel Account</h3>
                <button
                  className="accounts-modal-close"
                  onClick={handleCloseModal}
                  aria-label="Close modal"
                >
                  x
                </button>
              </div>

              <div className="accounts-modal-body">
                <h4>Personnel Information</h4>
                <div className="accounts-modal-grid">
                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-first-name">First Name</label>
                    <input
                      id="personnel-first-name"
                      type="text"
                      placeholder="Michael"
                      value={formData.first_name}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-last-name">Last Name</label>
                    <input
                      id="personnel-last-name"
                      type="text"
                      placeholder="Escano"
                      value={formData.last_name}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-email">Email Address</label>
                    <input
                      id="personnel-email"
                      type="email"
                      placeholder="michaelescano21@gmail.com"
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-role">Role</label>
                    <select 
                      id="personnel-role" 
                      value={formData.role}
                      onChange={handleInputChange}
                    >
                      <option value="">Select a role...</option>
                      <option value="admin">Admin</option>
                      <option value="personnel">Personnel</option>
                      <option value="intel unit">Intel Unit</option>
                    </select>
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-rank">Rank Designation</label>
                    <select 
                      id="personnel-rank"
                      value={formData.rank}
                      onChange={handleInputChange}
                    >
                      <option value="">Select a rank...</option>
                      <option value="FDIR">FDIR - Fire Director</option>
                      <option value="DFDIR">DFDIR - Deputy Fire Director</option>
                      <option value="SSUPT">SSUPT - Senior Fire Superintendent</option>
                      <option value="SUPT">SUPT - Fire Superintendent</option>
                      <option value="CINSP">CINSP - Fire Chief Inspector</option>
                      <option value="SINSP">SINSP - Fire Senior Inspector</option>
                      <option value="INSP">INSP - Fire Inspector</option>
                      <option value="SFO4">SFO4 - Senior Fire Officer IV</option>
                      <option value="SFO3">SFO3 - Senior Fire Officer III</option>
                      <option value="SFO2">SFO2 - Senior Fire Officer II</option>
                      <option value="SFO1">SFO1 - Senior Fire Officer I</option>
                      <option value="FO3">FO3 - Fire Officer III</option>
                      <option value="FO2">FO2 - Fire Officer II</option>
                      <option value="FO1">FO1 - Fire Officer I</option>
                    </select>
                  </div>

                  <div className="accounts-modal-field">
                    <label htmlFor="personnel-password">Password</label>
                    <input 
                      id="personnel-password" 
                      type="password" 
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>

                {message.text && (
                  <div className={`accounts-modal-message accounts-modal-message-${message.type}`}>
                    {message.text}
                  </div>
                )}
              </div>

              <div className="accounts-modal-footer">
                <button className="accounts-modal-draft" onClick={handleCloseModal}>
                  Cancel
                </button>
                <button 
                  className="accounts-modal-add"
                  onClick={handleAddPersonnel}
                  disabled={isLoading}
                >
                  {isLoading ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
