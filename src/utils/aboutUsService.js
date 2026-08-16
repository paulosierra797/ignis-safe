import { supabase } from './supabaseClient';

const IGNIS_SECTION_KEY = 'ignis_safe';
const PARTNER_SECTION_KEY = 'bfp_dasmarinas';
const EMERGENCY_SECTION_KEY = 'emergency_contacts';
const DIRECTORY_SECTION_KEY = 'cavite_directory';

const CONTACT_SELECT = 'contact_key, contact_type, display_value, dial_value, is_active';

const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 40);

const generateKey = (label, fallback = 'item') => {
  const base = slugify(label) || fallback;
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
};

const nextDisplayOrder = (rows = []) => rows.reduce(
  (max, row) => Math.max(max, Number(row.display_order) || 0),
  0
) + 1;

const flattenContact = (row = {}) => {
  const contact = row.contact || {};
  const { contact: _omit, ...rest } = row;
  return {
    ...rest,
    contact_type: contact.contact_type || '',
    display_value: contact.display_value || '',
    dial_value: contact.dial_value || '',
    contact_is_active: contact.is_active !== false,
  };
};

// Swaps display_order between the row at `index` and its neighbor in
// `direction` (-1 up / +1 down), matching the up/down reorder convention
// used elsewhere in the admin (e.g. LandingContentEditor banner photos).
const swapDisplayOrder = async (table, idField, rows, index, direction) => {
  try {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= rows.length) {
      return { error: null };
    }

    const current = rows[index];
    const target = rows[targetIndex];

    const [{ error: error1 }, { error: error2 }] = await Promise.all([
      supabase.from(table).update({ display_order: target.display_order }).eq(idField, current[idField]),
      supabase.from(table).update({ display_order: current.display_order }).eq(idField, target[idField]),
    ]);

    if (error1) throw error1;
    if (error2) throw error2;

    return { error: null };
  } catch (error) {
    console.error(`Error reordering ${table}:`, error);
    return { error: error.message };
  }
};

const deleteContactPointIfOrphaned = async (contactKey) => {
  if (!contactKey) return;

  const [linkResult, numberResult] = await Promise.all([
    supabase.from('about_us_partner_contact_links').select('contact_key', { count: 'exact', head: true }).eq('contact_key', contactKey),
    supabase.from('about_us_emergency_numbers').select('id', { count: 'exact', head: true }).eq('contact_key', contactKey),
  ]);

  const stillReferenced = (linkResult.count || 0) > 0 || (numberResult.count || 0) > 0;
  if (!stillReferenced) {
    await supabase.from('about_us_contact_points').delete().eq('contact_key', contactKey);
  }
};

// ---------------------------------------------------------------------------
// Sections + UI texts ("General About Us UI Texts" card)
// ---------------------------------------------------------------------------

export const listSections = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_sections')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading About Us sections:', error);
    return { data: [], error: error.message };
  }
};

export const updateSection = async (sectionKey, fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_sections')
      .update(fields)
      .eq('section_key', sectionKey)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating About Us section:', error);
    return { data: null, error: error.message };
  }
};

export const reorderSections = (rows, index, direction) => (
  swapDisplayOrder('about_us_sections', 'section_key', rows, index, direction)
);

export const listUiTexts = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_ui_texts')
      .select('*')
      .order('key', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading About Us UI texts:', error);
    return { data: [], error: error.message };
  }
};

export const updateUiText = async (key, fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_ui_texts')
      .update(fields)
      .eq('key', key)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating About Us UI text:', error);
    return { data: null, error: error.message };
  }
};

// ---------------------------------------------------------------------------
// IGNIS SAFE card
// ---------------------------------------------------------------------------

export const getIgnis = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_ignis')
      .select('*')
      .eq('section_key', IGNIS_SECTION_KEY)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error loading IGNIS SAFE content:', error);
    return { data: null, error: error.message };
  }
};

