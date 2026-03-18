import React from 'react';
import { useUser } from '../context/UserContext';
import './RoleSwitcher.css';

export default function RoleSwitcher() {
  const { currentUser, switchRole } = useUser();

  return (
    <div className="role-switcher">
      <div className="role-switcher-label">Demo Mode:</div>
      <select 
        value={currentUser.role} 
        onChange={(e) => switchRole(e.target.value)}
        className="role-switcher-select"
      >
        <option value="admin">Admin</option>
        <option value="personnel">Personnel (Report Creation Only)</option>
        <option value="fire-marshal">Fire Marshal</option>
      </select>
    </div>
  );
}
