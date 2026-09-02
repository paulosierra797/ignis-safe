import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CANONICAL_ORIGIN = 'https://bfp-dasmacfs.com';

const DEFAULT_DESCRIPTION =
  'IGNIS SAFE is the Bureau of Fire Protection Dasmariñas City Fire Station portal for '
  + 'fire safety inspection services, public advisories, and station contact information.';

// Public, indexable routes only. Everything else is treated as private and
// gets <meta name="robots" content="noindex"> plus no canonical tag.
const PUBLIC_META = {
  '/': {
    title: 'IGNIS SAFE — BFP Dasmariñas City Fire Station',
    description: DEFAULT_DESCRIPTION,
  },
  '/organizational-chart': {
    title: 'Organizational Chart — BFP Dasmariñas City Fire Station',
    description:
      'Organizational chart and chain of command of the Bureau of Fire Protection '
      + 'Dasmariñas City Fire Station.',
  },
  '/send-message': {
    title: 'Send a Message — BFP Dasmariñas City Fire Station',
    description:
      'Contact the Bureau of Fire Protection Dasmariñas City Fire Station with questions '
      + 'about fire safety inspection, permits, and public advisories.',
  },
  '/terms': {
    title: 'Terms of Use — IGNIS SAFE',
    description: 'Terms of use for the IGNIS SAFE portal of BFP Dasmariñas City Fire Station.',
  },
  '/privacy': {
    title: 'Privacy Policy — IGNIS SAFE',
    description: 'Privacy policy for the IGNIS SAFE portal of BFP Dasmariñas City Fire Station.',
  },
  '/attendance-login': {
    title: 'Attendance Sign In — IGNIS SAFE',
    description: DEFAULT_DESCRIPTION,
  },
};

function upsertMeta(attr, key, value) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"]`);
  if (href == null) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Keeps <title>, meta description, canonical link and the robots directive in
 * sync with the current route. Purely presentational metadata — it does not
 * touch routing, auth or data.
 */
export default function useDocumentMeta() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = PUBLIC_META[pathname];

    if (meta) {
      document.title = meta.title;
      upsertMeta('name', 'description', meta.description);
      upsertLink('canonical', `${CANONICAL_ORIGIN}${pathname === '/' ? '/' : pathname}`);
      upsertMeta('name', 'robots', 'index, follow');
    } else {
      // Private Admin/Personnel/auth routes: never index.
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertLink('canonical', null);
      upsertMeta('name', 'robots', 'noindex, nofollow');
    }
  }, [pathname]);
}