export const updateIgnis = async (fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_ignis')
      .update(fields)
      .eq('section_key', IGNIS_SECTION_KEY)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating IGNIS SAFE content:', error);
    return { data: null, error: error.message };
  }
};

export const listIgnisChips = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_ignis_chips')
      .select('*')
      .eq('section_key', IGNIS_SECTION_KEY)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading IGNIS SAFE chips:', error);
    return { data: [], error: error.message };
  }
};

export const createIgnisChip = async ({ label_en, label_tl, icon_key, display_order }) => {
  try {
    const { error } = await supabase.from('about_us_ignis_chips').insert({
      section_key: IGNIS_SECTION_KEY,
      label_en,
      label_tl,
      icon_key,
      display_order,
      is_active: true,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating IGNIS SAFE chip:', error);
    return { error: error.message };
  }
};

export const updateIgnisChip = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_ignis_chips').update(fields).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating IGNIS SAFE chip:', error);
    return { error: error.message };
  }
};

export const deleteIgnisChip = async (id) => {
  try {
    const { error } = await supabase.from('about_us_ignis_chips').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting IGNIS SAFE chip:', error);
    return { error: error.message };
  }
};

export const reorderIgnisChips = (rows, index, direction) => (
  swapDisplayOrder('about_us_ignis_chips', 'id', rows, index, direction)
);

export const listNameMeanings = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_name_meanings')
      .select('*')
      .eq('section_key', IGNIS_SECTION_KEY)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading name meanings:', error);
    return { data: [], error: error.message };
  }
};

export const createNameMeaning = async ({ term_en, term_tl, body_en, body_tl, display_order }) => {
  try {
    const { error } = await supabase.from('about_us_name_meanings').insert({
      section_key: IGNIS_SECTION_KEY,
      term_en,
      term_tl,
      body_en,
      body_tl,
      display_order,
      is_active: true,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating name meaning:', error);
    return { error: error.message };
  }
};

export const updateNameMeaning = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_name_meanings').update(fields).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating name meaning:', error);
    return { error: error.message };
  }
};

export const deleteNameMeaning = async (id) => {
  try {
    const { error } = await supabase.from('about_us_name_meanings').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting name meaning:', error);
    return { error: error.message };
  }
};

export const reorderNameMeanings = (rows, index, direction) => (
  swapDisplayOrder('about_us_name_meanings', 'id', rows, index, direction)
);

export const listTeamMembers = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_team_members')
      .select('*')
      .eq('section_key', IGNIS_SECTION_KEY)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error loading team members:', error);
    return { data: [], error: error.message };
  }
};

export const createTeamMember = async (fields) => {
  try {
    const { error } = await supabase.from('about_us_team_members').insert({
      section_key: IGNIS_SECTION_KEY,
      is_active: true,
      ...fields,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating team member:', error);
    return { error: error.message };
  }
};

export const updateTeamMember = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_team_members').update(fields).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating team member:', error);
    return { error: error.message };
  }
};

export const deleteTeamMember = async (id) => {
  try {
    const { error } = await supabase.from('about_us_team_members').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting team member:', error);
    return { error: error.message };
  }
};

export const reorderTeamMembers = (rows, index, direction) => (
  swapDisplayOrder('about_us_team_members', 'id', rows, index, direction)
);

// ---------------------------------------------------------------------------
// BFP Dasmariñas card
// ---------------------------------------------------------------------------

export const getPartnerInfo = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_partner_info')
      .select('*')
      .eq('section_key', PARTNER_SECTION_KEY)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error loading BFP Dasmariñas content:', error);
    return { data: null, error: error.message };
  }
};

export const updatePartnerInfo = async (fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_partner_info')
      .update(fields)
      .eq('section_key', PARTNER_SECTION_KEY)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating BFP Dasmariñas content:', error);
    return { data: null, error: error.message };
  }
};

