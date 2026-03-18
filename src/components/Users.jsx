import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import './Users.css';
import { getUsersFromProfiles } from '../utils/usersService';

export default function Users() {
  const [usersData, setUsersData] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [tableMessage, setTableMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All Status');

  useEffect(() => {
    const loadUsers = async () => {
      setLoadingUsers(true);
      setTableMessage('');

      const { data, error } = await getUsersFromProfiles();
      if (error) {
        setTableMessage(`Failed to load users: ${error}`);
        setUsersData([]);
      } else {
        setUsersData(data || []);
      }

      setLoadingUsers(false);
    };

    loadUsers();
  }, []);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All Status');
  };

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();

    return usersData.filter((user) => {
      const matchesStatus = statusFilter === 'All Status' || user.status === statusFilter;
      const matchesName = !normalizedSearch || user.name.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesName;
    });
  }, [statusFilter, searchQuery, usersData]);

  const activeUsers = usersData.filter((user) => String(user.status || '').toLowerCase() === 'active').length;

  return (
    <div className="users-container">
      <Sidebar />

      <div className="users-main">
        <PageHeader
          title="Users"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="users-controls">
          <div className="users-stat-card">
            <p>Active Users</p>
            <div className="users-stat-value">
              <span className="users-main-value">{activeUsers}</span>
              <span className="users-sub-value">/{usersData.length}</span>
            </div>
          </div>

          <div className="users-filters">
            <div className="users-filter">
              <label>Search by Name</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Type a user name"
              />
            </div>

            <div className="users-filter">
              <label>Filter by Status</label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option>All Status</option>
                <option>Active</option>
                <option>Inactive</option>
                <option>Pending Activation</option>
                <option>Pending Verification</option>
              </select>
            </div>

            <button className="users-clear" onClick={handleClearFilters}>Clear Filters</button>
          </div>
        </div>

        <div className="users-table-card">
          {tableMessage && (
            <div style={{ padding: '0.8rem 1rem', color: '#991b1b', fontWeight: 600 }}>
              {tableMessage}
            </div>
          )}
          <table className="users-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>Loading users...</td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>No users found.</td>
                </tr>
              ) : filteredUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{index + 1}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{String(user.status || '-').toUpperCase()}</td>
                  <td>{user.last_login ? new Date(user.last_login).toLocaleDateString('en-US') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
