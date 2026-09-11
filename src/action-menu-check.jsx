import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import RecordActions from './components/RecordActions';
import ArchiveButton from './components/ArchiveButton';
import './components/Accounts.css';
import './components/AdminReports.css';
import './components/AnnouncementHistory.css';
import { FiEye, FiCheckCircle, FiXCircle } from 'react-icons/fi';

function Preview() {
  const [selected, setSelected] = useState('None');
  return <main style={{fontFamily: 'Arial, sans-serif', padding: 20, background: '#f6f7f9', minHeight: '90vh'}}>
    <h2>Record actions</h2><output>{selected}</output>
    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', padding: 16, marginTop: 24}}>
      <span>Personnel request</span>
      <RecordActions label="Request actions" actions={[
        {key:'review', label:'Review', icon:<FiEye />, onSelect:()=>setSelected('Review')},
        {key:'approve', label:'Approve', icon:<FiCheckCircle />, disabled:true, onSelect:()=>setSelected('Approve')},
        {key:'reject', label:'Reject', icon:<FiXCircle />, destructive:true, onSelect:()=>setSelected('Reject')}
      ]} />
    </div>
    <div style={{position:'fixed', bottom:16, right:16}}>
      <RecordActions label="Announcement actions">
        <><button title="Edit" onClick={()=>setSelected('Edit')}><FiEye /></button>
        <ArchiveButton label="Archive announcement" onClick={()=>setSelected('Archive')} /></>
      </RecordActions>
    </div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview />);