export const listPartnerContactNumbers = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_partner_contact_links')
      .select(`section_key, contact_key, display_order, contact:about_us_contact_points(${CONTACT_SELECT})`)
      .eq('section_key', PARTNER_SECTION_KEY)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: (data || []).map(flattenContact), error: null };
  } catch (error) {
    console.error('Error loading BFP Dasmariñas contact numbers:', error);
    return { data: [], error: error.message };
  }
};

export const createPartnerContactNumber = async ({ label, display_value, dial_value }, existingRows = []) => {
  try {
    const contactKey = generateKey(label, 'contact');
    const { error: pointError } = await supabase.from('about_us_contact_points').insert({
      contact_key: contactKey,
      contact_type: label,
      display_value,
      dial_value,
      is_active: true,
    });
    if (pointError) throw pointError;

    const { error: linkError } = await supabase.from('about_us_partner_contact_links').insert({
      section_key: PARTNER_SECTION_KEY,
      contact_key: contactKey,
      display_order: nextDisplayOrder(existingRows),
    });
    if (linkError) throw linkError;

    return { error: null };
  } catch (error) {
    console.error('Error creating BFP Dasmariñas contact number:', error);
    return { error: error.message };
  }
};

export const updatePartnerContactNumber = async (contactKey, { label, display_value, dial_value }) => {
  try {
    const { error } = await supabase
      .from('about_us_contact_points')
      .update({ contact_type: label, display_value, dial_value })
      .eq('contact_key', contactKey);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating BFP Dasmariñas contact number:', error);
    return { error: error.message };
  }
};

export const deletePartnerContactNumber = async (contactKey) => {
  try {
    const { error } = await supabase
      .from('about_us_partner_contact_links')
      .delete()
      .eq('section_key', PARTNER_SECTION_KEY)
      .eq('contact_key', contactKey);

    if (error) throw error;

    await deleteContactPointIfOrphaned(contactKey);
    return { error: null };
  } catch (error) {
    console.error('Error deleting BFP Dasmariñas contact number:', error);
    return { error: error.message };
  }
};

export const reorderPartnerContactNumbers = (rows, index, direction) => (
  swapDisplayOrder('about_us_partner_contact_links', 'contact_key', rows, index, direction)
);

// ---------------------------------------------------------------------------
// Emergency Contacts card
// ---------------------------------------------------------------------------

export const getEmergencyInfo = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_emergency_info')
      .select('*')
      .eq('section_key', EMERGENCY_SECTION_KEY)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error loading Emergency Contacts content:', error);
    return { data: null, error: error.message };
  }
};

export const updateEmergencyInfo = async (fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_emergency_info')
      .update(fields)
      .eq('section_key', EMERGENCY_SECTION_KEY)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating Emergency Contacts content:', error);
    return { data: null, error: error.message };
  }
};

export const listEmergencyNumbers = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_emergency_numbers')
      .select(`id, section_key, label_en, label_tl, icon_key, display_order, is_active, contact_key, contact:about_us_contact_points(${CONTACT_SELECT})`)
      .eq('section_key', EMERGENCY_SECTION_KEY)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return { data: (data || []).map(flattenContact), error: null };
  } catch (error) {
    console.error('Error loading emergency numbers:', error);
    return { data: [], error: error.message };
  }
};

export const createEmergencyNumber = async ({ label_en, label_tl, icon_key, display_value, dial_value }, existingRows = []) => {
  try {
    const contactKey = generateKey(label_en, 'contact');
    const { error: pointError } = await supabase.from('about_us_contact_points').insert({
      contact_key: contactKey,
      contact_type: label_en,
      display_value,
      dial_value,
      is_active: true,
    });
    if (pointError) throw pointError;

    const { error: numberError } = await supabase.from('about_us_emergency_numbers').insert({
      section_key: EMERGENCY_SECTION_KEY,
      label_en,
      label_tl,
      icon_key,
      contact_key: contactKey,
      display_order: nextDisplayOrder(existingRows),
      is_active: true,
    });
    if (numberError) throw numberError;

    return { error: null };
  } catch (error) {
    console.error('Error creating emergency number:', error);
    return { error: error.message };
  }
};

