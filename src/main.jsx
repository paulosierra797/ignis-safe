import { createRoot } from 'react-dom/client'
// Self-hosted Poppins (latin + latin-ext) for the weights the UI actually uses.
// Replaces the render-blocking Google Fonts stylesheet that was in index.html.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-ext-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-ext-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-ext-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-ext-700.css'
import '@fontsource/poppins/latin-800.css'
import '@fontsource/poppins/latin-ext-800.css'
import '@fontsource/poppins/latin-900.css'
import '@fontsource/poppins/latin-ext-900.css'
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
