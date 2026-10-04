export const AUDIT_USER_ID = '00000000-0000-4000-8000-000000000101';

export async function installResponsiveFixtures(context) {
  await context.route('**/src/context/UserContext.jsx*', route => route.fulfill({ contentType: 'application/javascript', body: userContextModule() }));
  await context.route('**/src/utils/supabaseClient.js*', route => route.fulfill({ contentType: 'application/javascript', body: supabaseModule() }));
  await context.route('**/*.supabase.co/**', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/').at(-1);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(fixtureTables[table] || []) });
    }
    return route.abort();
  });
  await context.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"data":null}' }));
  await context.addInitScript(({ id }) => {
    sessionStorage.setItem('attendanceAuth', JSON.stringify({ admin_id: id, id, name: 'Juan Miguel Dela Cruz-Santos', rank: 'FO2', email: 'officer@example.test', timestamp: Date.now(), sessionId: 'audit-attendance' }));
  }, { id: AUDIT_USER_ID });
}

const baseUser = {
  admin_id: AUDIT_USER_ID,
  id: AUDIT_USER_ID,
  auth_user_id: AUDIT_USER_ID,
  first_name: 'Juan Miguel',
  last_name: 'Dela Cruz-Santos',
  name: 'Juan Miguel Dela Cruz-Santos',
  full_name: 'Juan Miguel Dela Cruz-Santos',
  email: 'juan.miguel.delacruz.santos@example.test',
  rank: 'FO2',
  shift: 'Shift A',
  status: 'active',
  avatar_url: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
  permissions: ['view_dashboard', 'view_charts', 'view_attendance', 'view_accounts', 'manage_users', 'view_analytics', 'view_progress', 'view_audit_logs', 'view_reports', 'manage_reports', 'create_reports'],
};

const conversation = {
  id: '00000000-0000-4000-8000-000000000401',
  visitor_name: 'Alexandria Marie Dela Cruz-Montenegro',
  visitor_email: 'alexandria.marie.delacruz.montenegro@example.test',
  last_message_preview: 'Please clarify the requirements for our community fire safety activity.',
  last_message_at: '2026-10-01T00:00:00Z',
  status: 'open',
  unread: true,
  is_archived: false,
};
const messages = [
  { id: 'audit-visitor-message', sender_type: 'visitor', body: 'Please clarify the requirements for our community fire safety activity. Reference: https://example.test/community-preparedness-and-fire-safety-advisory-for-dasmarinas-residents.', created_at: '2026-10-01T00:00:00Z' },
  { id: 'audit-admin-message', sender_type: 'admin', admin_name: 'BFP Dasmarinas Team', body: 'Thank you for your message. Our team will review your inquiry and get back to you as soon as possible.', created_at: '2026-10-01T00:01:00Z' },
];

