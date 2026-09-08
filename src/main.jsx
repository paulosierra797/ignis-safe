import { createRoot } from 'react-dom/client'
// Self-hosted Poppins Latin subset for the weights the UI actually uses.
// Filipino/English copy is covered by this subset; omitting the duplicate
// latin-ext faces avoids downloading two competing font files per weight.
// Replaces the render-blocking Google Fonts stylesheet that was in index.html.
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
import defaultHeroImage from './assets/firestation.webp';
import defaultHeroImageSmall from './assets/firestation-640.webp';

const preloadLandingHero = () => {
  if (window.location.pathname !== '/') return;

  let heroUrl = window.matchMedia('(max-width: 720px)').matches
    ? defaultHeroImageSmall
    : defaultHeroImage;

  try {
    const cachedContent = JSON.parse(window.localStorage.getItem('ignis_landing_content_v1') || 'null');
    const uploadedHeroUrl = cachedContent?.hero?.photos?.find((photo) => photo?.url)?.url;
    if (uploadedHeroUrl) heroUrl = uploadedHeroUrl;
  } catch {
    // Use the bundled default when cached content is unavailable or malformed.
  }

  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'image';
  preload.href = heroUrl;
  preload.fetchPriority = 'high';
  document.head.appendChild(preload);
};

// Strip the recovery cache-busting marker (?_v=…) left by a "Refresh page"
// reload so it doesn't linger in the address bar or in shared links.
clearReloadMarker();
preloadLandingHero();

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
