import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx';
import UpdateToast from './components/UpdateToast.jsx';

const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
    errorElement: <RouteErrorBoundary />
  }
]);

// UpdateToast is rendered outside the router's element tree on purpose: if a
// route crashes into RouteErrorBoundary, only that route's subtree is
// replaced - this toast (and the deploy-detection polling it owns) keeps
// running regardless.
createRoot(document.getElementById('root')).render(
  <>
    <RouterProvider router={router} />
    <UpdateToast />
  </>
)
