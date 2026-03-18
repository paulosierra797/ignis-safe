import './App.css'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import AboutSection from './components/AboutSection'
import ProcessSection from './components/ProcessSection'
import ContactSection from './components/ContactSection'
import FAQSection from './components/FAQSection'
import Footer from './components/Footer'
import { Routes, Route } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import IntelUnitReports from './components/IntelUnitReports';
import IntelUnitProfile from './components/IntelUnitProfile';
import IntelUnitArchive from './components/IntelUnitArchive';
import IntelUnitAuditLogs from './components/IntelUnitAuditLogs';
import AttendanceAdmin from './components/AttendanceAdmin';
import AttendancePersonnel from './components/AttendancePersonnel';
import AttendanceLogin from './components/AttendanceLogin';
import AttendanceScan from './components/AttendanceScan';
import AttendanceConfirm from './components/AttendanceConfirm';
import Analytics from './components/Analytics';
import Chart from './components/Chart';
import Accounts from './components/Accounts';
import Users from './components/Users';
import Progress from './components/Progress';
import AuditLogs from './components/AuditLogs';
import PersonnelProfile from './components/PersonnelProfile';
import History from './components/History';
import TermsPage from './components/TermsPage';
import PrivacyPage from './components/PrivacyPage';
import { UserProvider } from './context/UserContext';

function App() {
  return (
    <UserProvider>
      <div className="app">
        <Routes>
          <Route path="/" element={<>
            <Header />
            <HeroSection />
            <AboutSection />
            <ProcessSection />
            <ContactSection />
            <FAQSection />
            <Footer />
          </>} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/personnel/profile" element={<PersonnelProfile />} />
          <Route path="/personnel/history" element={<History />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/intel-unit/reports" element={<IntelUnitReports />} />
          <Route path="/intel-unit/profile" element={<IntelUnitProfile />} />
          <Route path="/intel-unit/archive" element={<IntelUnitArchive />} />
          <Route path="/intel-unit/audit-logs" element={<IntelUnitAuditLogs />} />
          <Route path="/attendance-admin" element={<AttendanceAdmin />} />
          <Route path="/attendance-personnel" element={<AttendancePersonnel />} />
          <Route path="/attendance-login" element={<AttendanceLogin />} />
          <Route path="/attendance-scan" element={<AttendanceScan />} />
          <Route path="/attendance-confirm" element={<AttendanceConfirm />} />
          <Route path="/dashboard/analytics" element={<Analytics />} />
          <Route path="/dashboard/chart" element={<Chart />} />
          <Route path="/dashboard/accounts" element={<Accounts />} />
          <Route path="/dashboard/users" element={<Users />} />
          <Route path="/dashboard/progress" element={<Progress />} />
          <Route path="/dashboard/audit-logs" element={<AuditLogs />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
        </Routes>
      </div>
    </UserProvider>
  );
}

export default App;
