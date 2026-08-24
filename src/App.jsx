import { lazy, Suspense, useEffect } from 'react'
import './App.css'
import './components/WorkspaceDensity.css'
import Header from './components/Header'
import HeroSection from './components/HeroSection'
import Footer from './components/Footer'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserProvider, useUser } from './context/UserContext';
import ProtectedRoute from './components/ProtectedRoute';
import { LandingContentProvider } from './context/LandingContentContext';
import { LayoutProvider } from './context/LayoutContext';
import AppSessionTracker from './components/AppSessionTracker';

const loadDashboard = () => import('./components/Dashboard');
const loadAnalytics = () => import('./components/Analytics');
const loadPersonnelOperations = () => import('./components/PersonnelOperations');
const loadLogin = () => import('./components/LoginPage');
const loadReports = () => import('./components/Reports');
const loadAttendanceAdmin = () => import('./components/AttendanceAdmin');
const loadAttendancePersonnel = () => import('./components/AttendancePersonnel');
const loadAssessmentQuestions = () => import('./components/AssessmentQuestions');
const loadLearningMaterials = () => import('./components/LearningMaterials');
const loadChart = () => import('./components/Chart');
const loadAccounts = () => import('./components/Accounts');
const loadProgress = () => import('./components/Progress');
const loadAuditLogs = () => import('./components/AuditLogs');
const loadAboutUsContent = () => import('./components/AboutUsContent');
const loadAnnouncements = () => import('./components/Announcements');
const loadPersonnelProfile = () => import('./components/PersonnelProfile');
const loadAdminProfile = () => import('./components/AdminProfile');
const loadHistory = () => import('./components/History');
const loadAdminReports = () => import('./components/AdminReports');
const loadVisitorMessages = () => import('./components/VisitorMessages');

const Dashboard = lazy(loadDashboard);
const LoginPage = lazy(loadLogin);
const Reports = lazy(loadReports);
const AttendanceAdmin = lazy(loadAttendanceAdmin);
const AttendancePersonnel = lazy(loadAttendancePersonnel);
const AttendanceLogin = lazy(() => import('./components/AttendanceLogin'));
const AttendanceScan = lazy(() => import('./components/AttendanceScan'));
const AttendanceConfirm = lazy(() => import('./components/AttendanceConfirm'));
const Analytics = lazy(loadAnalytics);
const AssessmentQuestions = lazy(loadAssessmentQuestions);
const LearningMaterials = lazy(loadLearningMaterials);
const Chart = lazy(loadChart);
const Accounts = lazy(loadAccounts);
const Progress = lazy(loadProgress);
const AuditLogs = lazy(loadAuditLogs);
const AboutUsContent = lazy(loadAboutUsContent);
const Announcements = lazy(loadAnnouncements);
const PersonnelProfile = lazy(loadPersonnelProfile);
const AdminProfile = lazy(loadAdminProfile);
const History = lazy(loadHistory);
const PersonnelOperations = lazy(loadPersonnelOperations);
const AdminReports = lazy(loadAdminReports);
const OrganizationalChartView = lazy(() => import('./components/OrganizationalChartView'));
const TermsPage = lazy(() => import('./components/TermsPage'));
const PrivacyPage = lazy(() => import('./components/PrivacyPage'));
const ConfirmSignupPage = lazy(() => import('./components/ConfirmSignupPage'));
const SendMessagePage = lazy(() => import('./components/SendMessagePage'));
const VisitorMessages = lazy(loadVisitorMessages);
const LandingAnnouncements = lazy(() => import('./components/LandingAnnouncements'));
const AboutSection = lazy(() => import('./components/AboutSection'));
const ProcessSection = lazy(() => import('./components/ProcessSection'));
const ContactSection = lazy(() => import('./components/ContactSection'));
const FAQSection = lazy(() => import('./components/FAQSection'));
const FloatingContactButton = lazy(() => import('./components/FloatingContactButton'));

const ROUTE_PRELOADERS = {
  '/login': loadLogin,
  '/dashboard': loadDashboard,
  '/dashboard/analytics': loadAnalytics,
  '/dashboard/profile': loadAdminProfile,
  '/dashboard/accounts': loadAccounts,
  '/dashboard/reports': loadAdminReports,
  '/dashboard/users': loadProgress,
  '/dashboard/progress': loadProgress,
  '/dashboard/announcements': loadAnnouncements,
  '/dashboard/visitor-messages': loadVisitorMessages,
  '/dashboard/assessment-questions': loadAssessmentQuestions,
  '/dashboard/learning-materials': loadLearningMaterials,
  '/dashboard/chart': loadChart,
  '/dashboard/about-us': loadAboutUsContent,
  '/dashboard/audit-logs': loadAuditLogs,
  '/personnel/operations': loadPersonnelOperations,
  '/personnel/profile': loadPersonnelProfile,
  '/personnel/history': loadHistory,
  '/personnel/announcements': loadAnnouncements,
  '/reports': loadReports,
  '/attendance-admin': loadAttendanceAdmin,
  '/attendance-personnel': loadAttendancePersonnel,
};

