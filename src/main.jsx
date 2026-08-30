import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import RouteErrorBoundary from './components/RouteErrorBoundary.jsx';
import { clearReloadMarker } from './utils/appRecovery';

// Strip the recovery cache-busting marker (?_v=…) left by a "Refresh page"
// reload so it doesn't linger in the address bar or in shared links.
clearReloadMarker();

const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
    errorElement: <RouteErrorBoundary />
  }
]);

createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} />
)
