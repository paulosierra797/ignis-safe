const STORAGE_LABELS = {
  'system-backups': 'System backups',
  report_files: 'Report attachments',
  profile_pic: 'Profile photos',
  announcement_attachments: 'Announcement attachments',
  leave_supporting_documents: 'Leave documents',
  landing_banner_photos: 'Landing page photos',
  attendance_verifications: 'Attendance verification files',
  learning_materials: 'Learning materials',
  'Learning Materials': 'Learning materials',
};

export const storageLabel = (bucket) => STORAGE_LABELS[bucket]
  || String(bucket || 'Other files').replace(/[_-]+/g, ' ').replace(/^./, (value) => value.toUpperCase());
