import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authenticatePersonnel, saveAuthToken } from '../utils/attendanceService';
import './AttendanceLogin.css';

const AttendanceLogin = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email.trim()) {
      setError('Please enter your account email');
      setIsLoading(false);
      return;
    }

    if (!password) {
      setError('Please enter your account password');
      setIsLoading(false);
      return;
    }

    // Authenticate
    const officer = await authenticatePersonnel(email, password);
    if (officer) {
      saveAuthToken(officer);
      setEmail('');
      setPassword('');
      const redirectTarget = searchParams.get('redirect');
      navigate(redirectTarget || '/attendance-scan');
    } else {
      setError('Invalid account email or password. Please try again.');
    }

    setIsLoading(false);
  };

  return (
    <div className="attendance-login-page">
      <div className="login-card">
        <div className="login-header">
          <span className="login-badge">IGNIS SAFE</span>
          <h1>Personnel Login</h1>
          <p>Authenticate to mark attendance</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="email-input" className="form-label">
              Account Email
            </label>
            <input
              id="email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your account email"
              autoComplete="username"
              className="form-input"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="pin-input" className="form-label">
              Account Password
            </label>
            <input
              id="pin-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your account password"
              autoComplete="current-password"
              className="form-input"
              disabled={isLoading}
            />
            <div className="pin-hint">Use the same password as your IGNIS SAFE account login.</div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="login-btn"
            disabled={isLoading || !email.trim() || !password}
          >
            {isLoading ? 'Logging in...' : 'Login & Continue'}
          </button>
        </form>

        <div className="login-footer">
          Only you can mark attendance with your credentials. Your account password is required for every session.
        </div>
      </div>
    </div>
  );
};

export default AttendanceLogin;
