import './App.css'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import LandingAnnouncements from './components/LandingAnnouncements'
import AboutSection from './components/AboutSection'
import ProcessSection from './components/ProcessSection'
import ContactSection from './components/ContactSection'
import FAQSection from './components/FAQSection'
import Footer from './components/Footer'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './components/LoginPage';
import Dashboard from './components/Dashboard';
import Reports from './components/Reports';
import AttendanceAdmin from './components/AttendanceAdmin';
import AttendancePersonnel from './components/AttendancePersonnel';
import AttendanceLogin from './components/AttendanceLogin';
import AttendanceScan from './components/AttendanceScan';
import AttendanceConfirm from './components/AttendanceConfirm';
import Analytics from './components/Analytics';
import AssessmentQuestions from './components/AssessmentQuestions';
import LearningMaterials from './components/LearningMaterials';
import Chart from './components/Chart';
import Accounts from './components/Accounts';
import Progress from './components/Progress';
import AuditLogs from './components/AuditLogs';
import Announcements from './components/Announcements';
import PersonnelProfile from './components/PersonnelProfile';
import AdminProfile from './components/AdminProfile';
import History from './components/History';
import PersonnelOperations from './components/PersonnelOperations';
import AdminReports from './components/AdminReports';
import TermsPage from './components/TermsPage';
import PrivacyPage from './components/PrivacyPage';
import ConfirmSignupPage from './components/ConfirmSignupPage';
import { UserProvider, useUser } from './context/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LandingContentProvider } from './context/LandingContentContext';
import { LayoutProvider } from './context/LayoutContext';
import AppSessionTracker from './components/AppSessionTracker';

function LandingPage() {
  const location = useLocation();
  const { currentUser } = useUser();
  const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(location.search);
  const hasPendingActivation = ['Pending Activation', 'Pending Verification']
    .includes(currentUser?.status);
  const invitePortal = ['admin', 'personnel'].includes(searchParams.get('portal'))
    ? searchParams.get('portal')
    : String(currentUser?.role || '').toLowerCase();
  const isInviteLink = hashParams.get('type') === 'invite'
    || searchParams.get('type') === 'invite'
    || searchParams.get('mode') === 'invite'
    || (searchParams.has('code') && ['admin', 'personnel'].includes(invitePortal))
    || hasPendingActivation;

  if (isInviteLink) {
    const activationParams = new URLSearchParams(location.search);
    activationParams.set('mode', 'invite');
    if (['admin', 'personnel'].includes(invitePortal)) {
      activationParams.set('portal', invitePortal);
    }

    return (
      <Navigate
        to={{
          pathname: '/confirm-signup',
          search: `?${activationParams.toString()}`,
          hash: location.hash
        }}
        replace
      />
    );
  }

  return (
    <>
      <Header />
      <HeroSection />
      <LandingAnnouncements />
      <AboutSection />
      <ProcessSection />
      <ContactSection />
      <FAQSection />
      <Footer />
    </>
  );
}

function App() {
  return (
    <UserProvider>
      <AppSessionTracker />
      <LayoutProvider>
        <LandingContentProvider>
          <div className="app">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/confirm-signup" element={<ConfirmSignupPage />} />
              <Route path="/personnel" element={<Navigate to="/personnel/operations" replace />} />
              <Route path="/personnel/profile" element={<ProtectedRoute allowedRoles={['personnel']}><PersonnelProfile /></ProtectedRoute>} />
              <Route path="/personnel/operations" element={<ProtectedRoute allowedRoles={['personnel']}><PersonnelOperations /></ProtectedRoute>} />
              <Route path="/personnel/history" element={<ProtectedRoute allowedRoles={['personnel']}><History /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><Dashboard /></ProtectedRoute>} />
              <Route path="/dashboard/profile" element={<ProtectedRoute allowedRoles={['admin']}><AdminProfile /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute allowedRoles={['personnel']}><Reports /></ProtectedRoute>} />
        
              <Route path="/attendance-admin" element={<ProtectedRoute allowedRoles={['admin']}><AttendanceAdmin /></ProtectedRoute>} />
              <Route path="/attendance-personnel" element={<ProtectedRoute allowedRoles={['personnel']}><AttendancePersonnel /></ProtectedRoute>} />
              <Route path="/attendance-login" element={<AttendanceLogin />} />
              <Route path="/attendance-scan" element={<AttendanceScan />} />
              <Route path="/attendance-confirm" element={<AttendanceConfirm />} />
              <Route path="/dashboard/analytics" element={<ProtectedRoute allowedRoles={['admin']}><Analytics /></ProtectedRoute>} />
              <Route path="/dashboard/assessment-questions" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="manage_users"><AssessmentQuestions /></ProtectedRoute>} />
              <Route path="/dashboard/learning-materials" element={<ProtectedRoute allowedRoles={['admin']}><LearningMaterials /></ProtectedRoute>} />
              <Route path="/dashboard/chart" element={<ProtectedRoute allowedRoles={['admin']}><Chart /></ProtectedRoute>} />
              <Route path="/dashboard/accounts" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="view_accounts"><Accounts /></ProtectedRoute>} />
              <Route path="/dashboard/reports" element={<ProtectedRoute allowedRoles={['admin']}><AdminReports /></ProtectedRoute>} />
              <Route path="/dashboard/users" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="manage_users"><Progress /></ProtectedRoute>} />
              <Route path="/dashboard/progress" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="view_progress"><Progress /></ProtectedRoute>} />
              <Route path="/dashboard/audit-logs" element={<ProtectedRoute allowedRoles={['admin']}><AuditLogs /></ProtectedRoute>} />
              <Route path="/dashboard/announcements" element={<ProtectedRoute allowedRoles={['admin']}><Announcements /></ProtectedRoute>} />
              <Route path="/personnel/announcements" element={<ProtectedRoute allowedRoles={['personnel']}><Announcements /></ProtectedRoute>} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
            </Routes>
          </div>
        </LandingContentProvider>
      </LayoutProvider>
    </UserProvider>
  );
}

export default App;
