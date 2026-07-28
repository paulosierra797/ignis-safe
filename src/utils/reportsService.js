import { supabase } from './supabaseClient';

const REPORTS_TABLE = 'reports';
const STORAGE_BUCKET = 'report_files';
const REPORT_REVIEW_TABLE = 'report_reviews';
const MAX_REPORT_ATTACHMENTS = 5;

const formatRole = (role = '') => String(role || '').toLowerCase().trim();

export const uploadReportPdf = async (userId, fileName, blob) => {
  try {
    const safeUserId = userId || 'unknown-user';
    const safeName = fileName || `report-${Date.now()}.pdf`;
    const filePath = `${safeUserId}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const {
      data: { publicUrl }
    } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);

    return { data: { filePath, publicUrl }, error: null };
  } catch (error) {
    console.error('Error uploading report PDF:', error);
    return { data: null, error: error.message };
  }
};

export const getReportAttachments = (report = {}) => {
  const payloadAttachments = Array.isArray(report?.report_payload?.attachments)
    ? report.report_payload.attachments
    : [];

  const normalized = payloadAttachments
    .map((attachment) => ({
      file_name: String(attachment?.file_name || attachment?.name || '').trim(),
      file_url: String(attachment?.file_url || attachment?.url || '').trim(),
      file_path: String(attachment?.file_path || attachment?.path || '').trim()
    }))
    .filter((attachment) => attachment.file_name && attachment.file_url);

  if (normalized.length > 0) return normalized;

  if (report?.pdf_url) {
    return [{
      file_name: report.pdf_file_name || 'Report.pdf',
      file_url: report.pdf_url,
      file_path: ''
    }];
  }

  return [];
};

export const submitInvestigationReport = async ({
  reportType,
  title,
  category,
  reportPayload,
  pdfFiles = [],
  pdfBlob,
  pdfFileName,
  createdBy,
  createdByName,
  reportId = null
}) => {
  try {
    if (!createdBy) {
      return { data: null, error: 'Missing user id for report submission.' };
    }

    const filesToUpload = Array.isArray(pdfFiles) && pdfFiles.length > 0
      ? pdfFiles.map((file) => ({
        blob: file,
        fileName: file?.name || 'uploaded-report.pdf'
      }))
      : pdfBlob
        ? [{ blob: pdfBlob, fileName: pdfFileName || 'uploaded-report.pdf' }]
        : [];

    if (filesToUpload.length === 0) {
      return { data: null, error: 'At least one PDF attachment is required.' };
    }

    if (filesToUpload.length > MAX_REPORT_ATTACHMENTS) {
      return {
        data: null,
        error: `A report can include up to ${MAX_REPORT_ATTACHMENTS} PDF attachments.`
      };
    }

    const uploadedAttachments = [];

    for (const file of filesToUpload) {
      const upload = await uploadReportPdf(createdBy, file.fileName, file.blob);
      if (upload.error) {
        if (uploadedAttachments.length > 0) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove(uploadedAttachments.map((attachment) => attachment.file_path));
        }
        return { data: null, error: upload.error };
      }

      uploadedAttachments.push({
        file_name: file.fileName,
        file_url: upload.data.publicUrl,
        file_path: upload.data.filePath
      });
    }

    const nowIso = new Date().toISOString();
    const primaryAttachment = uploadedAttachments[0];

    const basePayload = {
      report_type: reportType,
      title,
      category,
      status: 'submitted',
      created_by_name: createdByName,
      report_payload: {
        ...(reportPayload || {}),
        attachments: uploadedAttachments
      },
      pdf_url: primaryAttachment.file_url,
      pdf_file_name: primaryAttachment.file_name,
      submitted_at: nowIso
    };

    let data;
    let error;

    if (reportId) {
      const result = await supabase
        .from(REPORTS_TABLE)
        .update(basePayload)
        .eq('report_id', reportId)
        .eq('created_by', createdBy)
        .select('*')
        .single();

      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from(REPORTS_TABLE)
        .insert([
          {
            ...basePayload,
            created_by: createdBy
          }
        ])
        .select('*')
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove(uploadedAttachments.map((attachment) => attachment.file_path));
      throw error;
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error submitting investigation report:', error);
    return { data: null, error: error.message };
  }
};

export const saveInvestigationDraft = async ({
  reportType,
  title,
  category,
  reportPayload,
  createdBy,
  createdByName,
  reportId = null
}) => {
  try {
    if (!createdBy) {
      return { data: null, error: 'Missing user id for draft save.' };
    }

    const payload = {
      report_type: reportType,
      title,
      category,
      status: 'draft',
      created_by_name: createdByName,
      report_payload: reportPayload
    };

    let data;
    let error;

    if (reportId) {
      const result = await supabase
        .from(REPORTS_TABLE)
        .update(payload)
        .eq('report_id', reportId)
        .eq('created_by', createdBy)
        .select('*')
        .single();

      data = result.data;
      error = result.error;
    } else {
      const result = await supabase
        .from(REPORTS_TABLE)
        .insert([
          {
            ...payload,
            created_by: createdBy
          }
        ])
        .select('*')
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error('Error saving investigation report draft:', error);
    return { data: null, error: error.message };
  }
};

export const getAdminSubmittedReports = async () => {
  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select('report_id, report_no, title, category, status, submitted_at, created_by_name, pdf_url, pdf_file_name, report_payload')
      .in('status', ['submitted', 'under_review', 'approved', 'rejected'])
      .order('submitted_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching submitted reports:', error);
    return { data: [], error: error.message };
  }
};

export const getPersonnelReportHistory = async (createdBy) => {
  try {
    if (!createdBy) {
      return { data: [], error: 'Missing personnel id.' };
    }

    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select('report_id, report_no, report_type, title, category, status, created_at, updated_at, submitted_at, created_by_name, pdf_url, pdf_file_name, internal_notes, report_payload')
      .eq('created_by', createdBy)
      .in('status', ['draft', 'submitted', 'under_review', 'approved', 'rejected'])
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching personnel report history:', error);
    return { data: [], error: error.message };
  }
};

export const updateReportStatus = async (reportId, status, internalNotes = '') => {
  try {
    const nextStatus = String(status || '').toLowerCase();
    const allowed = ['submitted', 'under_review', 'approved', 'rejected', 'archived'];

    if (!allowed.includes(nextStatus)) {
      return { data: null, error: 'Invalid status update.' };
    }

    const updates = {
      status: nextStatus,
      internal_notes: internalNotes || null,
      reviewed_at: new Date().toISOString()
    };

    if (nextStatus === 'submitted') {
      updates.reviewed_at = null;
    }

    if (nextStatus === 'approved') {
      updates.approved_at = new Date().toISOString();
    }

    if (nextStatus === 'rejected') {
      updates.rejected_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .update(updates)
      .eq('report_id', reportId)
      .select('*')
      .single();

    if (error) throw error;

    // Best-effort audit trail logging for administrator review actions.
    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user?.id) {
        const actorName = [user.user_metadata?.first_name, user.user_metadata?.last_name]
          .filter(Boolean)
          .join(' ')
          .trim() || user.email || 'Administrator';

        await supabase
          .from(REPORT_REVIEW_TABLE)
          .insert([
            {
              report_id: reportId,
              action: nextStatus,
              remarks: internalNotes || null,
              acted_by: user.id,
              acted_by_name: actorName
            }
          ]);
      }
    } catch (logError) {
      console.warn('Could not append report review history:', logError);
    }

    return { data, error: null };
  } catch (error) {
    console.error('Error updating report status:', error);
    return { data: null, error: error.message };
  }
};

export const canMonitorReports = (currentUser) => {
  const role = formatRole(currentUser?.role);
  return role === 'admin';
};

export const getAdminArchivedReports = async () => {
  try {
    const { data, error } = await supabase
      .from(REPORTS_TABLE)
      .select('report_id, report_no, title, category, status, submitted_at, updated_at, created_by_name, pdf_url')
      .eq('status', 'archived')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    console.error('Error fetching archived reports:', error);
    return { data: [], error: error.message };
  }
};

export const restoreArchivedReport = async (reportId) => {
  return updateReportStatus(reportId, 'submitted');
};

export const permanentlyDeleteReport = async (reportId) => {
  try {
    const { error } = await supabase
      .from(REPORTS_TABLE)
      .delete()
      .eq('report_id', reportId);

    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error('Error deleting archived report:', error);
    return { error: error.message };
  }
};

const mapReviewActionToLabel = (action = '') => {
  const normalized = String(action || '').toLowerCase();
  if (normalized === 'under_review') return { action: 'Under Review', actionType: 'edit' };
  if (normalized === 'approved') return { action: 'Report Approved', actionType: 'submission' };
  if (normalized === 'rejected') return { action: 'Report Rejected', actionType: 'edit' };
  if (normalized === 'archived') return { action: 'Report Archived', actionType: 'archive' };
  if (normalized === 'submitted') return { action: 'Report Restored', actionType: 'archive' };
  return { action: 'Report Updated', actionType: 'edit' };
};

export const getAdminReportAuditLogs = async () => {
  try {
    const [{ data: reportsData, error: reportsError }, { data: reviewsData, error: reviewsError }] = await Promise.all([
      supabase
        .from(REPORTS_TABLE)
        .select('report_id, report_no, title, category, created_by_name, submitted_at')
        .not('submitted_at', 'is', null)
        .order('submitted_at', { ascending: false }),
      supabase
        .from(REPORT_REVIEW_TABLE)
        .select('review_id, report_id, action, remarks, acted_by_name, acted_at, reports(report_no, title, category)')
        .order('acted_at', { ascending: false })
    ]);

    if (reportsError) throw reportsError;
    if (reviewsError) throw reviewsError;

    const submissionLogs = (reportsData || []).map((row) => ({
      id: `submit-${row.report_id}`,
      timestamp: row.submitted_at,
      user: row.created_by_name || 'Personnel',
      action: 'Report Submitted',
      actionType: 'submission',
      details: `${row.title || 'Investigation Report'} (${row.category || '-'})${row.report_no ? ` - ${row.report_no}` : ''}`,
      status: 'SUCCESS'
    }));

    const reviewLogs = (reviewsData || []).map((row) => {
      const mapped = mapReviewActionToLabel(row.action);
      const related = row.reports || {};

      return {
        id: `review-${row.review_id}`,
        timestamp: row.acted_at,
        user: row.acted_by_name || 'Administrator',
        action: mapped.action,
        actionType: mapped.actionType,
        details:
          row.remarks ||
          `${related.title || 'Investigation Report'} (${related.category || '-'})${related.report_no ? ` - ${related.report_no}` : ''}`,
        status: 'SUCCESS'
      };
    });

    const combined = [...submissionLogs, ...reviewLogs].sort((a, b) => {
      const aTime = new Date(a.timestamp || 0).getTime();
      const bTime = new Date(b.timestamp || 0).getTime();
      return bTime - aTime;
    });

    return { data: combined, error: null };
  } catch (error) {
    console.error('Error fetching administrator report audit logs:', error);
    return { data: [], error: error.message };
  }
};
