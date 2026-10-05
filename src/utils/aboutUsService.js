import { supabase } from './supabaseClient';

const IGNIS_SECTION_KEY = 'ignis_safe';
const PARTNER_SECTION_KEY = 'bfp_dasmarinas';
const EMERGENCY_SECTION_KEY = 'emergency_contacts';
const DIRECTORY_SECTION_KEY = 'cavite_directory';

const editableAboutText = (fields) => Object.fromEntries(
  Object.entries(fields).filter(([key, value]) =>
    (typeof value === 'string' || value === null)
    && !/(?:url|path|asset|image|icon|key|id)(?:_en|_tl)?$/.test(key)
    && (/(?:_en|_tl)$/.test(key) || [
      'fire_marshal_name', 'email', 'display_value', 'dial_value'
    ].includes(key))
  )
);

const CONTACT_SELECT = 'contact_key, contact_type, display_value, dial_value, is_active';

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
      .update(editableAboutText(fields))
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
      .update(editableAboutText(fields))
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
      .update(editableAboutText(fields))
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

export const updateIgnisChip = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_ignis_chips').update(editableAboutText(fields)).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating IGNIS SAFE chip:', error);
    return { error: error.message };
  }
};

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

export const updateNameMeaning = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_name_meanings').update(editableAboutText(fields)).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating name meaning:', error);
    return { error: error.message };
  }
};

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

export const updateTeamMember = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_team_members').update(editableAboutText(fields)).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating team member:', error);
    return { error: error.message };
  }
};

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
      .update(editableAboutText(fields))
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
      .update(editableAboutText(fields))
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

export const updateEmergencyNumber = async (id, { label_en, label_tl, contact_key, display_value, dial_value }) => {
  try {
    const { error: numberError } = await supabase
      .from('about_us_emergency_numbers')
      .update({ label_en, label_tl })
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
      .update(editableAboutText(fields))
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

export const updateDirectoryGroup = async (groupKey, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_groups').update(editableAboutText(fields)).eq('group_key', groupKey);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory group:', error);
    return { error: error.message };
  }
};

export const updateDirectoryEntry = async (entryKey, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_entries').update(editableAboutText(fields)).eq('entry_key', entryKey);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory entry:', error);
    return { error: error.message };
  }
};

export const updateDirectoryPhone = async (id, fields) => {
  try {
    const { error } = await supabase.from('about_us_directory_phones').update(editableAboutText(fields)).eq('id', id);
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error updating directory phone:', error);
    return { error: error.message };
  }
};
