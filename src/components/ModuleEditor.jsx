import React, { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import MetadataEditor from './MetadataEditors/MetadataEditor';
import FireClassDetailsEditor from './MetadataEditors/FireClassDetailsEditor';
import LearningMaterialsTextEditor from './MetadataEditors/LearningMaterialsTextEditor';
import MediaAssetEditor from './MetadataEditors/MediaAssetEditor';
import {
  BilingualGrid,
  EditorField,
  EditorItemCard,
  EditorSection
} from './EditorUI/ModuleEditorUI';
import './ModuleEditor.css';

const HIDDEN_BLOCK_LIMITS = {
  2: { 1: 20, 2: 17, 3: 11 },
  3: { 1: 20, 2: 30, 3: 40 },
  4: { 1: 20, 2: 22, 3: 21 },
  5: { 1: 19, 2: 19, 3: 19 }
};

const formatCount = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));

const shouldShowBlock = (moduleNo, pageNo, blockNo) => {
  const hiddenLimit = HIDDEN_BLOCK_LIMITS[moduleNo]?.[pageNo];
  return !(hiddenLimit && blockNo >= 1 && blockNo <= hiddenLimit);
};

const isReadingProgressBlock = (block) => {
  const blockType = String(block?.block_type || '').trim().toLowerCase();
  const blockKey = String(block?.block_key || '').trim().toLowerCase();
  return blockType === 'reading_progress' || blockKey.endsWith('reading_progress');
};

