import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import LandingPreview from './LandingPreview';
import ToastMessage from './ToastMessage';
import { useLandingContent } from '../context/LandingContentContext';
import { useUser } from '../context/UserContext';
import { FiArrowDown, FiArrowLeft, FiArrowUp, FiEdit3, FiExternalLink, FiEye, FiImage, FiMove, FiPlus, FiRefreshCw, FiTrash2, FiX } from 'react-icons/fi';
import { deleteBannerPhotoPaths, MAX_BANNER_PHOTOS, uploadBannerPhoto } from '../utils/bannerPhotoService';
import './LandingContentEditor.css';
import './AppDialog.css';

const LANDING_DRAFT_STORAGE_KEY = 'ignis-safe:landing-draft';

const isBrowserStorageAvailable = () => typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

const readLandingDraft = () => {
  if (!isBrowserStorageAvailable()) return null;

  try {
    const raw = sessionStorage.getItem(LANDING_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLandingDraft = (draft) => {
  if (!isBrowserStorageAvailable()) return;

  try {
    sessionStorage.setItem(LANDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore storage write failures (e.g. quota exceeded, private browsing).
  }
};

const clearLandingDraft = () => {
  if (!isBrowserStorageAvailable()) return;
  sessionStorage.removeItem(LANDING_DRAFT_STORAGE_KEY);
};

const isValidLandingDraftShape = (value) => Boolean(
  value && typeof value === 'object' &&
  value.hero && value.about && value.contact && value.trust && value.process && value.faq
);

const deepClone = (value) => JSON.parse(JSON.stringify(value));
const getValueAtPath = (source, path) => String(path || '').split('.').reduce(
  (value, key) => value?.[Number.isNaN(Number(key)) ? key : Number(key)],
  source
);
const setValueAtPath = (source, path, value) => {
  const next = deepClone(source);
  const keys = String(path || '').split('.');
  let cursor = next;

  keys.slice(0, -1).forEach((key) => {
    cursor = cursor[Number.isNaN(Number(key)) ? key : Number(key)];
  });
  const finalKey = keys[keys.length - 1];
  cursor[Number.isNaN(Number(finalKey)) ? finalKey : Number(finalKey)] = value;
  return next;
};
const toLines = (value) => (Array.isArray(value) ? value : [String(value || '')]).join('\n');
const fromLines = (value) => String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
const mobileNumberRegex = /^09\d{9}$/;

const displayValue = (value) => {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '').trim();
  return text || '—';
};

const stepsText = (steps) => (steps || []).map((step) => step.text).join(' | ');
const summarizeHeroPhotos = (photos) => {
  const validPhotos = Array.isArray(photos) ? photos.filter((photo) => photo?.url) : [];
  if (validPhotos.length === 0) return 'No uploaded banner photos';
  return validPhotos.map((photo, index) => `${index + 1}. ${photo.alt || photo.fileName || 'Banner photo'}`).join(' | ');
};

const LANDING_FIELD_MAP = [
  { label: 'Main Page Title', get: (c) => c.hero.title },
  { label: 'Welcome Message', get: (c) => c.hero.lead },
  { label: 'Supporting Description', get: (c) => c.hero.description },
  { label: 'Main Page Title (Filipino)', get: (c) => c.hero.tagalog.title },
  { label: 'Welcome Message (Filipino)', get: (c) => c.hero.tagalog.lead },
  { label: 'Supporting Description (Filipino)', get: (c) => c.hero.tagalog.description },
  { label: 'Main Banner Photos', get: (c) => summarizeHeroPhotos(c.hero.photos) },
  { label: 'About Us Section Heading', get: (c) => c.about.title },
  { label: 'About Us Description', get: (c) => c.about.intro },
  { label: 'Mission Title', get: (c) => c.about.missionTitle },
  { label: 'Mission Description', get: (c) => c.about.missionText },
  { label: 'Vision Title', get: (c) => c.about.visionTitle },
  { label: 'Vision Description', get: (c) => c.about.visionText },
  { label: 'About Us Section Heading (Filipino)', get: (c) => c.about.tagalog.title },
  { label: 'About Us Description (Filipino)', get: (c) => c.about.tagalog.intro },
  { label: 'Contact Section Heading', get: (c) => c.contact.title },
  { label: 'Emergency Hotline Title', get: (c) => c.contact.emergencyTitle },
  { label: 'Contact Section Heading (Filipino)', get: (c) => c.contact.tagalog.title },
  { label: 'Emergency Hotline Title (Filipino)', get: (c) => c.contact.tagalog.emergencyTitle },
  { label: 'Landline Number 1', get: (c) => c.contact.landlinePrimary },
  { label: 'Landline Number 2', get: (c) => c.contact.landlineSecondary },
  { label: 'Mobile Number', get: (c) => c.contact.mobile },
  { label: 'Email Address', get: (c) => c.contact.email },
  { label: 'Facebook Page Name', get: (c) => c.contact.facebookLabel },
  { label: 'Facebook Page Link', get: (c) => c.contact.facebookUrl },
  { label: 'Landing Page Section Order', get: (c) => c.layout?.sections || [] },
  { label: 'Hidden Landing Page Sections', get: (c) => c.layout?.hidden || [] },
  { label: 'Station Logo', get: (c) => c.media?.brandLogo?.fileName || c.media?.brandLogo?.url || 'Default image' },
  { label: 'About Us Photo', get: (c) => c.media?.aboutPhoto?.fileName || c.media?.aboutPhoto?.url || 'Default image' },
  { label: 'Contact Photo', get: (c) => c.media?.contactPhoto?.fileName || c.media?.contactPhoto?.url || 'Default image' },
  { label: 'Mobile App Learning Screen', get: (c) => c.media?.mobileLearningPhoto?.fileName || c.media?.mobileLearningPhoto?.url || 'Default image' },
  { label: 'Mobile App Splash Screen', get: (c) => c.media?.mobileSplashPhoto?.fileName || c.media?.mobileSplashPhoto?.url || 'Default image' },
];

const humanizeFieldName = (value) => String(value || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/^./, (letter) => letter.toUpperCase());

const getChangedFields = (oldContent, newContent) => {
  const changes = [];

  LANDING_FIELD_MAP.forEach(({ label, get }) => {
    const oldValue = get(oldContent);
    const newValue = get(newContent);
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({ label, oldValue: displayValue(oldValue), newValue: displayValue(newValue) });
    }
  });

  ['english', 'tagalog'].forEach((locale) => {
    const localeLabel = locale === 'english' ? 'English' : 'Filipino';

    ['eyebrow', 'title', 'intro'].forEach((field) => {
      const oldValue = oldContent.trust[locale][field];
      const newValue = newContent.trust[locale][field];
      if (String(oldValue ?? '') !== String(newValue ?? '')) {
        changes.push({
          label: `Trust and Accessibility (${localeLabel}) ${field}`,
          oldValue: displayValue(oldValue),
          newValue: displayValue(newValue),
        });
      }
    });

    (newContent.trust[locale].items || []).forEach((item, index) => {
      const oldItem = oldContent.trust[locale].items?.[index] || {};
      ['title', 'text'].forEach((field) => {
        if (String(oldItem[field] ?? '') !== String(item[field] ?? '')) {
          changes.push({
            label: `Trust and Accessibility (${localeLabel}) Item ${index + 1} ${field}`,
            oldValue: displayValue(oldItem[field]),
            newValue: displayValue(item[field]),
          });
        }
      });
    });

    const oldTitle = oldContent.process[locale].title;
    const newTitle = newContent.process[locale].title;
    if (String(oldTitle ?? '') !== String(newTitle ?? '')) {
      changes.push({ label: `Process Section (${localeLabel}) Title`, oldValue: displayValue(oldTitle), newValue: displayValue(newTitle) });
    }

    const oldSections = oldContent.process[locale].processSteps || [];
    const newSections = newContent.process[locale].processSteps || [];
    newSections.forEach((section, index) => {
      const oldSection = oldSections[index];
      if (!oldSection) return;
      if (String(oldSection.title ?? '') !== String(section.title ?? '')) {
        changes.push({
          label: `Process Section (${localeLabel}) – Column ${index + 1} Title`,
          oldValue: displayValue(oldSection.title),
          newValue: displayValue(section.title),
        });
      }
      const oldSteps = stepsText(oldSection.steps);
      const newSteps = stepsText(section.steps);
      if (oldSteps !== newSteps) {
        changes.push({
          label: `Process Section (${localeLabel}) – Column ${index + 1} Steps`,
          oldValue: displayValue(oldSteps),
          newValue: displayValue(newSteps),
        });
      }
    });

    const oldFaqTitle = oldContent.faq[locale].title;
    const newFaqTitle = newContent.faq[locale].title;
    if (String(oldFaqTitle ?? '') !== String(newFaqTitle ?? '')) {
      changes.push({ label: `FAQ Section (${localeLabel}) Title`, oldValue: displayValue(oldFaqTitle), newValue: displayValue(newFaqTitle) });
    }

    const oldFaqs = oldContent.faq[locale].faqs || [];
    const newFaqs = newContent.faq[locale].faqs || [];
    newFaqs.forEach((faqItem, index) => {
      const oldFaqItem = oldFaqs[index];
      if (!oldFaqItem) return;
      if (String(oldFaqItem.question ?? '') !== String(faqItem.question ?? '')) {
        changes.push({
          label: `FAQ (${localeLabel}) – Question ${index + 1}`,
          oldValue: displayValue(oldFaqItem.question),
          newValue: displayValue(faqItem.question),
        });
      }
      const oldAnswer = displayValue(oldFaqItem.answer);
      const newAnswer = displayValue(faqItem.answer);
      if (oldAnswer !== newAnswer) {
        changes.push({
          label: `FAQ (${localeLabel}) – Answer ${index + 1}`,
          oldValue: oldAnswer,
          newValue: newAnswer,
        });
      }
    });

    Object.entries(newContent.copy?.[locale] || {}).forEach(([key, newValue]) => {
      const oldValue = oldContent.copy?.[locale]?.[key];
      if (String(oldValue ?? '') !== String(newValue ?? '')) {
        changes.push({
          label: `${localeLabel} ${humanizeFieldName(key)}`,
          oldValue: displayValue(oldValue),
          newValue: displayValue(newValue),
        });
      }
    });
  });

  Object.entries(newContent.mobileRelease || {}).forEach(([key, newValue]) => {
    const oldValue = oldContent.mobileRelease?.[key];
    if (String(oldValue ?? '') !== String(newValue ?? '')) {
      changes.push({
        label: `Mobile App ${humanizeFieldName(key)}`,
        oldValue: displayValue(oldValue),
        newValue: displayValue(newValue),
      });
    }
  });

  return changes;
};

const AutoResizeTextarea = ({ value, onChange, className = '', minHeight = 100, maxHeight = 340, ...props }) => {
  const textareaRef = useRef(null);

  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight]);

  return (
    <textarea
      ref={textareaRef}
      className={`editor-auto-textarea ${className}`.trim()}
      value={value || ''}
      onChange={onChange}
      style={{ minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }}
      {...props}
    />
  );
};

