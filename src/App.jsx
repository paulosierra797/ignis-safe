import './App.css'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import LandingAnnouncements from './components/LandingAnnouncements'
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
import AssessmentQuestions from './components/AssessmentQuestions';
import Chart from './components/Chart';
import Accounts from './components/Accounts';
import Users from './components/Users';
import Progress from './components/Progress';
import AuditLogs from './components/AuditLogs';
import Announcements from './components/Announcements';
import PersonnelProfile from './components/PersonnelProfile';
import History from './components/History';
import PersonnelOperations from './components/PersonnelOperations';
import TermsPage from './components/TermsPage';
import PrivacyPage from './components/PrivacyPage';
import ConfirmSignupPage from './components/ConfirmSignupPage';
import { UserProvider } from './context/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LandingContentProvider } from './context/LandingContentContext';

function App() {
  return (
    <UserProvider>
      <LandingContentProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<>
              <Header />
              <HeroSection />
              <LandingAnnouncements />
              <AboutSection />
              <ProcessSection />
              <ContactSection />
              <FAQSection />
              <Footer />
            </>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/confirm-signup" element={<ConfirmSignupPage />} />
            <Route path="/personnel/profile" element={<ProtectedRoute><PersonnelProfile /></ProtectedRoute>} />
            <Route path="/personnel/operations" element={<ProtectedRoute><PersonnelOperations /></ProtectedRoute>} />
            <Route path="/personnel/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/intel-unit/reports" element={<ProtectedRoute><IntelUnitReports /></ProtectedRoute>} />
            <Route path="/intel-unit/profile" element={<ProtectedRoute><IntelUnitProfile /></ProtectedRoute>} />
            <Route path="/intel-unit/archive" element={<ProtectedRoute><IntelUnitArchive /></ProtectedRoute>} />
            <Route path="/intel-unit/audit-logs" element={<ProtectedRoute><IntelUnitAuditLogs /></ProtectedRoute>} />
            <Route path="/attendance-admin" element={<ProtectedRoute><AttendanceAdmin /></ProtectedRoute>} />
            <Route path="/attendance-personnel" element={<ProtectedRoute><AttendancePersonnel /></ProtectedRoute>} />
            <Route path="/attendance-login" element={<AttendanceLogin />} />
            <Route path="/attendance-scan" element={<AttendanceScan />} />
            <Route path="/attendance-confirm" element={<AttendanceConfirm />} />
            <Route path="/dashboard/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
            <Route path="/dashboard/assessment-questions" element={<ProtectedRoute requiredPermission="manage_users"><AssessmentQuestions /></ProtectedRoute>} />
            <Route path="/dashboard/chart" element={<ProtectedRoute><Chart /></ProtectedRoute>} />
            <Route path="/dashboard/accounts" element={<ProtectedRoute><Accounts /></ProtectedRoute>} />
            <Route path="/dashboard/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
            <Route path="/dashboard/progress" element={<ProtectedRoute><Progress /></ProtectedRoute>} />
            <Route path="/dashboard/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
            <Route path="/dashboard/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
            <Route path="/personnel/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
            <Route path="/intel-unit/announcements" element={<ProtectedRoute><Announcements /></ProtectedRoute>} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
          </Routes>
        </div>
      </LandingContentProvider>
    </UserProvider>
  );
}

export default App;