export const fixtureTables = {
  admin: [
    { ...baseUser, role: 'admin' },
    { ...baseUser, admin_id: '00000000-0000-4000-8000-000000000102', id: '00000000-0000-4000-8000-000000000102', first_name: 'Maria Alexandra', last_name: 'Reyes', email: 'maria.alexandra.reyes@example.test', role: 'personnel' },
  ],
  personnel_workspace_profiles: [{ ...baseUser, role: 'personnel', is_personnel_workspace_profile: true }],
  profiles: Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(201 + i).padStart(12, '0')}`,
    first_name: i === 0 ? 'Alexandria Marie' : `Visitor ${i + 1}`,
    last_name: i === 0 ? 'Dela Cruz-Montenegro' : 'Santos',
    email: i === 0 ? 'alexandria.marie.delacruz.montenegro@example.test' : `visitor${i + 1}@example.test`,
    username: `visitor_${i + 1}`,
    barangay: i % 2 ? '' : 'San Francisco I',
    city: i % 2 ? '' : 'Dasmariñas',
    province: i % 2 ? '' : 'Cavite',
    registration_status: 'completed',
    terms_accepted: true,
    terms_accepted_at: '2026-09-30T00:00:00Z',
    completed_simulations: [],
    created_at: '2026-09-30T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  })),
  dasmarinas_barangays: [{ name: 'San Francisco I', display_order: 1 }, { name: 'Salawag', display_order: 2 }],
  modules: [{ id: 1, module_no: 1, title: 'Fire Extinguisher: Basics, Types, and How to Use an Extinguisher' }],
  announcements: [{
    announcement_id: '00000000-0000-4000-8000-000000000301',
    title: 'Fire Safety Awareness and Community Preparedness: Important Station Advisory',
    content: 'Stay prepared and keep emergency exits clear. Follow your station procedures and confirm your attendance before reporting for duty.\n\nThis sample announcement contains a second paragraph and a long reference: https://example.test/community-preparedness-and-fire-safety-advisory-for-dasmarinas-residents.',
    audience: 'public',
    status: 'published',
    archived_at: null,
    is_archived: false,
    is_active: true,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    attachments: [],
  }],
  shift_schedule: [{ id: 'default', shift_a_dates: [], shift_b_dates: [], updated_at: '2026-10-01T00:00:00Z' }],
};

// These modules are served only by the audit browser's request interception.
export function userContextModule() {
  return `
    const admin = ${JSON.stringify({ ...baseUser, role: 'admin' })};
    const personnel = ${JSON.stringify({ ...baseUser, role: 'personnel' })};
    const noop = () => {};
    const refresh = async () => admin;
    export const UserProvider = ({ children }) => children;
    export const useUser = () => {
      const path = location.pathname;
      const isPublic = ['/', '/portal/login', '/terms', '/privacy', '/send-message', '/organizational-chart', '/confirm-signup'].includes(path);
      const isPersonnel = path.startsWith('/personnel') || ['/reports', '/attendance-personnel', '/attendance-confirm', '/attendance-scan', '/attendance-login'].includes(path);
      const user = isPublic ? null : isPersonnel ? personnel : admin;
      return { currentUser: user, accountUser: user, loading: false, hasPermission: () => true, setCurrentUser: noop, refreshCurrentUser: refresh, switchRole: noop, logout: async () => {}, forgetThisDevice: async () => ({ error: null }), checkCurrentDeviceTrust: async () => ({ trusted: false }) };
    };
  `;
}

export function supabaseModule() {
  return `
    const tables = ${JSON.stringify(fixtureTables)};
    const officer = ${JSON.stringify({ ...baseUser, role: 'personnel' })};
    const conversation = ${JSON.stringify(conversation)};
    const messages = ${JSON.stringify(messages)};
    const success = data => Promise.resolve({ data, error: null });
    const empty = () => success(null);
    class Query {
      constructor(table) { this.table = table; this.rows = [...(tables[table] || [])]; this.one = false; }
      select() { return this; }
      eq(key, value) { this.rows = this.rows.filter(row => row[key] === value); return this; }
      neq(key, value) { this.rows = this.rows.filter(row => row[key] !== value); return this; }
      in(key, values) { this.rows = this.rows.filter(row => values.includes(row[key])); return this; }
      is(key, value) { this.rows = this.rows.filter(row => (row[key] ?? null) === value); return this; }
      not() { return this; } or() { return this; } filter() { return this; }
      order() { return this; } gte() { return this; } lte() { return this; } gt() { return this; } lt() { return this; }
      ilike() { return this; } like() { return this; } contains() { return this; }
      limit(n) { this.rows = this.rows.slice(0, n); return this; }
      range(a, b) { this.rows = this.rows.slice(a, b + 1); return this; }
      single() { this.one = true; return this; } maybeSingle() { this.one = true; return this; }
      insert(payload) { this.rows = this.table === 'app_sessions' ? [{ ...payload, session_id: 'audit-app-session' }] : []; return this; } update() { this.rows = []; return this; }
      upsert() { this.rows = []; return this; } delete() { this.rows = []; return this; }
      then(resolve, reject) { return Promise.resolve({ data: this.one ? (this.rows[0] || null) : this.rows, count: this.rows.length, error: null }).then(resolve, reject); }
    }
    const channel = { on() { return this; }, subscribe() { return this; }, unsubscribe: async () => {} };
    const authUser = { id: officer.admin_id, email: officer.email, user_metadata: { name: officer.name, rank: officer.rank }, app_metadata: {} };
    const getSession = () => success({ session: location.pathname === '/portal/login' ? null : { user: authUser, access_token: 'layout-test-only', expires_at: 4102444800 } });
    const qr = { valid: true, session: { session_id: 'audit-station', station_id: 'DEFAULT', expires_at: new Date(Date.now() + 300000).toISOString() } };
    export const supabase = {
      from: table => new Query(table),
      rpc: (name) => {
        if (name === 'is_active_personnel_account') return success(true);
        if (name === 'get_mobile_registration_locations') return success(tables.profiles.map((p, i) => ({ user_id: p.id, location: i % 2 ? 'Outside Dasmariñas City' : 'Dasmariñas City, Cavite' })));
        if (name.includes('validate_attendance') || name.includes('claim_attendance')) return success(qr);
        if (name === 'get_active_attendance_qr_session' || name === 'create_attendance_qr_session') return success(qr.session);
        if (name === 'get_own_attendance_status') return success({ can_time_in: true, can_time_out: false, time_in: null, time_out: null, next_action: 'time_in' });
        return success([]);
      },
      auth: { getSession, getUser: () => success({ user: authUser }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: empty, refreshSession: getSession },
      channel: () => channel, removeChannel: empty, removeAllChannels: empty,
      storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: '' } }), createSignedUrl: empty, list: () => success([]) }) },
      functions: { invoke: (_name, { body }) => {
        if (body.action === 'list') return success({ data: { conversations: [conversation] } });
        if (body.action === 'get' || body.action === 'fetch') return success({ data: { conversation, messages } });
        return success({ data: null });
      } },
    };
  `;
}