export const updateEmergencyNumber = async (id, { label_en, label_tl, icon_key, is_active, display_order, contact_key, display_value, dial_value }) => {
  try {
    const { error: numberError } = await supabase
      .from('about_us_emergency_numbers')
      .update({ label_en, label_tl, icon_key, is_active, display_order })
      .eq('id', id);
    if (numberError) throw numberError;

    const { error: pointError } = await supabase
      .from('about_us_contact_points')
      .update({ display_value, dial_value })
      .eq('contact_key', contact_key);
    if (pointError) throw pointError;

    return { error: null };
  } catch (error) {
    console.error('Error updating emergency number:', error);
    return { error: error.message };
  }
};

export const deleteEmergencyNumber = async (id, contactKey) => {
  try {
    const { error } = await supabase.from('about_us_emergency_numbers').delete().eq('id', id);
    if (error) throw error;

    await deleteContactPointIfOrphaned(contactKey);
    return { error: null };
  } catch (error) {
    console.error('Error deleting emergency number:', error);
    return { error: error.message };
  }
};

export const reorderEmergencyNumbers = (rows, index, direction) => (
  swapDisplayOrder('about_us_emergency_numbers', 'id', rows, index, direction)
);

// ---------------------------------------------------------------------------
// Cavite BFP Directory card
// ---------------------------------------------------------------------------

export const getDirectoryInfo = async () => {
  try {
    const { data, error } = await supabase
      .from('about_us_directory_info')
      .select('*')
      .eq('section_key', DIRECTORY_SECTION_KEY)
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error loading Cavite BFP Directory content:', error);
    return { data: null, error: error.message };
  }
};

export const updateDirectoryInfo = async (fields) => {
  try {
    const { data, error } = await supabase
      .from('about_us_directory_info')
      .update(fields)
      .eq('section_key', DIRECTORY_SECTION_KEY)
      .select('*')
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error updating Cavite BFP Directory content:', error);
    return { data: null, error: error.message };
  }
};

// Fetches groups, entries, and phones in parallel and nests them into a
// group -> entries -> phones tree. The full directory is small (well under
// 100 rows total) so re-fetching this tree after any mutation is simpler
// and safer than patching deeply nested local state by hand.
export const getDirectoryTree = async () => {
  try {
    const [groupsResult, entriesResult, phonesResult] = await Promise.all([
      supabase.from('about_us_directory_groups').select('*').eq('section_key', DIRECTORY_SECTION_KEY).order('display_order', { ascending: true }),
      supabase.from('about_us_directory_entries').select('*').order('display_order', { ascending: true }),
      supabase.from('about_us_directory_phones').select('*').order('display_order', { ascending: true }),
    ]);

    if (groupsResult.error) throw groupsResult.error;
    if (entriesResult.error) throw entriesResult.error;
    if (phonesResult.error) throw phonesResult.error;

    const phonesByEntry = new Map();
    (phonesResult.data || []).forEach((phone) => {
      if (!phonesByEntry.has(phone.entry_key)) phonesByEntry.set(phone.entry_key, []);
      phonesByEntry.get(phone.entry_key).push(phone);
    });

    const entriesByGroup = new Map();
    (entriesResult.data || []).forEach((entry) => {
      if (!entriesByGroup.has(entry.group_key)) entriesByGroup.set(entry.group_key, []);
      entriesByGroup.get(entry.group_key).push({
        ...entry,
        phones: phonesByEntry.get(entry.entry_key) || [],
      });
    });

    const groups = (groupsResult.data || []).map((group) => ({
      ...group,
      entries: entriesByGroup.get(group.group_key) || [],
    }));

    return { data: groups, error: null };
  } catch (error) {
    console.error('Error loading Cavite BFP Directory tree:', error);
    return { data: [], error: error.message };
  }
};