export default function ModuleEditor({
  moduleEntry,
  editedModule,
  setEditedModule,
  moduleOptions,
  onSelectModule,
  currentPages,
  handlePageChange,
  fireGuides,
  fireClassDetails,
  learningTexts,
  mediaAssets,
  setFireGuides,
  setFireClassDetails,
  setLearningTexts,
  setMediaAssets,
  handleSaveModule,
  saving
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const activeModule = moduleEntry;
  const totalPages = activeModule.pages.length;
  const currentPageIndex = Math.min(
    currentPages[moduleEntry.module_no] ?? 0,
    Math.max(totalPages - 1, 0)
  );
  const page = activeModule.pages[currentPageIndex] || null;
  const editedPage = editedModule.pages.find((entry) => entry.page_no === page?.page_no);
  const pageTexts = learningTexts.filter(
    (text) => text.module_no === moduleEntry.module_no && text.page_no === page?.page_no
  );
  const pageMedia = mediaAssets.filter(
    (asset) => asset.module_no === moduleEntry.module_no && asset.page_no === page?.page_no
  );
  const visibleBlocks = page
    ? page.blocks.filter((block) =>
        !isReadingProgressBlock(block) &&
        shouldShowBlock(moduleEntry.module_no, page.page_no, block.block_no)
      )
    : [];

  const updateModuleField = (field, value) => {
    setEditedModule({ ...editedModule, [field]: value });
  };

  const updatePageField = (pageNo, field, value) => {
    setEditedModule({
      ...editedModule,
      pages: editedModule.pages.map((entry) =>
        entry.page_no === pageNo ? { ...entry, [field]: value } : entry
      )
    });
  };

  const updateBlockField = (pageNo, blockId, field, value) => {
    setEditedModule({
      ...editedModule,
      pages: editedModule.pages.map((entry) => {
        if (entry.page_no !== pageNo) return entry;
        return {
          ...entry,
          blocks: entry.blocks.map((block) =>
            block.id === blockId ? { ...block, [field]: value } : block
          )
        };
      })
    });
  };

  const uploadMedia = async (asset, file) => {
    if (!file) return;

    const extension = file.name.split('.').pop();
    const path = `${asset.module_no}/${asset.asset_key}.${extension}`;
    const { error } = await supabase.storage
      .from('learning-materials')
      .upload(path, file, { upsert: true });

    if (error) {
      console.error(error);
      return;
    }

    const { data } = supabase.storage.from('learning-materials').getPublicUrl(path);
    setMediaAssets((previous) =>
      previous.map((entry) =>
        entry.id === asset.id
          ? { ...entry, asset_path: path, public_url: data.publicUrl }
          : entry
      )
    );
  };

  return (
    <div className="module-editor-shell">
      <header className="module-editor-toolbar">
        <div className="module-editor-toolbar-main">
          <div className="module-editor-heading">
            <span>Module {moduleEntry.module_no}</span>
            <h2>{editedModule.title || `Module ${moduleEntry.module_no}`}</h2>
            <p>Edit the module content while preserving the mobile learning structure.</p>
          </div>
        </div>

        <div className="module-editor-toolbar-actions">
          <label className="module-editor-module-picker" htmlFor="module-editor-select">
            <span>Switch module</span>
            <select
              id="module-editor-select"
              value={moduleEntry.module_no}
              onChange={(event) => onSelectModule(Number(event.target.value))}
            >
              {moduleOptions.map((module) => (
                <option key={module.module_no} value={module.module_no}>
                  Module {module.module_no} - {module.title || 'Untitled module'}
                </option>
              ))}
            </select>
          </label>

          <div className="module-editor-metrics" aria-label="Module content totals">
            <span><strong>{formatCount(moduleEntry.pages.length)}</strong> pages</span>
            <span><strong>{formatCount(moduleEntry.blockCount)}</strong> blocks</span>
          </div>
        </div>
      </header>

      <aside className="module-editor-scope-notice" role="note">
        <span className="module-editor-scope-icon" aria-hidden="true">i</span>
        <div>
          <strong>Existing content updates only</strong>
          <p>
            You can revise the current text, labels, guides, and media. Adding, deleting, or reordering modules, pages, and blocks is locked because their identifiers and sequence are used by mobile routes, database mappings, progress tracking, and saved learner records.
          </p>
        </div>
      </aside>

      <EditorSection
        eyebrow="Module settings"
        title="Module details"
        description="Titles and subtitles shown in the module list and mobile learning experience."
      >
        <BilingualGrid>
          <EditorField label="Module Title" language="English">
            <input
              type="text"
              value={editedModule.title || ''}
              onChange={(event) => updateModuleField('title', event.target.value)}
            />
          </EditorField>
          <EditorField label="Module Title" language="Tagalog">
            <input
              type="text"
              value={editedModule.title_tl || ''}
              onChange={(event) => updateModuleField('title_tl', event.target.value)}
            />
          </EditorField>
          <EditorField label="Module Subtitle" language="English">
            <input
              type="text"
              value={editedModule.subtitle || ''}
              onChange={(event) => updateModuleField('subtitle', event.target.value)}
            />
          </EditorField>
          <EditorField label="Module Subtitle" language="Tagalog">
            <input
              type="text"
              value={editedModule.subtitle_tl || ''}
              onChange={(event) => updateModuleField('subtitle_tl', event.target.value)}
            />
          </EditorField>
        </BilingualGrid>
      </EditorSection>

      {totalPages > 0 && (
        <nav className="module-editor-page-nav" aria-label="Module pages">
          <button
            type="button"
            onClick={() => handlePageChange(moduleEntry.module_no, currentPageIndex - 1, totalPages)}
            disabled={currentPageIndex === 0}
          >
            <span aria-hidden="true">←</span>
            Previous
          </button>
          <div className="module-editor-page-status">
            <span>Page</span>
            <strong>{currentPageIndex + 1}</strong>
            <span>of {totalPages}</span>
          </div>
          <button
            type="button"
            onClick={() => handlePageChange(moduleEntry.module_no, currentPageIndex + 1, totalPages)}
            disabled={currentPageIndex >= totalPages - 1}
          >
            Next
            <span aria-hidden="true">→</span>
          </button>
        </nav>
      )}

      {page ? (
        <div className="module-editor-page-content">
          <EditorSection
            eyebrow={`Page ${page.page_no}`}
            title="Page details"
            description="Page headings shown before this page’s learning content."
          >
            <BilingualGrid>
              <EditorField label="Page Title" language="English">
                <input
                  type="text"
                  value={editedPage?.title_en || ''}
                  onChange={(event) => updatePageField(page.page_no, 'title_en', event.target.value)}
                />
              </EditorField>
              <EditorField label="Page Title" language="Tagalog">
                <input
                  type="text"
                  value={editedPage?.title_tl || ''}
                  onChange={(event) => updatePageField(page.page_no, 'title_tl', event.target.value)}
                />
              </EditorField>
            </BilingualGrid>
          </EditorSection>

          <EditorSection
            eyebrow="Page content"
            title="Content blocks"
            description="Each card represents an existing mobile content block."
            collapsible
          >
            {visibleBlocks.length > 0 ? (
              <div className="module-editor-item-list">
                {visibleBlocks.map((block, index) => (
                  <EditorItemCard
                    key={block.id || `${moduleEntry.module_no}-${page.page_no}-${block.block_no}`}
                    number={block.block_no ?? index + 1}
                    label={block.block_type ? block.block_type.replace(/_/g, ' ') : 'Content block'}
                    meta={block.block_key || undefined}
                  >
                    <BilingualGrid>
                      <EditorField label="Content" language="English">
                        <textarea
                          value={editedPage?.blocks.find((entry) => entry.id === block.id)?.text_en || ''}
                          onChange={(event) =>
                            updateBlockField(page.page_no, block.id, 'text_en', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Content" language="Tagalog">
                        <textarea
                          value={editedPage?.blocks.find((entry) => entry.id === block.id)?.text_tl || ''}
                          onChange={(event) =>
                            updateBlockField(page.page_no, block.id, 'text_tl', event.target.value)
                          }
                        />
                      </EditorField>
                    </BilingualGrid>

                    <MetadataEditor
                      moduleNo={moduleEntry.module_no}
                      block={block}
                      page={page}
                      editedModule={editedModule}
                      setEditedModule={setEditedModule}
                    />

                    {block.source_file && (
                      <p className="module-editor-source">Source: {block.source_file}</p>
                    )}
                  </EditorItemCard>
                ))}
              </div>
            ) : (
              <div className="module-editor-empty">No active blocks linked to this page.</div>
            )}
          </EditorSection>

          <EditorSection
            title="Additional Learning Texts"
            description="Supporting bilingual text associated with this page."
            collapsible
            defaultOpen={pageTexts.length > 0}
          >
            {pageTexts.length > 0 ? (
              <div className="module-editor-item-list">
                {pageTexts.map((text, index) => (
                  <EditorItemCard key={text.id} number={index + 1} label="Learning Material Text">
                    <LearningMaterialsTextEditor
                      text={text}
                      updateText={(field, value) => {
                        setLearningTexts((previous) =>
                          previous.map((entry) =>
                            entry.id === text.id ? { ...entry, [field]: value } : entry
                          )
                        );
                      }}
                    />
                  </EditorItemCard>
                ))}
              </div>
            ) : (
              <div className="module-editor-empty">No additional learning texts for this page.</div>
            )}
          </EditorSection>

          {moduleEntry.module_no === 1 && page.page_no === 2 && (
            <EditorSection
              title="Fire Class Details"
              description="Class descriptions, labels, examples, and recommended agents."
              collapsible
            >
              <div className="module-editor-item-list">
                {fireClassDetails.map((detail, index) => {
                  const guide = fireGuides.find((entry) => entry.class_key === detail.class_key);
                  return (
                    <EditorItemCard
                      key={detail.id}
                      number={index + 1}
                      label={detail.class_key}
                    >
                      <FireClassDetailsEditor
                        detail={detail}
                        guide={guide}
                        updateDetail={(field, value) => {
                          setFireClassDetails((previous) =>
                            previous.map((entry) =>
                              entry.id === detail.id ? { ...entry, [field]: value } : entry
                            )
                          );
                        }}
                        updateGuide={(field, value) => {
                          setFireGuides((previous) =>
                            previous.map((entry) =>
                              entry.id === guide?.id ? { ...entry, [field]: value } : entry
                            )
                          );
                        }}
                      />
                    </EditorItemCard>
                  );
                })}
              </div>
            </EditorSection>
          )}

          <EditorSection
            title="Media Assets"
            description="Existing images, videos, and bilingual accessibility labels for this page."
            collapsible
            defaultOpen={pageMedia.length > 0}
          >
            {pageMedia.length > 0 ? (
              <div className="module-editor-media-grid">
                {pageMedia.map((asset, index) => (
                  <EditorItemCard
                    key={asset.id}
                    number={index + 1}
                    label={asset.asset_key || asset.asset_type || 'Media asset'}
                  >
                    <MediaAssetEditor
                      asset={asset}
                      uploadFile={uploadMedia}
                      updateAsset={(field, value) => {
                        setMediaAssets((previous) =>
                          previous.map((entry) =>
                            entry.id === asset.id ? { ...entry, [field]: value } : entry
                          )
                        );
                      }}
                    />
                  </EditorItemCard>
                ))}
              </div>
            ) : (
              <div className="module-editor-empty">No media assets for this page.</div>
            )}
          </EditorSection>
        </div>
      ) : (
        <div className="module-editor-empty">No pages available for this module.</div>
      )}

      <div className="module-editor-save-bar">
        <div>
          <strong>Module {moduleEntry.module_no}</strong>
          <span>Save all changes made across this module.</span>
        </div>
        <button
          type="button"
          className="save-button"
          onClick={() => setShowConfirm(true)}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {showConfirm && (
        <div className="confirm-overlay" role="alertdialog" aria-modal="true" aria-labelledby="saveModuleTitle">
          <div className="confirm-modal">
            <div className="confirm-icon" aria-hidden="true">✓</div>
            <h3 id="saveModuleTitle">Save Changes?</h3>
            <p>
              This will update the learning module and make your latest edits available to users.
            </p>
            <div className="confirm-buttons">
              <button type="button" className="cancel-btn" onClick={() => setShowConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="confirm-btn"
                onClick={() => {
                  setShowConfirm(false);
                  handleSaveModule();
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