const Field = ({ label, helper, children }) => (
  <label className="editor-field">
    <span className="editor-field-label">{label}</span>
    {children}
    {helper && <span className="editor-field-helper">{helper}</span>}
  </label>
);

const EditorSectionHeading = ({ number, title, description }) => (
  <div className="editor-section-heading">
    <span className="editor-section-number" aria-hidden="true">{number}</span>
    <div>
      <p className="editor-section-kicker">Landing page section</p>
      <h3>{title}</h3>
      {description && <p className="editor-group-description">{description}</p>}
    </div>
  </div>
);

const SectionBlock = ({ id, number, title, children }) => (
  <section id={id} className="editor-card editor-card--wide">
    <EditorSectionHeading number={number} title={title} />
    {children}
  </section>
);

const GroupCard = ({ id, number, title, description, children }) => (
  <section id={id} className="editor-card editor-group-card">
    <EditorSectionHeading number={number} title={title} description={description} />
    <div className="editor-group-fields">{children}</div>
  </section>
);

const LandingContentEditor = forwardRef(function LandingContentEditor({ embedded = false, visualMode = false, onDirtyChange, onActiveSectionChange }, ref) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const { content, setContent, resetContent, defaults, loadingContent } = useLandingContent();
  const [draft, setDraft] = useState(() => {
    const storedDraft = readLandingDraft();
    return isValidLandingDraftShape(storedDraft) ? storedDraft : deepClone(content);
  });
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ open: false, changes: [], onConfirm: null });
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [discardModalOpen, setDiscardModalOpen] = useState(false);
  const [uploadingBannerPhoto, setUploadingBannerPhoto] = useState(null);
  const [replacingBannerPhotoIndex, setReplacingBannerPhotoIndex] = useState(null);
  const [pendingRemovedBannerPaths, setPendingRemovedBannerPaths] = useState([]);
  const [draggedPhotoIndex, setDraggedPhotoIndex] = useState(null);
  const [dragOverPhotoIndex, setDragOverPhotoIndex] = useState(null);
  const bannerPhotoInputRef = useRef(null);
  const bannerPhotoAddInputRef = useRef(null);
  const isFirstContentSync = useRef(true);
  const syncedContentRef = useRef(content);
  const previewSectionRef = useRef(null);
  const contentSectionRef = useRef(null);
  const [activeNavSection, setActiveNavSection] = useState('preview');
  const [pageMode, setPageMode] = useState('view');
  const [selectedEdit, setSelectedEdit] = useState(null);
  const [selectedEditValue, setSelectedEditValue] = useState('');
  const [selectedEditSecondaryValue, setSelectedEditSecondaryValue] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [singleImageUploading, setSingleImageUploading] = useState(false);
  const singleImageInputRef = useRef(null);

  React.useEffect(() => {
    if (isFirstContentSync.current) {
      isFirstContentSync.current = false;
      syncedContentRef.current = content;
      return;
    }

    // Only auto-sync the draft to freshly loaded content (e.g. the initial
    // DB fetch resolving after mount) when the admin has no unsaved edits
    // pending. Otherwise this would silently discard in-progress work, such
    // as banner photos just added but not yet saved.
    setDraft((prevDraft) => {
      const draftMatchesLastSyncedContent =
        JSON.stringify(prevDraft) === JSON.stringify(syncedContentRef.current);
      return draftMatchesLastSyncedContent ? deepClone(content) : prevDraft;
    });
    syncedContentRef.current = content;
  }, [content]);

  const hasChanges = useMemo(() => JSON.stringify(draft) !== JSON.stringify(content), [draft, content]);

  React.useEffect(() => {
    if (hasChanges) {
      writeLandingDraft(draft);
    } else {
      clearLandingDraft();
    }
  }, [hasChanges, draft]);

  React.useEffect(() => {
    onDirtyChange?.(hasChanges || Boolean(selectedEdit));
  }, [hasChanges, onDirtyChange, selectedEdit]);

  React.useEffect(() => {
    onActiveSectionChange?.(activeNavSection);
  }, [activeNavSection, onActiveSectionChange]);

  React.useEffect(() => {
    if (!embedded) return undefined;

    const previewEl = previewSectionRef.current;
    const contentEl = contentSectionRef.current;
    if (!previewEl || !contentEl || typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (mostVisible) {
          setActiveNavSection(mostVisible.target === previewEl ? 'preview' : 'content');
        }
      },
      { rootMargin: '-140px 0px -55% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    observer.observe(previewEl);
    observer.observe(contentEl);
    return () => observer.disconnect();
  }, [embedded]);

  const scrollToNavSection = useCallback((sectionRef, sectionKey) => {
    const section = sectionRef.current;
    if (!section) return;

    const pageHeader = document.querySelector('.announcements-main .page-header');
    const contentToolbar = document.querySelector('.content-management-toolbar');
    const offset = (pageHeader?.getBoundingClientRect().height || 0)
      + (contentToolbar?.getBoundingClientRect().height || 0)
      + 20;
    const top = window.scrollY + section.getBoundingClientRect().top - offset;

    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setActiveNavSection(sectionKey);
  }, []);

  const heroPhotos = Array.isArray(draft.hero.photos) ? draft.hero.photos : [];

  const showTemporaryMessage = useCallback((message) => {
    setSaveMessage(message);
    window.setTimeout(() => setSaveMessage(''), 3000);
  }, []);

  const handlePreviewSectionEdit = useCallback((sectionKey) => {
    if (sectionKey === 'announcements') {
      navigate('/dashboard/announcements');
      return;
    }

    const sectionTargets = {
      hero: 'landing-edit-hero',
      trust: 'landing-edit-trust',
      process: 'landing-edit-process',
      about: 'landing-edit-about',
      contact: 'landing-edit-contact',
      faq: 'landing-edit-faq',
    };
    const target = document.getElementById(sectionTargets[sectionKey]);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [navigate]);

  const performSave = useCallback(async (nextDraft) => {
    // Safety net: if the draft would save with zero banner photos while the
    // last-known saved content had some, and not all of them were explicitly
    // removed by the admin (tracked via pendingRemovedBannerPaths), refuse to
    // save. This guards against ever persisting an accidentally-cleared
    // photo array, whatever the cause.
    const nextPhotos = Array.isArray(nextDraft?.hero?.photos) ? nextDraft.hero.photos : [];
    const previousPhotos = Array.isArray(content?.hero?.photos) ? content.hero.photos : [];
    if (nextPhotos.length === 0 && previousPhotos.length > 0 && pendingRemovedBannerPaths.length < previousPhotos.length) {
      setSaveMessage('Save blocked: banner photos appear to have been cleared unexpectedly. Please reload the page and try again.');
      window.setTimeout(() => setSaveMessage(''), 4000);
      return;
    }

    setSaving(true);
    try {
      const removedPaths = pendingRemovedBannerPaths;
      const { error } = await setContent(nextDraft);
      if (error) {
        setSaveMessage(`Saved locally, but failed to sync to database: ${error}`);
      } else {
        const { error: deleteError } = await deleteBannerPhotoPaths(removedPaths);
        setPendingRemovedBannerPaths([]);
        setSaveMessage(deleteError
          ? `Landing page content saved, but old photo cleanup failed: ${deleteError}`
          : 'Landing page content saved.'
        );
        // Mark the just-saved draft as the source of truth so the content-sync
        // effect doesn't treat it as stale once the context's `content` catches up.
        syncedContentRef.current = nextDraft;
        setDraft(deepClone(nextDraft));
      }
      window.setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  }, [content, pendingRemovedBannerPaths, setContent]);

  useImperativeHandle(ref, () => ({
    scrollToSection: (sectionKey) => {
      scrollToNavSection(
        sectionKey === 'content' ? contentSectionRef : previewSectionRef,
        sectionKey === 'content' ? 'content' : 'preview'
      );
    },
    discardUnsavedChanges: () => {
      clearLandingDraft();
      syncedContentRef.current = content;
      setDraft(deepClone(content));
      setPendingRemovedBannerPaths([]);
      setSelectedEdit(null);
      setSelectedEditValue('');
      setSelectedEditSecondaryValue('');
    },
    hasUnsavedChanges: () => JSON.stringify(draft) !== JSON.stringify(content) || Boolean(selectedEdit),
    saveChanges: async () => {
      const mobileNumber = String(draft?.contact?.mobile || '').trim();
      const normalizedMobileNumber = mobileNumber.replace(/\D/g, '');
      if (mobileNumber && !mobileNumberRegex.test(normalizedMobileNumber)) {
        setSaveMessage('Mobile number must start with 09 and be exactly 11 digits.');
        window.setTimeout(() => setSaveMessage(''), 3000);
        return false;
      }

      const nextDraft = {
        ...draft,
        contact: {
          ...draft.contact,
          mobile: normalizedMobileNumber || mobileNumber,
        },
      };

      await performSave(nextDraft);
      return true;
    }
  }), [content, draft, performSave, scrollToNavSection, selectedEdit]);

  const updateField = (section, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }));
  };

  const updateLocalizedField = (section, field, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        tagalog: {
          ...prev[section].tagalog,
          [field]: value,
        },
      },
    }));
  };

  const updateTrustField = (locale, field, value) => {
    setDraft((prev) => ({
      ...prev,
      trust: {
        ...prev.trust,
        [locale]: {
          ...prev.trust[locale],
          [field]: value,
        },
      },
    }));
  };

  const updateTrustItem = (locale, index, field, value) => {
    setDraft((prev) => ({
      ...prev,
      trust: {
        ...prev.trust,
        [locale]: {
          ...prev.trust[locale],
          items: prev.trust[locale].items.map((item, itemIndex) => (
            itemIndex === index ? { ...item, [field]: value } : item
          )),
        },
      },
    }));
  };

  const updateHeroPhotos = (updater) => {
    setDraft((prev) => {
      const currentPhotos = Array.isArray(prev.hero.photos) ? prev.hero.photos : [];
      const nextPhotos = typeof updater === 'function' ? updater(currentPhotos) : updater;

      return {
        ...prev,
        hero: {
          ...prev.hero,
          photos: nextPhotos.slice(0, MAX_BANNER_PHOTOS),
        },
      };
    });
  };

  const queueBannerPathRemoval = (path) => {
    if (!path) return;
    setPendingRemovedBannerPaths((prev) => (prev.includes(path) ? prev : [...prev, path]));
  };

  const openReplacePhotoPicker = (index) => {
    setReplacingBannerPhotoIndex(index);
    bannerPhotoInputRef.current?.click();
  };

  const handleReplacePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const targetIndex = replacingBannerPhotoIndex;
    setReplacingBannerPhotoIndex(null);
    if (!Number.isInteger(targetIndex)) return;

    setUploadingBannerPhoto(targetIndex);

    const { data, error } = await uploadBannerPhoto({
      adminId: currentUser?.admin_id,
      file,
      position: targetIndex,
    });

    setUploadingBannerPhoto(null);

    if (error) {
      showTemporaryMessage(`Failed to upload banner photo: ${error}`);
      return;
    }

    queueBannerPathRemoval(heroPhotos[targetIndex]?.path);

    updateHeroPhotos((photos) => photos.map((photo, index) => (
      index === targetIndex
        ? { ...data, alt: photo.alt || data.alt }
        : photo
    )));

    showTemporaryMessage('Banner photo replaced. Save changes to publish.');
  };

  const openAddPhotoPicker = () => {
    bannerPhotoAddInputRef.current?.click();
  };

  const handleAddPhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (heroPhotos.length >= MAX_BANNER_PHOTOS) {
      showTemporaryMessage(`Only ${MAX_BANNER_PHOTOS} banner photos are allowed.`);
      return;
    }

    const position = heroPhotos.length;
    setUploadingBannerPhoto('new');

    const { data, error } = await uploadBannerPhoto({
      adminId: currentUser?.admin_id,
      file,
      position,
    });

    setUploadingBannerPhoto(null);

    if (error) {
      showTemporaryMessage(`Failed to upload banner photo: ${error}`);
      return;
    }

    updateHeroPhotos((photos) => [...photos, data]);
    showTemporaryMessage('Banner photo added. Save changes to publish.');
  };

  const updateBannerPhotoAlt = (photoIndex, value) => {
    updateHeroPhotos((photos) => photos.map((photo, index) => (
      index === photoIndex ? { ...photo, alt: value } : photo
    )));
  };

  const reorderBannerPhoto = (fromIndex, toIndex) => {
    updateHeroPhotos((photos) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 || toIndex < 0 ||
        fromIndex >= photos.length || toIndex >= photos.length
      ) return photos;

      const nextPhotos = [...photos];
      const [movedPhoto] = nextPhotos.splice(fromIndex, 1);
      nextPhotos.splice(toIndex, 0, movedPhoto);
      return nextPhotos;
    });
  };

  const moveBannerPhoto = (photoIndex, direction) => {
    reorderBannerPhoto(photoIndex, photoIndex + direction);
  };

  const handlePhotoCardDragStart = (index) => (event) => {
    setDraggedPhotoIndex(index);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handlePhotoCardDragEnd = () => {
    setDraggedPhotoIndex(null);
    setDragOverPhotoIndex(null);
  };

  const handlePhotoCardDragOver = (index) => (event) => {
    event.preventDefault();
    if (draggedPhotoIndex !== null && draggedPhotoIndex !== index) {
      setDragOverPhotoIndex(index);
    }
  };

  const handlePhotoCardDragLeave = (index) => () => {
    setDragOverPhotoIndex((prev) => (prev === index ? null : prev));
  };

  const handlePhotoCardDrop = (index) => (event) => {
    event.preventDefault();
    if (draggedPhotoIndex !== null && draggedPhotoIndex !== index) {
      reorderBannerPhoto(draggedPhotoIndex, index);
    }
    setDraggedPhotoIndex(null);
    setDragOverPhotoIndex(null);
  };

  const deleteBannerPhoto = (photoIndex) => {
    queueBannerPathRemoval(heroPhotos[photoIndex]?.path);
    updateHeroPhotos((photos) => photos.filter((_, index) => index !== photoIndex));
    showTemporaryMessage('Banner photo removed. Save changes to publish.');
  };

  const updateNested = (section, locale, key, value) => {
    setDraft((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [locale]: {
          ...prev[section][locale],
          [key]: value,
        },
      },
    }));
  };

  const updateProcessSectionTitle = (locale, sectionIndex, value) => {
    setDraft((prev) => ({
      ...prev,
      process: {
        ...prev.process,
        [locale]: {
          ...prev.process[locale],
          processSteps: prev.process[locale].processSteps.map((section, index) => (
            index === sectionIndex ? { ...section, title: value } : section
          )),
        },
      },
    }));
  };

  const updateProcessSectionSteps = (locale, sectionIndex, value) => {
    const lines = fromLines(value);
    setDraft((prev) => ({
      ...prev,
      process: {
        ...prev.process,
        [locale]: {
          ...prev.process[locale],
          processSteps: prev.process[locale].processSteps.map((section, index) => (
            index === sectionIndex
              ? { ...section, steps: lines.map((text, stepIndex) => ({ num: stepIndex + 1, text })) }
              : section
          )),
        },
      },
    }));
  };

  const updateFaqQuestion = (locale, faqIndex, value) => {
    setDraft((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        [locale]: {
          ...prev.faq[locale],
          faqs: prev.faq[locale].faqs.map((faqItem, index) => (
            index === faqIndex ? { ...faqItem, question: value } : faqItem
          )),
        },
      },
    }));
  };

  const updateFaqAnswer = (locale, faqIndex, value) => {
    const lines = fromLines(value);
    const parsedAnswer = lines.length <= 1 ? (lines[0] || '') : lines;

    setDraft((prev) => ({
      ...prev,
      faq: {
        ...prev.faq,
        [locale]: {
          ...prev.faq[locale],
          faqs: prev.faq[locale].faqs.map((faqItem, index) => (
            index === faqIndex ? { ...faqItem, answer: parsedAnswer } : faqItem
          )),
        },
      },
    }));
  };

  const openInlineTextEditor = ({ path, label, multiline, lines, secondaryPath, secondaryLabel }) => {
    const currentValue = getValueAtPath(draft, path);
    setSelectedEdit({ path, label, multiline, lines, secondaryPath, secondaryLabel });
    setSelectedEditValue(lines ? toLines(currentValue) : String(currentValue ?? ''));
    setSelectedEditSecondaryValue(secondaryPath ? String(getValueAtPath(draft, secondaryPath) ?? '') : '');
  };

  const applyInlineTextEdit = () => {
    if (!selectedEdit) return;

    let nextValue = selectedEditValue;
    if (selectedEdit.lines) {
      const lines = fromLines(selectedEditValue);
      nextValue = lines.length <= 1 ? (lines[0] || '') : lines;
    }

    setDraft((previous) => {
      const withPrimaryValue = setValueAtPath(previous, selectedEdit.path, nextValue);
      return selectedEdit.secondaryPath
        ? setValueAtPath(withPrimaryValue, selectedEdit.secondaryPath, selectedEditSecondaryValue)
        : withPrimaryValue;
    });
    setSelectedEdit(null);
    setSelectedEditValue('');
    setSelectedEditSecondaryValue('');
  };

  const openInlineImageEditor = ({ path, label }) => {
    setSelectedImage({ path, label });
  };

  const handleSingleImageChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedImage || selectedImage.path === 'hero.photos') return;

    setSingleImageUploading(true);
    const currentImage = getValueAtPath(draft, selectedImage.path);
    const { data, error } = await uploadBannerPhoto({
      adminId: currentUser?.admin_id,
      file,
      position: 0,
    });
    setSingleImageUploading(false);

    if (error) {
      showTemporaryMessage(`Failed to upload image: ${error}`);
      return;
    }

    queueBannerPathRemoval(currentImage?.path);
    setDraft((previous) => setValueAtPath(previous, selectedImage.path, {
      ...data,
      alt: selectedImage.label,
    }));
    setSelectedImage(null);
    showTemporaryMessage('Image updated. Review and save to publish it.');
  };

  const restoreDefaultInlineImage = () => {
    if (!selectedImage || selectedImage.path === 'hero.photos') return;
    const currentImage = getValueAtPath(draft, selectedImage.path);
    queueBannerPathRemoval(currentImage?.path);
    setDraft((previous) => setValueAtPath(previous, selectedImage.path, null));
    setSelectedImage(null);
    showTemporaryMessage('Default image restored. Review and save to publish it.');
  };

  const moveLandingSection = (sectionId, direction) => {
    setDraft((previous) => {
      const sections = [...(previous.layout?.sections || [])];
      const fromIndex = sections.indexOf(sectionId);
      const toIndex = fromIndex + direction;
      if (fromIndex < 0 || toIndex < 0 || toIndex >= sections.length) return previous;
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return {
        ...previous,
        layout: { ...previous.layout, sections },
      };
    });
  };

  const toggleLandingSection = (sectionId) => {
    setDraft((previous) => {
      const hidden = previous.layout?.hidden || [];
      return {
        ...previous,
        layout: {
          ...previous.layout,
          hidden: hidden.includes(sectionId)
            ? hidden.filter((id) => id !== sectionId)
            : [...hidden, sectionId],
        },
      };
    });
  };

  const handleSave = async () => {
    if (saving) {
      return;
    }

    const mobileNumber = String(draft?.contact?.mobile || '').trim();
    const normalizedMobileNumber = mobileNumber.replace(/\D/g, '');
    if (mobileNumber && !mobileNumberRegex.test(normalizedMobileNumber)) {
      setSaveMessage('Mobile number must start with 09 and be exactly 11 digits.');
      window.setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    const nextDraft = {
      ...draft,
      contact: {
        ...draft.contact,
        mobile: normalizedMobileNumber || mobileNumber,
      },
    };

    const changes = getChangedFields(content, nextDraft);
    if (changes.length === 0) {
      return;
    }

    setConfirmModal({
      open: true,
      changes,
      onConfirm: () => performSave(nextDraft),
    });
  };

  const handleDiscard = () => {
    if (!hasChanges) {
      return;
    }
    setDiscardModalOpen(true);
  };

  const confirmDiscard = () => {
    syncedContentRef.current = content;
    setDraft(deepClone(content));
    setPendingRemovedBannerPaths([]);
    setDiscardModalOpen(false);
  };

  const handleResetDefaults = () => {
    if (saving) {
      return;
    }
    setResetModalOpen(true);
  };

  const confirmResetDefaults = async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    try {
      const resetPhotoPaths = [
        ...(Array.isArray(draft.hero.photos) ? draft.hero.photos : []),
        ...Object.values(draft.media || {}).filter(Boolean),
        ...pendingRemovedBannerPaths.map((path) => ({ path })),
      ].map((photo) => photo?.path).filter(Boolean);
      const { error } = await resetContent();
      syncedContentRef.current = defaults;
      setDraft(deepClone(defaults));
      if (error) {
        setSaveMessage(`Defaults reset locally, but failed to sync to database: ${error}`);
      } else {
        await deleteBannerPhotoPaths(resetPhotoPaths);
        setPendingRemovedBannerPaths([]);
        setSaveMessage('Landing page content reset to defaults.');
      }
      window.setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setSaving(false);
      setResetModalOpen(false);
    }
  };

  if (visualMode) {
    const selectedImageValue = selectedImage?.path && selectedImage.path !== 'hero.photos'
      ? getValueAtPath(draft, selectedImage.path)
      : null;

    return (
      <div className="landing-editor-embedded landing-visual-editor">
        <div className="landing-editor-visual-toolbar">
          <div className="landing-editor-visual-toolbar-copy">
            <button
              type="button"
              className="landing-editor-back-button"
              onClick={() => navigate('/dashboard/announcements')}
              aria-label="Back to Content Management"
              title="Back to Content Management"
            >
              <FiArrowLeft aria-hidden="true" />
            </button>
            <div>
              <h2>Landing Page</h2>
              <p>{pageMode === 'edit' ? 'Select any outlined text or image to edit it.' : 'Viewing the current landing page inside the admin account.'}</p>
            </div>
            {hasChanges && <span className="landing-editor-unsaved-badge">Unpublished changes</span>}
          </div>

          <div className="landing-editor-mode-switch" role="group" aria-label="Landing page mode">
            <button type="button" className={pageMode === 'view' ? 'is-active' : ''} onClick={() => setPageMode('view')} aria-pressed={pageMode === 'view'}>
              <FiEye aria-hidden="true" /> View Mode
            </button>
            <button type="button" className={pageMode === 'edit' ? 'is-active' : ''} onClick={() => setPageMode('edit')} aria-pressed={pageMode === 'edit'}>
              <FiEdit3 aria-hidden="true" /> Edit Mode
            </button>
          </div>

          <div className="landing-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>Discard</button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>Reset</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Review and save'}
            </button>
          </div>
        </div>

        {loadingContent && <div className="landing-editor-alert">Loading latest landing content...</div>}
        <ToastMessage message={saveMessage} type={/fail|error|unable/i.test(saveMessage || '') ? 'error' : 'success'} />

        <input ref={bannerPhotoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="banner-photo-file-input" onChange={handleReplacePhotoChange} />
        <input ref={bannerPhotoAddInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="banner-photo-file-input" onChange={handleAddPhotoChange} />
        <input ref={singleImageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="banner-photo-file-input" onChange={handleSingleImageChange} />

        <LandingPreview
          content={draft}
          editorMode={pageMode === 'edit'}
          onEditItem={openInlineTextEditor}
          onEditImage={openInlineImageEditor}
          onMoveSection={moveLandingSection}
          onToggleSection={toggleLandingSection}
          onManageSection={() => navigate('/dashboard/announcements')}
        />

        {selectedEdit && (
          <div className="modal-overlay landing-inline-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="landing-inline-edit-title">
            <form className="landing-inline-edit-modal" onSubmit={(event) => { event.preventDefault(); applyInlineTextEdit(); }}>
              <div className="landing-inline-edit-header">
                <div>
                  <span>Edit landing page content</span>
                  <h3 id="landing-inline-edit-title">{selectedEdit.label}</h3>
                </div>
                <button type="button" onClick={() => setSelectedEdit(null)} aria-label="Close editor"><FiX aria-hidden="true" /></button>
              </div>
              <label>
                <span>{selectedEdit.lines ? 'Enter one item per line' : 'Content'}</span>
                {selectedEdit.multiline || selectedEdit.lines ? (
                  <textarea autoFocus rows={selectedEdit.lines ? 8 : 5} value={selectedEditValue} onChange={(event) => setSelectedEditValue(event.target.value)} />
                ) : (
                  <input autoFocus type="text" value={selectedEditValue} onChange={(event) => setSelectedEditValue(event.target.value)} />
                )}
              </label>
              {selectedEdit.secondaryPath && (
                <label>
                  <span>{selectedEdit.secondaryLabel}</span>
                  <input type="url" value={selectedEditSecondaryValue} onChange={(event) => setSelectedEditSecondaryValue(event.target.value)} required />
                </label>
              )}
              <div className="landing-inline-edit-actions">
                <button type="button" className="cancel-btn" onClick={() => setSelectedEdit(null)}>Cancel</button>
                <button type="submit" className="save-btn">Apply to draft</button>
              </div>
            </form>
          </div>
        )}

        {selectedImage && selectedImage.path !== 'hero.photos' && (
          <div className="modal-overlay landing-inline-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="landing-image-edit-title">
            <div className="landing-inline-edit-modal">
              <div className="landing-inline-edit-header">
                <div>
                  <span>Edit landing page image</span>
                  <h3 id="landing-image-edit-title">{selectedImage.label}</h3>
                </div>
                <button type="button" onClick={() => setSelectedImage(null)} aria-label="Close image editor"><FiX aria-hidden="true" /></button>
              </div>
              {selectedImageValue?.url && <img className="landing-inline-image-preview" src={selectedImageValue.url} alt={selectedImage.label} />}
              <p className="landing-inline-image-help">Upload a JPG, PNG, or WebP image. It will remain unpublished until the landing page is saved.</p>
              <div className="landing-inline-edit-actions">
                <button type="button" className="cancel-btn" onClick={() => setSelectedImage(null)}>Cancel</button>
                {selectedImageValue?.url && <button type="button" className="cancel-btn" onClick={restoreDefaultInlineImage}>Use default image</button>}
                <button type="button" className="save-btn" onClick={() => singleImageInputRef.current?.click()} disabled={singleImageUploading}>
                  <FiImage aria-hidden="true" /> {singleImageUploading ? 'Uploading...' : 'Choose replacement'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedImage?.path === 'hero.photos' && (
          <div className="modal-overlay landing-inline-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="landing-banner-edit-title">
            <div className="landing-inline-edit-modal landing-banner-inline-modal">
              <div className="landing-inline-edit-header">
                <div>
                  <span>Edit landing page images</span>
                  <h3 id="landing-banner-edit-title">Main banner photos</h3>
                </div>
                <button type="button" onClick={() => setSelectedImage(null)} aria-label="Close banner editor"><FiX aria-hidden="true" /></button>
              </div>
              <div className="landing-inline-banner-list">
                {heroPhotos.map((photo, index) => (
                  <article key={photo.id || photo.url}>
                    <img src={photo.url} alt={photo.alt || `Main banner photo ${index + 1}`} />
                    <label>
                      <span>Photo description</span>
                      <input value={photo.alt || ''} onChange={(event) => updateBannerPhotoAlt(index, event.target.value)} />
                    </label>
                    <div>
                      <button type="button" onClick={() => moveBannerPhoto(index, -1)} disabled={index === 0} aria-label="Move photo earlier"><FiArrowUp aria-hidden="true" /></button>
                      <button type="button" onClick={() => moveBannerPhoto(index, 1)} disabled={index === heroPhotos.length - 1} aria-label="Move photo later"><FiArrowDown aria-hidden="true" /></button>
                      <button type="button" onClick={() => openReplacePhotoPicker(index)} disabled={uploadingBannerPhoto !== null} aria-label="Replace photo"><FiRefreshCw aria-hidden="true" /></button>
                      <button type="button" onClick={() => deleteBannerPhoto(index)} disabled={uploadingBannerPhoto !== null} aria-label="Delete photo"><FiTrash2 aria-hidden="true" /></button>
                    </div>
                  </article>
                ))}
                {heroPhotos.length < MAX_BANNER_PHOTOS && (
                  <button type="button" className="landing-inline-add-image" onClick={openAddPhotoPicker} disabled={uploadingBannerPhoto !== null}>
                    <FiPlus aria-hidden="true" /> {uploadingBannerPhoto === 'new' ? 'Uploading...' : 'Add banner photo'}
                  </button>
                )}
              </div>
              <div className="landing-inline-edit-actions">
                <button type="button" className="save-btn" onClick={() => setSelectedImage(null)}>Done</button>
              </div>
            </div>
          </div>
        )}

        {confirmModal.open && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal confirm-changes-modal">
              <h3>Confirm Changes</h3>
              <p>Are you sure you want to publish these landing-page changes?</p>
              <div className="confirm-changes-table">
                <div className="confirm-changes-table-header"><span className="confirm-changes-col-heading confirm-changes-col-heading--before">Before</span><span className="confirm-changes-col-heading confirm-changes-col-heading--after">After</span></div>
                {confirmModal.changes.map((change) => (
                  <div className="confirm-changes-row" key={change.label}>
                    <div className="confirm-changes-col confirm-changes-col--before"><span className="confirm-changes-field-name">{change.label}</span><span className="confirm-changes-value">{change.oldValue}</span></div>
                    <div className="confirm-changes-col confirm-changes-col--after"><span className="confirm-changes-field-name">{change.label}</span><span className="confirm-changes-value">{change.newValue}</span></div>
                  </div>
                ))}
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setConfirmModal({ open: false, changes: [], onConfirm: null })}>Cancel</button>
                <button type="button" className="save-btn" onClick={() => { const { onConfirm } = confirmModal; setConfirmModal({ open: false, changes: [], onConfirm: null }); onConfirm?.(); }}>Publish Changes</button>
              </div>
            </div>
          </div>
        )}

        {resetModalOpen && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resetDefaultsTitle" aria-describedby="resetDefaultsMessage">
            <div className="modal reset-defaults-modal">
              <div className="reset-defaults-icon" aria-hidden="true">!</div>
              <h3 id="resetDefaultsTitle" className="reset-defaults-title">Reset Landing Page to Defaults?</h3>
              <p id="resetDefaultsMessage" className="reset-defaults-message">This will replace all currently saved landing-page content and structure with the default values. This action cannot be undone.</p>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setResetModalOpen(false)} disabled={saving}>Cancel</button>
                <button type="button" className="save-btn" onClick={confirmResetDefaults} disabled={saving}>{saving ? 'Working...' : 'Reset Defaults'}</button>
              </div>
            </div>
          </div>
        )}

        {discardModalOpen && (
          <div className="modal-overlay app-unsaved-overlay" role="dialog" aria-modal="true" aria-labelledby="discardChangesTitle" aria-describedby="discardChangesMessage">
            <div className="modal reset-defaults-modal app-unsaved-dialog">
              <div className="reset-defaults-icon app-unsaved-icon" aria-hidden="true">!</div>
              <h3 id="discardChangesTitle" className="reset-defaults-title app-unsaved-title">Discard Unsaved Changes?</h3>
              <p id="discardChangesMessage" className="reset-defaults-message app-unsaved-message">Your unsaved landing-page changes will be removed and the last published page will be restored.</p>
              <div className="modal-actions app-unsaved-actions">
                <button type="button" className="cancel-btn app-unsaved-button app-unsaved-button--cancel" onClick={() => setDiscardModalOpen(false)}>Cancel</button>
                <button type="button" className="save-btn app-unsaved-button app-unsaved-button--discard" onClick={confirmDiscard}>Discard Changes</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const editorContent = (
    <>
      {visualMode && (
        <div className="landing-editor-visual-toolbar">
          <div className="landing-editor-visual-toolbar-copy">
            <button
              type="button"
              className="landing-editor-back-button"
              onClick={() => navigate('/dashboard/announcements?tab=landing')}
            >
              <FiArrowLeft aria-hidden="true" />
              <span>Content Management</span>
            </button>
            <div>
              <h2>Landing Page Edit Mode</h2>
              <p>Changes remain private until you review and save them.</p>
            </div>
            {hasChanges && <span className="landing-editor-unsaved-badge">Unpublished changes</span>}
          </div>
          <div className="landing-editor-actions">
            <a className="btn btn-outline landing-editor-public-link" href="/" target="_blank" rel="noreferrer">
              <FiExternalLink aria-hidden="true" />
              <span>View public page</span>
            </a>
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>
              {saving ? 'Working...' : 'Reset defaults'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Review and save'}
            </button>
          </div>
        </div>
      )}

      {loadingContent && (
        <div className="landing-editor-alert">Loading latest landing content...</div>
      )}

      <div id="landing-section-preview" ref={previewSectionRef} className="landing-section-anchor">
        <LandingPreview
          content={draft}
          editorMode={visualMode}
          onEditSection={handlePreviewSectionEdit}
        />
      </div>

      <div id="landing-section-content" ref={contentSectionRef} className="landing-section-anchor">
      {!embedded && !visualMode && (
        <div className="landing-editor-toolbar">
          <div className="landing-editor-toolbar-info">
            <p>Edit the text shown on your public landing page.</p>
            {hasChanges && (
              <span className="landing-editor-unsaved-badge">Unsaved changes</span>
            )}
          </div>
          <div className="landing-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>
              {saving ? 'Working...' : 'Reset defaults'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {embedded && !visualMode && (
        <div className="landing-editor-compact-toolbar">
          <div>
            <h3>
              Landing Page Content
              {hasChanges && (
                <span className="landing-editor-unsaved-badge">Unsaved changes</span>
              )}
            </h3>
            <p>Edit the public landing page sections.</p>
          </div>
          <div className="landing-editor-actions">
            <button type="button" className="btn btn-secondary" onClick={handleDiscard} disabled={!hasChanges || saving}>
              Discard changes
            </button>
            <button type="button" className="btn btn-danger" onClick={handleResetDefaults} disabled={saving}>
              {saving ? 'Working...' : 'Reset defaults'}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!hasChanges || saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      <ToastMessage
        message={saveMessage}
        type={/fail|error|unable/i.test(saveMessage || '') ? 'error' : 'success'}
      />

      <div className="landing-editor-groups">
        <GroupCard
          id="landing-edit-hero"
          number="01"
          title="Main Banner"
          description="The large banner visitors see first at the top of the landing page."
        >
          <Field
            label="Main Page Title"
            helper="The large headline shown at the very top of the public landing page."
          >
            <input type="text" value={draft.hero.title} onChange={(e) => updateField('hero', 'title', e.target.value)} />
          </Field>
          <Field
            label="Welcome Message"
            helper="A short line of text shown right under the main page title."
          >
            <input type="text" value={draft.hero.lead} onChange={(e) => updateField('hero', 'lead', e.target.value)} />
          </Field>
          <Field
            label="Supporting Description"
            helper="A longer sentence shown below the welcome message, explaining what the site offers."
          >
            <AutoResizeTextarea minHeight={110} maxHeight={300} value={draft.hero.description} onChange={(e) => updateField('hero', 'description', e.target.value)} />
          </Field>

          <div className="sub-editor">
            <h3>Filipino translation</h3>
            <Field label="Main Page Title (Filipino)">
              <input type="text" value={draft.hero.tagalog.title} onChange={(e) => updateLocalizedField('hero', 'title', e.target.value)} />
            </Field>
            <Field label="Welcome Message (Filipino)">
              <input type="text" value={draft.hero.tagalog.lead} onChange={(e) => updateLocalizedField('hero', 'lead', e.target.value)} />
            </Field>
            <Field label="Supporting Description (Filipino)">
              <AutoResizeTextarea minHeight={110} maxHeight={300} value={draft.hero.tagalog.description} onChange={(e) => updateLocalizedField('hero', 'description', e.target.value)} />
            </Field>
          </div>

          <div className="banner-photo-manager">
            <input
              ref={bannerPhotoInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="banner-photo-file-input"
              onChange={handleReplacePhotoChange}
            />
            <input
              ref={bannerPhotoAddInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="banner-photo-file-input"
              onChange={handleAddPhotoChange}
            />

            <div className="banner-photo-manager-header">
              <div>
                <span className="editor-field-label">Main Banner Photos</span>
                <p className="editor-field-helper">
                  {MAX_BANNER_PHOTOS} photo slots. Drag a card to reorder it — the order below is the public carousel order.
                </p>
              </div>
            </div>

            <div className="banner-photo-grid" aria-label="Main banner photo order">
              {Array.from({ length: MAX_BANNER_PHOTOS }).map((_, index) => {
                const photo = heroPhotos[index];

                if (!photo) {
                  return (
                    <div key={`empty-slot-${index}`} className="banner-photo-card banner-photo-card--empty">
                      <button
                        type="button"
                        className="banner-photo-add-slot-btn"
                        onClick={openAddPhotoPicker}
                        disabled={uploadingBannerPhoto !== null}
                      >
                        {uploadingBannerPhoto === 'new' && index === heroPhotos.length ? (
                          <span className="banner-photo-add-slot-label">Uploading...</span>
                        ) : (
                          <>
                            <FiPlus aria-hidden="true" className="banner-photo-add-slot-icon" />
                            <span className="banner-photo-add-slot-label">Add Photo</span>
                          </>
                        )}
                      </button>
                      <span className="banner-photo-number banner-photo-number--empty">{index + 1}</span>
                    </div>
                  );
                }

                const isUploadingThisPhoto = uploadingBannerPhoto === index;

                return (
                  <div
                    key={photo.id}
                    className={`banner-photo-card${draggedPhotoIndex === index ? ' is-dragging' : ''}${dragOverPhotoIndex === index ? ' is-drag-over' : ''}`}
                    onDragOver={handlePhotoCardDragOver(index)}
                    onDragLeave={handlePhotoCardDragLeave(index)}
                    onDrop={handlePhotoCardDrop(index)}
                  >
                    <div className="banner-photo-thumb-wrap">
                      <span
                        className="banner-photo-drag-handle"
                        draggable
                        onDragStart={handlePhotoCardDragStart(index)}
                        onDragEnd={handlePhotoCardDragEnd}
                        aria-label={`Drag to reorder banner photo ${index + 1}`}
                        title="Drag to reorder"
                      >
                        <FiMove aria-hidden="true" />
                      </span>
                      <span className="banner-photo-number">{index + 1}</span>
                      <img src={photo.url} alt={photo.alt || `Main banner photo ${index + 1}`} className="banner-photo-thumb" loading="lazy" />
                      {isUploadingThisPhoto && (
                        <div className="banner-photo-uploading-overlay">Uploading replacement...</div>
                      )}
                    </div>

                    <label className="banner-photo-alt-field">
                      <span>Alt text</span>
                      <input
                        type="text"
                        value={photo.alt || ''}
                        onChange={(event) => updateBannerPhotoAlt(index, event.target.value)}
                        placeholder={`Main banner photo ${index + 1}`}
                        maxLength={140}
                      />
                    </label>

                    <div className="banner-photo-actions">
                      <button
                        type="button"
                        className="banner-photo-icon-btn"
                        onClick={() => moveBannerPhoto(index, -1)}
                        disabled={index === 0 || uploadingBannerPhoto !== null}
                        aria-label={`Move banner photo ${index + 1} earlier`}
                        title="Move earlier"
                      >
                        <FiArrowUp aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="banner-photo-icon-btn"
                        onClick={() => moveBannerPhoto(index, 1)}
                        disabled={index === heroPhotos.length - 1 || uploadingBannerPhoto !== null}
                        aria-label={`Move banner photo ${index + 1} later`}
                        title="Move later"
                      >
                        <FiArrowDown aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="banner-photo-icon-btn"
                        onClick={() => openReplacePhotoPicker(index)}
                        disabled={uploadingBannerPhoto !== null}
                        aria-label={`Replace banner photo ${index + 1}`}
                        title="Replace"
                      >
                        <FiRefreshCw aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="banner-photo-icon-btn banner-photo-icon-btn--danger"
                        onClick={() => deleteBannerPhoto(index)}
                        disabled={uploadingBannerPhoto !== null}
                        aria-label={`Delete banner photo ${index + 1}`}
                        title="Delete"
                      >
                        <FiTrash2 aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </GroupCard>

        <GroupCard
          id="landing-edit-about"
          number="02"
          title="About Us"
          description="Tells visitors who you are and what your organization does."
        >
          <Field
            label="Section Heading"
            helper='The title shown above the About Us section (e.g. "About Us").'
          >
            <input type="text" value={draft.about.title} onChange={(e) => updateField('about', 'title', e.target.value)} />
          </Field>
          <Field
            label="About Us Description"
            helper="The main paragraph that introduces your organization to visitors."
          >
            <AutoResizeTextarea minHeight={160} maxHeight={380} value={draft.about.intro} onChange={(e) => updateField('about', 'intro', e.target.value)} />
          </Field>
          <div className="sub-editor">
            <h3>Filipino translation</h3>
            <Field label="Section Heading (Filipino)">
              <input type="text" value={draft.about.tagalog.title} onChange={(e) => updateLocalizedField('about', 'title', e.target.value)} />
            </Field>
            <Field label="About Us Description (Filipino)">
              <AutoResizeTextarea minHeight={160} maxHeight={380} value={draft.about.tagalog.intro} onChange={(e) => updateLocalizedField('about', 'intro', e.target.value)} />
            </Field>
          </div>
        </GroupCard>

        <GroupCard
          id="landing-edit-mission"
          number="03"
          title="Mission"
          description="The official Mission and Vision cards shown unchanged in both language modes."
        >
          <Field
            label="Mission Title"
            helper="The heading shown on the Mission card."
          >
            <input type="text" value={draft.about.missionTitle} onChange={(e) => updateField('about', 'missionTitle', e.target.value)} />
          </Field>
          <Field
            label="Mission Description"
            helper="The text shown underneath the Mission title."
          >
            <AutoResizeTextarea minHeight={110} maxHeight={280} value={draft.about.missionText} onChange={(e) => updateField('about', 'missionText', e.target.value)} />
          </Field>
          <Field
            label="Vision Title"
            helper="The heading shown on the Vision card."
          >
            <input type="text" value={draft.about.visionTitle} onChange={(e) => updateField('about', 'visionTitle', e.target.value)} />
          </Field>
          <Field
            label="Vision Description"
            helper="The text shown underneath the Vision title."
          >
            <AutoResizeTextarea minHeight={90} maxHeight={240} value={draft.about.visionText} onChange={(e) => updateField('about', 'visionText', e.target.value)} />
          </Field>
        </GroupCard>

        <GroupCard
          id="landing-edit-contact"
          number="04"
          title="Contact Information"
          description="How visitors can reach or find your station, shown in the Contact section."
        >
          <Field
            label="Section Heading"
            helper="The title shown above the Contact Information section."
          >
            <input type="text" value={draft.contact.title} onChange={(e) => updateField('contact', 'title', e.target.value)} />
          </Field>
          <Field
            label="Emergency Hotline Title"
            helper="The label shown above the emergency contact numbers."
          >
            <input type="text" value={draft.contact.emergencyTitle} onChange={(e) => updateField('contact', 'emergencyTitle', e.target.value)} />
          </Field>
          <Field
            label="Landline Number 1"
            helper="The first landline number shown on the public page."
          >
            <input type="text" value={draft.contact.landlinePrimary} onChange={(e) => updateField('contact', 'landlinePrimary', e.target.value)} />
          </Field>
          <Field
            label="Landline Number 2"
            helper="The second landline number shown on the public page."
          >
            <input type="text" value={draft.contact.landlineSecondary} onChange={(e) => updateField('contact', 'landlineSecondary', e.target.value)} />
          </Field>
          <Field
            label="Mobile Number"
            helper="Must start with 09 and be exactly 11 digits (e.g. 09XXXXXXXXX)."
          >
            <input
              type="text"
              value={draft.contact.mobile}
              onChange={(e) => updateField('contact', 'mobile', e.target.value)}
              placeholder="09XXXXXXXXX"
              pattern="^09[0-9]{9}$"
              maxLength={11}
              inputMode="numeric"
              title="Must start with 09 and be exactly 11 digits"
            />
          </Field>
          <Field
            label="Email Address"
            helper="The email address shown for visitors to contact you."
          >
            <input type="text" value={draft.contact.email} onChange={(e) => updateField('contact', 'email', e.target.value)} />
          </Field>
          <Field
            label="Facebook Page Name"
            helper="The name displayed for your Facebook page link."
          >
            <input type="text" value={draft.contact.facebookLabel} onChange={(e) => updateField('contact', 'facebookLabel', e.target.value)} />
          </Field>
          <Field
            label="Facebook Page Link"
            helper="The full web address (URL) of your Facebook page."
          >
            <input type="text" value={draft.contact.facebookUrl} onChange={(e) => updateField('contact', 'facebookUrl', e.target.value)} />
          </Field>
          <div className="sub-editor">
            <h3>Filipino translation</h3>
            <Field label="Section Heading (Filipino)">
              <input type="text" value={draft.contact.tagalog.title} onChange={(e) => updateLocalizedField('contact', 'title', e.target.value)} />
            </Field>
            <Field label="Emergency Hotline Title (Filipino)">
              <input type="text" value={draft.contact.tagalog.emergencyTitle} onChange={(e) => updateLocalizedField('contact', 'emergencyTitle', e.target.value)} />
            </Field>
          </div>
        </GroupCard>
      </div>

      <div className="landing-editor-grid">
        <SectionBlock id="landing-edit-process" number="05" title="Process Section (English)">
          <Field label="Section title">
            <input type="text" value={draft.process.english.title} onChange={(e) => updateNested('process', 'english', 'title', e.target.value)} />
          </Field>
          {draft.process.english.processSteps.map((section, index) => (
            <div key={`process-en-${index}`} className="sub-editor">
              <Field label={`Column title ${index + 1}`}>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateProcessSectionTitle('english', index, e.target.value)}
                />
              </Field>
              <Field label="Steps (one line per step)">
                <AutoResizeTextarea
                  minHeight={120}
                  maxHeight={320}
                  value={(section.steps || []).map((step) => step.text).join('\n')}
                  onChange={(e) => updateProcessSectionSteps('english', index, e.target.value)}
                />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock id="landing-edit-process-filipino" number="06" title="Process Section (Filipino)">
          <Field label="Section title">
            <input type="text" value={draft.process.tagalog.title} onChange={(e) => updateNested('process', 'tagalog', 'title', e.target.value)} />
          </Field>
          {draft.process.tagalog.processSteps.map((section, index) => (
            <div key={`process-tl-${index}`} className="sub-editor">
              <Field label={`Column title ${index + 1}`}>
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => updateProcessSectionTitle('tagalog', index, e.target.value)}
                />
              </Field>
              <Field label="Steps (one line per step)">
                <AutoResizeTextarea
                  minHeight={120}
                  maxHeight={320}
                  value={(section.steps || []).map((step) => step.text).join('\n')}
                  onChange={(e) => updateProcessSectionSteps('tagalog', index, e.target.value)}
                />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock id="landing-edit-faq" number="07" title="FAQ Section (English)">
          <Field label="Section title">
            <input type="text" value={draft.faq.english.title} onChange={(e) => updateNested('faq', 'english', 'title', e.target.value)} />
          </Field>
          {draft.faq.english.faqs.map((faqItem, index) => (
            <div key={`faq-en-${index}`} className="sub-editor">
              <Field label={`Question ${index + 1}`}>
                <input type="text" value={faqItem.question} onChange={(e) => updateFaqQuestion('english', index, e.target.value)} />
              </Field>
              <Field label="Answer (single paragraph or one line per bullet)">
                <AutoResizeTextarea minHeight={120} maxHeight={320} value={toLines(faqItem.answer)} onChange={(e) => updateFaqAnswer('english', index, e.target.value)} />
              </Field>
            </div>
          ))}
        </SectionBlock>

        <SectionBlock id="landing-edit-faq-filipino" number="08" title="FAQ Section (Filipino)">
          <Field label="Section title">
            <input type="text" value={draft.faq.tagalog.title} onChange={(e) => updateNested('faq', 'tagalog', 'title', e.target.value)} />
          </Field>
          {draft.faq.tagalog.faqs.map((faqItem, index) => (
            <div key={`faq-tl-${index}`} className="sub-editor">
              <Field label={`Question ${index + 1}`}>
                <input type="text" value={faqItem.question} onChange={(e) => updateFaqQuestion('tagalog', index, e.target.value)} />
              </Field>
              <Field label="Answer (single paragraph or one line per bullet)">
                <AutoResizeTextarea minHeight={120} maxHeight={320} value={toLines(faqItem.answer)} onChange={(e) => updateFaqAnswer('tagalog', index, e.target.value)} />
              </Field>
            </div>
          ))}
        </SectionBlock>

        {['english', 'tagalog'].map((locale, localeIndex) => (
          <SectionBlock
            key={`trust-${locale}`}
            id={locale === 'english' ? 'landing-edit-trust' : 'landing-edit-trust-filipino'}
            number={String(9 + localeIndex).padStart(2, '0')}
            title={`Trust and Accessibility (${locale === 'english' ? 'English' : 'Filipino'})`}
          >
            <Field label="Eyebrow">
              <input type="text" value={draft.trust[locale].eyebrow} onChange={(e) => updateTrustField(locale, 'eyebrow', e.target.value)} />
            </Field>
            <Field label="Section title">
              <input type="text" value={draft.trust[locale].title} onChange={(e) => updateTrustField(locale, 'title', e.target.value)} />
            </Field>
            <Field label="Introduction">
              <AutoResizeTextarea minHeight={100} maxHeight={240} value={draft.trust[locale].intro} onChange={(e) => updateTrustField(locale, 'intro', e.target.value)} />
            </Field>
            {draft.trust[locale].items.map((item, index) => (
              <div key={`trust-${locale}-${index}`} className="sub-editor">
                <Field label={`Trust item ${index + 1} title`}>
                  <input type="text" value={item.title} onChange={(e) => updateTrustItem(locale, index, 'title', e.target.value)} />
                </Field>
                <Field label={`Trust item ${index + 1} description`}>
                  <AutoResizeTextarea minHeight={90} maxHeight={220} value={item.text} onChange={(e) => updateTrustItem(locale, index, 'text', e.target.value)} />
                </Field>
              </div>
            ))}
          </SectionBlock>
        ))}
      </div>
      </div>

      {confirmModal.open && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal confirm-changes-modal">
            <h3>Confirm Changes</h3>
            <p>Are you sure you want to save these changes?</p>
            <div className="confirm-changes-table">
              <div className="confirm-changes-table-header">
                <span className="confirm-changes-col-heading confirm-changes-col-heading--before">Before</span>
                <span className="confirm-changes-col-heading confirm-changes-col-heading--after">After</span>
              </div>
              {confirmModal.changes.map((change) => (
                <div className="confirm-changes-row" key={change.label}>
                  <div className="confirm-changes-col confirm-changes-col--before">
                    <span className="confirm-changes-field-name">{change.label}</span>
                    <span className="confirm-changes-value">{change.oldValue}</span>
                  </div>
                  <div className="confirm-changes-col confirm-changes-col--after">
                    <span className="confirm-changes-field-name">{change.label}</span>
                    <span className="confirm-changes-value">{change.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setConfirmModal({ open: false, changes: [], onConfirm: null })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={() => {
                  const { onConfirm } = confirmModal;
                  setConfirmModal({ open: false, changes: [], onConfirm: null });
                  onConfirm?.();
                }}
              >
                Confirm Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {resetModalOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="resetDefaultsTitle" aria-describedby="resetDefaultsMessage">
          <div className="modal reset-defaults-modal">
            <div className="reset-defaults-icon" aria-hidden="true">!</div>
            <h3 id="resetDefaultsTitle" className="reset-defaults-title">Reset Landing Page to Defaults?</h3>
            <p id="resetDefaultsMessage" className="reset-defaults-message">
              This will replace all currently saved landing-page content with the default values. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setResetModalOpen(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn"
                onClick={confirmResetDefaults}
                disabled={saving}
              >
                {saving ? 'Working...' : 'Reset Defaults'}
              </button>
            </div>
          </div>
        </div>
      )}

      {discardModalOpen && (
        <div className="modal-overlay app-unsaved-overlay" role="dialog" aria-modal="true" aria-labelledby="discardChangesTitle" aria-describedby="discardChangesMessage">
          <div className="modal reset-defaults-modal app-unsaved-dialog">
            <div className="reset-defaults-icon app-unsaved-icon" aria-hidden="true">!</div>
            <h3 id="discardChangesTitle" className="reset-defaults-title app-unsaved-title">Discard Unsaved Changes?</h3>
            <p id="discardChangesMessage" className="reset-defaults-message app-unsaved-message">
              Your unsaved landing-page changes will be removed and the last saved content will be restored. This action cannot be undone.
            </p>
            <div className="modal-actions app-unsaved-actions">
              <button
                type="button"
                className="cancel-btn app-unsaved-button app-unsaved-button--cancel"
                onClick={() => setDiscardModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="save-btn app-unsaved-button app-unsaved-button--discard"
                onClick={confirmDiscard}
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="landing-editor-embedded">{editorContent}</div>;
  }

  return (
    <div className="landing-editor-page">
      <Sidebar />
      <div className="landing-editor-main">
        <PageHeader title="Landing Content" searchQuery={searchQuery} onSearchChange={setSearchQuery} />
        {editorContent}
      </div>
    </div>
  );
});

export default LandingContentEditor;
