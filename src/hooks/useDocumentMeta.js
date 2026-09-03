import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CANONICAL_ORIGIN = 'https://bfp-dasmacfs.com';

const DEFAULT_DESCRIPTION =
  'IGNIS SAFE is the Bureau of Fire Protection Dasmariñas City Fire Station portal for '
  + 'fire safety inspection services, public advisories, and station contact information.';

// Routes with dedicated, crawlable metadata. Everything else is treated as
// private and gets <meta name="robots" content="noindex"> plus no canonical tag.
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
  '/login': {
    title: 'Sign In — IGNIS SAFE | BFP Dasmariñas City Fire Station',
    description:
      'Secure sign-in for authorized personnel and administrators of the IGNIS SAFE '
      + 'portal of BFP Dasmariñas City Fire Station.',
  },
  '/personnel/operations': {
    title: 'Personnel Shift Schedule — IGNIS SAFE',
    description:
      'IGNIS SAFE personnel workspace for shift schedules, leave requests, and assigned '
      + 'BFP Dasmariñas City Fire Station services.',
  },
  '/attendance-login': {
    title: 'Attendance Sign In — IGNIS SAFE',
    description: DEFAULT_DESCRIPTION,
  },
  '/dashboard': {
    title: 'Admin Dashboard — IGNIS SAFE',
    description:
      'IGNIS SAFE administrator dashboard for managing BFP Dasmariñas City Fire Station '
      + 'operations, safety services, and portal activity.',
  },
  '/dashboard/profile': {
    title: 'Administrator Profile — IGNIS SAFE',
    description:
      'Administrator profile and account settings for the IGNIS SAFE portal of BFP '
      + 'Dasmariñas City Fire Station.',
  },
  '/attendance-admin': {
    title: 'Attendance Management — IGNIS SAFE',
    description:
      'Attendance management workspace for authorized administrators of BFP Dasmariñas '
      + 'City Fire Station.',
  },
  '/dashboard/analytics': {
    title: 'Analytics — IGNIS SAFE',
    description:
      'Operational analytics and activity insights for the IGNIS SAFE portal of BFP '
      + 'Dasmariñas City Fire Station.',
  },
  '/dashboard/assessment-questions': {
    title: 'Assessment Questions — IGNIS SAFE',
    description:
      'Manage fire safety assessment questions and learning checks in the IGNIS SAFE '
      + 'portal of BFP Dasmariñas City Fire Station.',
  },
  '/dashboard/about-us': {
    title: 'About Us Content — IGNIS SAFE',
    description:
      'Manage public station information and About Us content for BFP Dasmariñas City '
      + 'Fire Station in the IGNIS SAFE portal.',
  },
  '/dashboard/learning-materials': {
    title: 'Learning Materials — IGNIS SAFE',
    description:
      'Manage fire safety learning materials and resources for the IGNIS SAFE portal of '
      + 'BFP Dasmariñas City Fire Station.',
  },
  '/dashboard/chart': {
    title: 'Organizational Chart Management — IGNIS SAFE',
    description:
      'Manage the organizational chart and station structure of BFP Dasmariñas City '
      + 'Fire Station in the IGNIS SAFE portal.',
  },
  '/dashboard/accounts': {
    title: 'Account Management — IGNIS SAFE',
    description:
      'Manage authorized portal accounts for BFP Dasmariñas City Fire Station through '
      + 'the IGNIS SAFE administrator workspace.',
  },
  '/dashboard/reports': {
    title: 'Administrator Reports — IGNIS SAFE',
    description:
      'Review administrator reports for fire safety inspection services and operations '
      + 'in the IGNIS SAFE portal.',
  },
  '/dashboard/users': {
    title: 'User Progress — IGNIS SAFE',
    description:
      'Review user learning progress and assessment activity in the IGNIS SAFE portal '
      + 'of BFP Dasmariñas City Fire Station.',
  },
  '/dashboard/progress': {
    title: 'Progress — IGNIS SAFE',
    description:
      'Review learning and assessment progress in the IGNIS SAFE portal of BFP '
      + 'Dasmariñas City Fire Station.',
  },
  '/dashboard/audit-logs': {
    title: 'Audit Logs — IGNIS SAFE',
    description:
      'Review portal audit activity for BFP Dasmariñas City Fire Station in the IGNIS '
      + 'SAFE administrator workspace.',
  },
  '/dashboard/announcements': {
    title: 'Announcements Management — IGNIS SAFE',
    description:
      'Manage fire safety announcements and station advisories in the IGNIS SAFE portal '
      + 'of BFP Dasmariñas City Fire Station.',
  },
  '/dashboard/visitor-messages': {
    title: 'Visitor Messages — IGNIS SAFE',
    description:
      'Review visitor messages and public inquiries for BFP Dasmariñas City Fire Station '
      + 'in the IGNIS SAFE administrator workspace.',
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
      // Unlisted private/auth routes: never index.
      upsertMeta('name', 'description', DEFAULT_DESCRIPTION);
      upsertLink('canonical', null);
      upsertMeta('name', 'robots', 'noindex, nofollow');
    }
  }, [pathname]);
}
