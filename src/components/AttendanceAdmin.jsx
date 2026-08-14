import React, { useMemo, useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import CloseButton from './CloseButton';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { getAttendanceRecords } from '../utils/attendanceService';
import { logAdminActivity } from '../utils/usersService';
import { useUser } from '../context/UserContext';
import './AttendanceAdmin.css';

const formatDistance = (distanceMeters) => {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance)) return 'Not recorded';
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km`;
  return `${Math.round(distance)} m`;
};

const getVerificationLabel = (status) => {
  if (status === 'passed') return 'Passed';
  if (status === 'failed') return 'Failed';
  if (status === 'partial') return 'Partial';
  return 'Not recorded';
};

const getCheckLabel = (value) => {
  if (value === true) return 'Passed';
  if (value === false) return 'Failed';
  return 'Not recorded';
};

const getAttendanceStatusLabel = (record) => {
  if (record.timeIn && record.timeOut) return 'Completed';
  if (record.timeIn) return 'Time In recorded';
  return 'Not recorded';
};

const AttendanceAdmin = () => {
  const { currentUser } = useUser();
  const [searchPersonal, setSearchPersonal] = useState('');
  const [dateFilter, setDateFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [attendanceData, setAttendanceData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    if (!selectedRecord) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSelectedRecord(null);
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedRecord]);

  useEffect(() => {
    let isMounted = true;

    const loadAttendance = async () => {
      try {
        if (isMounted) {
          setLoadError('');
        }

        const records = await getAttendanceRecords();

        if (isMounted) {
          setAttendanceData(records);
        }
      } catch (error) {
        if (isMounted) {
          setLoadError(error.message || 'Failed to load attendance records');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadAttendance();
    const interval = setInterval(loadAttendance, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredAttendance = useMemo(() => {
    const normalizedPersonnelSearch = searchPersonal.trim().toLowerCase();
    const normalizedHeaderSearch = searchQuery.trim().toLowerCase();

    return attendanceData.filter((item) => {
      const matchesPersonnel = !normalizedPersonnelSearch ||
        item.name.toLowerCase().includes(normalizedPersonnelSearch) ||
        item.rank.toLowerCase().includes(normalizedPersonnelSearch);

      const matchesHeaderSearch = !normalizedHeaderSearch ||
        item.name.toLowerCase().includes(normalizedHeaderSearch) ||
        item.rank.toLowerCase().includes(normalizedHeaderSearch);

      // Format date locally without timezone conversion
      const matchesDate = !dateFilter || (() => {
        const year = dateFilter.getFullYear();
        const month = String(dateFilter.getMonth() + 1).padStart(2, '0');
        const day = String(dateFilter.getDate()).padStart(2, '0');
        const localDateIso = `${year}-${month}-${day}`;
        return item.dateIso === localDateIso;
      })();

      return matchesPersonnel && matchesHeaderSearch && matchesDate;
    });
  }, [attendanceData, dateFilter, searchPersonal, searchQuery]);

  const handleClearFilters = () => {
    setSearchPersonal('');
    setDateFilter(null);
  };

  const exportToCSV = async () => {
    // Define CSV headers
    const headers = ['No.', 'Name', 'Rank', 'Date', 'Time In', 'Time Out'];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    // Add data rows
    filteredAttendance.forEach((item, index) => {
      const row = [
        index + 1,
        item.name,
        item.rank,
        item.date,
        item.timeIn || '--',
        item.timeOut || '--'
      ];
      csvContent += row.join(',') + '\n';
    });
    
    // Create a blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    await logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Attendance Export CSV',
      actionType: 'export',
      details: `Exported ${filteredAttendance.length} attendance record(s) to CSV.`,
      metadata: {
        format: 'csv',
        record_count: filteredAttendance.length
      }
    });
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Attendance Management Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);
    const tableData = filteredAttendance.map((item, index) => [
      index + 1,
      item.name,
      item.rank,
      item.date,
      item.timeIn || '--',
      item.timeOut || '--'
    ]);
    doc.autoTable({
      head: [['No.', 'Name', 'Rank', 'Date', 'Time In', 'Time Out']],
      body: tableData,
      startY: 35,
      theme: 'grid',
      headStyles: {
        fillColor: [214, 69, 61], // Ember red
        textColor: [255, 255, 255],
        fontStyle: 'bold'
      },
      styles: {
        fontSize: 10,
        cellPadding: 3
      }
    });
    doc.save(`attendance_report_${new Date().toISOString().split('T')[0]}.pdf`);

    await logAdminActivity({
      actorId: currentUser?.admin_id || null,
      actorName: currentUser?.name || currentUser?.email || 'Admin User',
      action: 'Attendance Export PDF',
      actionType: 'export',
      details: `Exported ${filteredAttendance.length} attendance record(s) to PDF.`,
      metadata: {
        format: 'pdf',
        record_count: filteredAttendance.length
      }
    });
  };

  return (
    <div className="attendance-admin-container">
      <Sidebar />
      <div className="attendance-admin-content">
        <PageHeader
          title="Attendance Management"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="attendance-admin-actions">
          <button className="export-csv-btn" onClick={exportToCSV}>Export CSV</button>
          <button className="export-pdf-btn" onClick={exportToPDF}>Export PDF</button>
        </div>

        {loadError && <div className="signature-cell">{loadError}</div>}

        <div className="attendance-filters-box">
          <div className="filter-row">
            <div className="filter-item">
              <label>Search Personnel</label>
              <div className="search-input-wrapper">
                <svg className="search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16zM19 19l-4.35-4.35" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search for anything..."
                  value={searchPersonal}
                  onChange={(e) => setSearchPersonal(e.target.value)}
                />
              </div>
            </div>

            <div className="filter-item">
              <label>Filter by Date</label>
              <DatePicker
                selected={dateFilter}
                onChange={(date) => setDateFilter(date)}
                dateFormat="dd/MM/yy"
                placeholderText="DD/MM/YY"
                className="date-picker-input"
              />
            </div>

            <div className="filter-actions">
              <button className="clear-filters-btn" onClick={handleClearFilters}>
                CLEAR FILTERS
              </button>
            </div>
          </div>
        </div>

        <div className="attendance-table-container">
          <table className="attendance-table">
            <thead>
              <tr>
                <th>No.</th>
                <th>Name</th>
                <th>Rank</th>
                <th>Date</th>
                <th>Time In</th>
                <th>Time Out</th>
                <th>Verification</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="8" className="signature-cell">Loading attendance records...</td>
                </tr>
              ) : filteredAttendance.length === 0 ? (
                <tr>
                  <td colSpan="8" className="signature-cell">No attendance records found.</td>
                </tr>
              ) : (
                filteredAttendance.map((item, index) => (
                  <tr key={item.id}>
                    <td>{index + 1}</td>
                    <td>{item.name}</td>
                    <td>{item.rank}</td>
                    <td>{item.date}</td>
                    <td>{item.timeIn || '--'}</td>
                    <td>{item.timeOut || '--'}</td>
                    <td>
                      <span className={`attendance-verification-badge ${item.verificationStatus}`}>
                        {getVerificationLabel(item.verificationStatus)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="attendance-details-btn"
                        onClick={() => setSelectedRecord(item)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="attendance-mobile-list">
  {isLoading ? (
    <div className="attendance-card">
      Loading attendance records...
    </div>
  ) : filteredAttendance.length === 0 ? (
    <div className="attendance-card">
      No attendance records found.
    </div>
  ) : (
    filteredAttendance.map((item, index) => (
      <div className="attendance-card" key={item.id}>
        <div className="attendance-card-header">
          <h3>{item.name}</h3>
          <span className="attendance-index">
            #{index + 1}
          </span>
        </div>

        <div className="attendance-card-body">
          <p>
            <strong>Rank</strong><br />
            {item.rank}
          </p>

          <p>
            <strong>Date</strong><br />
            {item.date}
          </p>

          <div className="attendance-times">
            <div>
              <span className="time-label">Time In</span>
              <strong>{item.timeIn || '--'}</strong>
            </div>

            <div>
              <span className="time-label">Time Out</span>
              <strong>{item.timeOut || '--'}</strong>
            </div>
          </div>

          <div className="attendance-card-verification">
            <span className={`attendance-verification-badge ${item.verificationStatus}`}>
              {getVerificationLabel(item.verificationStatus)}
            </span>
            <button
              type="button"
              className="attendance-details-btn"
              onClick={() => setSelectedRecord(item)}
            >
              View Verification Details
            </button>
          </div>
        </div>
      </div>
    ))
  )}
</div>

        {selectedRecord && (
          <div
            className="attendance-details-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSelectedRecord(null);
            }}
          >
            <section
              className="attendance-details-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="attendanceDetailsTitle"
            >
              <header className="attendance-details-header">
                <div>
                  <span className="attendance-details-eyebrow">Attendance verification</span>
                  <h2 id="attendanceDetailsTitle">{selectedRecord.name}</h2>
                  <p>{selectedRecord.rank} · {selectedRecord.date} · Shift {selectedRecord.shiftId}</p>
                </div>
                <CloseButton
                  className="attendance-details-close"
                  onClick={() => setSelectedRecord(null)}
                  label="Close verification details"
                />
              </header>

              <div className="attendance-details-status-row">
                <span className={`attendance-verification-badge large ${selectedRecord.verificationStatus}`}>
                  Overall: {getVerificationLabel(selectedRecord.verificationStatus)}
                </span>
                <span className="attendance-verification-event">
                  {getAttendanceStatusLabel(selectedRecord)}
                </span>
              </div>

              <div className="attendance-details-grid">
                <article className="attendance-detail-card">
                  <h3>Attendance</h3>
                  <dl>
                    <div>
                      <dt>Date</dt>
                      <dd>{selectedRecord.date}</dd>
                    </div>
                    <div>
                      <dt>Assigned shift</dt>
                      <dd>{selectedRecord.shiftId}</dd>
                    </div>
                    <div>
                      <dt>Time In</dt>
                      <dd>{selectedRecord.timeIn || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Time Out</dt>
                      <dd>{selectedRecord.timeOut || 'Not recorded'}</dd>
                    </div>
                  </dl>
                </article>

                <article className="attendance-detail-card">
                  <h3>Verified Location</h3>
                  <dl>
                    <div>
                      <dt>Readable address</dt>
                      <dd>{selectedRecord.location?.address || selectedRecord.stationName || 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Latitude</dt>
                      <dd>{selectedRecord.location?.latitude ?? 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Longitude</dt>
                      <dd>{selectedRecord.location?.longitude ?? 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>GPS accuracy</dt>
                      <dd>{Number.isFinite(Number(selectedRecord.location?.accuracy)) ? `${Math.round(Number(selectedRecord.location.accuracy))} m` : 'Not recorded'}</dd>
                    </div>
                    <div>
                      <dt>Distance from station</dt>
                      <dd>{formatDistance(selectedRecord.distanceFromStationMeters)}</dd>
                    </div>
                    <div>
                      <dt>Location check</dt>
                      <dd className={selectedRecord.locationVerificationPassed === true ? 'verification-pass' : selectedRecord.locationVerificationPassed === false ? 'verification-fail' : ''}>
                        {getCheckLabel(selectedRecord.locationVerificationPassed)}
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className="attendance-detail-card">
                  <h3>Face ID Verification</h3>
                  <dl>
                    <div>
                      <dt>Face check</dt>
                      <dd className={selectedRecord.faceVerificationPassed === true ? 'verification-pass' : selectedRecord.faceVerificationPassed === false ? 'verification-fail' : ''}>
                        {getCheckLabel(selectedRecord.faceVerificationPassed)}
                      </dd>
                    </div>
                    <div>
                      <dt>Verified at</dt>
                      <dd>
                        {selectedRecord.verificationRecordedAt
                          ? new Date(selectedRecord.verificationRecordedAt).toLocaleString()
                          : 'Not recorded'}
                      </dd>
                    </div>
                  </dl>

                  <div className="attendance-verification-photo">
                    {selectedRecord.verificationPhotoUrl ? (
                      <img
                        src={selectedRecord.verificationPhotoUrl}
                        alt={`Verification capture for ${selectedRecord.name}`}
                      />
                    ) : (
                      <div className="attendance-photo-empty">No verification photo recorded</div>
                    )}
                  </div>
                </article>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default AttendanceAdmin;
