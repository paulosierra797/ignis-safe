import {
  AUDIT_USER_ID, fixtureTables, installResponsiveFixtures, supabaseModule, userContextModule,
} from './responsive-layout.mjs';

export const SAMPLE_USER_ID = fixtureTables.profiles[0].id;
export const PROTECTED_ID = '00000000-0000-4000-8000-000000000901';

export async function installRevisionFixtures(context, { superAdmin = true, ageError = false, actorPermissions } = {}) {
  await installResponsiveFixtures(context);
  const seed = {
    admin: [
      { ...fixtureTables.admin[0], is_super_admin: superAdmin },
      { ...fixtureTables.admin[1] },
      { ...fixtureTables.admin[0], admin_id: PROTECTED_ID, id: PROTECTED_ID, first_name: 'Official', last_name: 'Protected Account', is_super_admin: true },
    ],
    profiles: fixtureTables.profiles,
    about_us_partner_info: [{ section_key: 'bfp_dasmarinas', heading_en: 'Learn fire safety', heading_tl: '', description_en: 'Protect our community', description_tl: '' }],
    assessments: [
      { id: 'sample-pre', module_id: 1, type: 'pre_test', title: 'Pre-Assessment' },
      { id: 'sample-post', module_id: 1, type: 'post_test', title: 'Post-Assessment' },
    ],
    assessment_attempts: [
      { id: 'finished-pre', user_id: SAMPLE_USER_ID, assessment_id: 'sample-pre', score: 50, status: 'submitted', submitted_at: '2026-10-01T00:00:00Z' },
      { id: 'finished-post', user_id: SAMPLE_USER_ID, assessment_id: 'sample-post', score: 80, status: 'submitted', submitted_at: '2026-10-02T00:00:00Z' },
      { id: 'unfinished-post', user_id: SAMPLE_USER_ID, assessment_id: 'sample-post', score: 0, status: 'in_progress', started_at: '2026-10-03T00:00:00Z' },
    ],
    module_progress: [
      { user_id: SAMPLE_USER_ID, module_id: 1, pre_test_completed_at: '2026-10-01', learning_material_completed_at: '2026-10-01', post_test_completed_at: '2026-10-02' },
      { user_id: fixtureTables.profiles[1].id, module_id: 1, simulation_completed_at: '2026-10-01' },
    ],
    archive_items: [0, 1].map(i => ({
      item_id: `sample-archive-${i}`, module: 'announcements', record_id: `sample-notice-${i}`,
      record_label: `Sample archived announcement ${i + 1}`, record_context: 'Public notice',
      archived_at: new Date(Date.now() - 86400000).toISOString(),
      purge_after: new Date(Date.now() + 29 * 86400000).toISOString(),
      status: 'active', disposition: 'soft_deleted', actor_type: 'admin', archived_by_name: 'Sample Admin',
      storage_objects: [], purge_state: 'pending', reason: 'Sample audit record',
    })),
    archive_events: [],
    archive_policies: [{ module: 'announcements', label: 'Announcements', purge_enabled: true, is_protected: false, retention_days: null, backup_confirmed_at: new Date().toISOString() }],
    system_backups: [{ backup_id: 'sample-backup', kind: 'manual', status: 'completed', created_by_name: 'Sample Admin', started_at: '2026-10-17T00:00:00Z', completed_at: '2026-10-17T00:01:00Z', verified_at: '2026-10-17T00:01:00Z', size_bytes: 1024, contents: { records: 10, files: 1 }, restore_status: null }],
  };
  await context.route('**/src/context/UserContext.jsx*', route => route.fulfill({
    contentType: 'application/javascript',
    body: userContextModule()
      .replace('const personnel =', `admin.is_super_admin = ${superAdmin}; admin.permissions = ${JSON.stringify(actorPermissions || (superAdmin ? [] : fixtureTables.admin[0].permissions))}; const personnel =`)
      .replace('hasPermission: () => true', 'hasPermission: permission => Boolean(user?.is_super_admin || user?.permissions?.includes(permission))')
      .replace('loading: false, hasPermission:', `loading: false, isSuperAdmin: ${superAdmin}, hasPermission:`),
  }));
  const rpc = `
    window.__revisionCalls ||= [];
    window.__revisionCalls.push({ kind: 'rpc', name, args });
    if (name === 'get_mobile_registration_ages') return ${ageError ? "Promise.resolve({data:null,error:{code:'PGRST202',message:'Sample unavailable age service'}})" : `success(tables.profiles.map((p,i) => ({user_id:p.id, age:i===0?22:null})))`};
    if (name === 'get_protected_account_ids') return success([${JSON.stringify(PROTECTED_ID)}]);
    if (name === 'get_storage_overview') return success({database_bytes:1024,buckets:[],growth:[]});
    if (name === 'manage_account') return success({ok:true,changed:true});
    if (name === 'restore_archive_item') return success(null);
  `;
  const functions = `
    window.__revisionCalls ||= [];
    window.__revisionCalls.push({kind:'function',name:_name,body});
    if (_name === 'translate-content') return success({translations:body.texts.map(text=>'Salin: '+text),usage:{remainingCharacters:1999000}});
    if (_name === 'backup-recovery' && body.action === 'status') return success({data:{encryptionReady:true}});
    if (_name === 'archive-maintenance') return success({data:{purged:true}});
  `;
  await context.route('**/src/utils/supabaseClient.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: supabaseModule()
      .replace('const officer =', `Object.assign(tables, ${JSON.stringify(seed)}); const officer =`)
      .replace('rpc: (name) => {', `rpc: (name, args) => {${rpc}`)
      .replace('update() { this.rows = []; return this; }', "update(payload) { window.__revisionCalls ||= []; window.__revisionCalls.push({kind:'update',table:this.table,payload}); this.rows=[]; return this; }")
      .replace('invoke: (_name, { body }) => {', `invoke: (_name, { body }) => {${functions}`),
  }));
  let importStarted = false;
  await context.route('**/api/admin/users/import-jobs**', async route => {
    const request = route.request();
    if (request.url().endsWith('/active') && !importStarted) {
      return route.fulfill({ contentType: 'application/json', body: '{"data":null}' });
    }
    if (request.method() === 'POST') importStarted = true;
    const cancelled = request.url().endsWith('/cancel');
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: {
      id: 'sample-import', status: cancelled ? 'cancelled' : 'running', total: 2, processed: 0, created: 0, failed: 0, rows: [],
    } }) });
  });
  await context.route('**/rest/v1/rpc/get_public_trends', route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({
      generated_at: '2026-10-17T00:00:00Z', min_group_size: 1, registered_learners: 8,
      registrations_by_month: [{ month: '2026-09', total: 5 }, { month: '2026-10', total: 8 }],
      barangays: { represented: 2, official_total: 2, represented_names: ['Salawag', 'San Francisco I'], by_month: [{ month: '2026-09', total: 1 }, { month: '2026-10', total: 2 }] },
      participation_by_month: [{ month: '2026-09', activities: 4, active_learners: 2 }, { month: '2026-10', activities: 12, active_learners: 8 }],
    }),
  }));
}

export { AUDIT_USER_ID };