function RoutePreloader() {
  useEffect(() => {
    const preloaded = new Set();
    const preloadFromEvent = (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!link) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || preloaded.has(url.pathname)) return;

      const preload = ROUTE_PRELOADERS[url.pathname];
      if (!preload) return;
      preloaded.add(url.pathname);
      void preload();
    };

    document.addEventListener('pointerover', preloadFromEvent, { passive: true });
    document.addEventListener('focusin', preloadFromEvent);
    return () => {
      document.removeEventListener('pointerover', preloadFromEvent);
      document.removeEventListener('focusin', preloadFromEvent);
    };
  }, []);

  return null;
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return undefined;
    }

    // Cross-page nav links (e.g. from /organizational-chart) land here with a
    // section hash after routing to the homepage. Sections above the target
    // (like Announcements) load their content async and grow taller once it
    // arrives, shifting everything below — so wait for the target's position
    // to stop moving before scrolling to it, instead of racing that layout
    // shift with a one-shot scroll. scroll-margin-top on the section elements
    // keeps them clear of the sticky header once we land.
    const id = hash.slice(1);
    let cancelled = false;
    let timeoutId = null;
    let lastOffsetTop = null;
    let stableChecks = 0;
    const deadline = Date.now() + 1500;

    const waitForStableLayout = () => {
      if (cancelled) return;

      const target = document.getElementById(id);
      if (!target) {
        window.scrollTo(0, 0);
        return;
      }

      const timedOut = Date.now() > deadline;
      stableChecks = target.offsetTop === lastOffsetTop ? stableChecks + 1 : 0;
      lastOffsetTop = target.offsetTop;

      if (stableChecks >= 2 || timedOut) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      timeoutId = setTimeout(waitForStableLayout, 120);
    };

    waitForStableLayout();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [pathname, hash]);

  return null;
}

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
      <Suspense fallback={null}><LandingAnnouncements /></Suspense>
      <Suspense fallback={null}><ProcessSection /></Suspense>
      <Suspense fallback={null}><AboutSection /></Suspense>
      <Suspense fallback={null}><ContactSection /></Suspense>
      <Suspense fallback={null}><FAQSection /></Suspense>
      <Footer />
      <Suspense fallback={null}><FloatingContactButton /></Suspense>
    </>
  );
}

function App() {
  return (
    <UserProvider>
      <RoutePreloader />
      <AppSessionTracker />
      <LayoutProvider>
        <LandingContentProvider>
          <div className="app">
            <ScrollToTop />
            <Suspense
              fallback={(
                <div className="app-route-loader" role="status" aria-label="Loading page">
                  <span aria-hidden="true" />
                </div>
              )}
            >
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
              <Route path="/dashboard/about-us" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="manage_users"><AboutUsContent /></ProtectedRoute>} />
              <Route path="/dashboard/learning-materials" element={<ProtectedRoute allowedRoles={['admin']}><LearningMaterials /></ProtectedRoute>} />
              <Route path="/dashboard/chart" element={<ProtectedRoute allowedRoles={['admin']}><Chart /></ProtectedRoute>} />
              <Route path="/dashboard/accounts" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="view_accounts"><Accounts /></ProtectedRoute>} />
              <Route path="/dashboard/reports" element={<ProtectedRoute allowedRoles={['admin']}><AdminReports /></ProtectedRoute>} />
              <Route path="/dashboard/users" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="manage_users"><Progress /></ProtectedRoute>} />
              <Route path="/dashboard/progress" element={<ProtectedRoute allowedRoles={['admin']} requiredPermission="view_progress"><Progress /></ProtectedRoute>} />
              <Route path="/dashboard/audit-logs" element={<ProtectedRoute allowedRoles={['admin']}><AuditLogs /></ProtectedRoute>} />
              <Route path="/dashboard/announcements" element={<ProtectedRoute allowedRoles={['admin']}><Announcements /></ProtectedRoute>} />
              <Route path="/dashboard/visitor-messages" element={<ProtectedRoute allowedRoles={['admin']}><VisitorMessages /></ProtectedRoute>} />
              <Route path="/personnel/announcements" element={<ProtectedRoute allowedRoles={['personnel']}><Announcements /></ProtectedRoute>} />
              <Route path="/organizational-chart" element={<OrganizationalChartView />} />
              <Route path="/send-message" element={<SendMessagePage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              </Routes>
            </Suspense>
          </div>
        </LandingContentProvider>
      </LayoutProvider>
    </UserProvider>
  );
}

export default App;