export const createDirectoryGroup = async ({ title_en, title_tl, display_order }) => {
  try {
    const { error } = await supabase.from('about_us_directory_groups').insert({
      section_key: DIRECTORY_SECTION_KEY,
      group_key: generateKey(title_en, 'group'),
      title_en,
      title_tl,
      display_order,
      is_active: true,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating directory group:', error);
    return { error: error.message };
  }
};

export const updateDirectoryGroup = async (groupKey, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_groups').update(fields).eq('group_key', groupKey);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory group:', error);
    return { error: error.message };
  }
};

// Groups can have entries (and entries can have phones) that reference them
// by foreign key with no cascade configured, so a plain delete would fail
// with a foreign-key violation. Clear the tree underneath first.
export const deleteDirectoryGroup = async (groupKey) => {
  try {
    const { data: entries, error: entriesError } = await supabase
      .from('about_us_directory_entries')
      .select('entry_key')
      .eq('group_key', groupKey);
    if (entriesError) throw entriesError;

    const entryKeys = (entries || []).map((entry) => entry.entry_key);

    if (entryKeys.length > 0) {
      const { error: phonesError } = await supabase.from('about_us_directory_phones').delete().in('entry_key', entryKeys);
      if (phonesError) throw phonesError;

      const { error: deleteEntriesError } = await supabase.from('about_us_directory_entries').delete().in('entry_key', entryKeys);
      if (deleteEntriesError) throw deleteEntriesError;
    }

    const { error: groupError } = await supabase.from('about_us_directory_groups').delete().eq('group_key', groupKey);
    if (groupError) throw groupError;

    return { error: null };
  } catch (error) {
    console.error('Error deleting directory group:', error);
    return { error: error.message };
  }
};

export const reorderDirectoryGroups = (rows, index, direction) => (
  swapDisplayOrder('about_us_directory_groups', 'group_key', rows, index, direction)
);

export const createDirectoryEntry = async (groupKey, { name_en, name_tl, email, display_order }) => {
  try {
    const { error } = await supabase.from('about_us_directory_entries').insert({
      group_key: groupKey,
      entry_key: generateKey(name_en, 'entry'),
      name_en,
      name_tl,
      email,
      display_order,
      is_active: true,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating directory entry:', error);
    return { error: error.message };
  }
};

export const updateDirectoryEntry = async (entryKey, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_entries').update(fields).eq('entry_key', entryKey);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory entry:', error);
    return { error: error.message };
  }
};

export const deleteDirectoryEntry = async (entryKey) => {
  try {
    const { error: phonesError } = await supabase.from('about_us_directory_phones').delete().eq('entry_key', entryKey);
    if (phonesError) throw phonesError;

    const { error } = await supabase.from('about_us_directory_entries').delete().eq('entry_key', entryKey);
    if (error) throw error;

    return { error: null };
  } catch (error) {
    console.error('Error deleting directory entry:', error);
    return { error: error.message };
  }
};

export const reorderDirectoryEntries = (rows, index, direction) => (
  swapDisplayOrder('about_us_directory_entries', 'entry_key', rows, index, direction)
);

export const createDirectoryPhone = async (entryKey, { display_value, dial_value, display_order }) => {
  try {
    const { error } = await supabase.from('about_us_directory_phones').insert({
      entry_key: entryKey,
      display_value,
      dial_value,
      display_order,
      is_active: true,
    });

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error creating directory phone:', error);
    return { error: error.message };
  }
};

export const updateDirectoryPhone = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_phones').update(fields).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory phone:', error);
    return { error: error.message };
  }
};

export const deleteDirectoryPhone = async (id) => {
  try {
    const { error } = await supabase.from('about_us_directory_phones').delete().eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting directory phone:', error);
    return { error: error.message };
  }
};

export const reorderDirectoryPhones = (rows, index, direction) => (
  swapDisplayOrder('about_us_directory_phones', 'id', rows, index, direction)
);
