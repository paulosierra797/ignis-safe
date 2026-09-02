import { createRoot } from 'react-dom/client'
// Self-hosted Poppins for the weights the UI actually uses. Replaces the
// render-blocking Google Fonts stylesheet that was in index.html.
// Latin only: the UI is English + Filipino (incl. "ñ", U+00F1, which is in the
// latin subset). Previously each weight also imported its `latin-ext` sibling;
// neither file ships a unicode-range, so the browser fetched both woff2s per
// weight - 12 font requests on the critical path, some resolving ~1.7 s in.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/poppins/latin-800.css'
import '@fontsource/poppins/latin-900.css'
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
