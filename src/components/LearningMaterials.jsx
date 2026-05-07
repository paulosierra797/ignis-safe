import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  buildLearningMaterialModules,
  filterLearningMaterialModules,
  getLearningMaterialFireClassGuides,
  getLearningMaterialsAdminView,
  updateLearningMaterialBlock
} from '../utils/learningMaterialsService';
import './LearningMaterials.css';

const formatCount = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const formatSourceLine = (line) => (Number.isInteger(line) ? `Line ${line}` : '-');

export default function LearningMaterials() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [modules, setModules] = useState([]);
  const [fireGuides, setFireGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [editingBlock, setEditingBlock] = useState(null);
const [editedText, setEditedText] = useState('');
const [saving, setSaving] = useState(false);
const [editedTextTl, setEditedTextTl] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const [materialsResult, guidesResult] = await Promise.all([
        getLearningMaterialsAdminView(),
        getLearningMaterialFireClassGuides()
      ]);

      if (!mounted) return;

      if (materialsResult.error) {
        setMessage({ type: 'error', text: `Failed to load learning materials: ${materialsResult.error}` });
      }

      if (guidesResult.error && !message.text) {
        setMessage({ type: 'error', text: `Failed to load class guides: ${guidesResult.error}` });
      }

      setModules(buildLearningMaterialModules(materialsResult.data || []));
      setFireGuides(guidesResult.data || []);
      setLoading(false);
    };

    load();
    return () => { mounted = false; };
  }, []);

  const searchedModules = useMemo(() => filterLearningMaterialModules(modules, searchQuery), [modules, searchQuery]);

  const displayedModules = useMemo(() => {
    if (!selectedModule || selectedModule === 'all') return searchedModules;
    const n = Number(selectedModule);
    return searchedModules.filter((m) => Number(m.module_no) === n);
  }, [searchedModules, selectedModule]);

  const visiblePages = displayedModules.reduce((c, m) => c + (m.pages?.length || 0), 0);
  const visibleBlocks = displayedModules.reduce((c, m) => c + (m.pages?.reduce((pc, p) => pc + (p.blocks?.length || 0), 0) || 0), 0);
const handleSaveBlock = async (blockId) => {
  setSaving(true);

  const result = await updateLearningMaterialBlock(blockId, {
    text_en: editedText,
     text_tl: editedTextTl
  });

  if (result.error) {
    setMessage({
      type: 'error',
      text: result.error
    });
  } else {
    setModules((prev) =>
      prev.map((module) => ({
        ...module,
        pages: module.pages.map((page) => ({
          ...page,
          blocks: page.blocks.map((block) =>
            block.id === blockId
              ? {
    ...block,
    text_en: editedText,
    text_tl: editedTextTl
  }
              : block
          )
        }))
      }))
    );

    setEditingBlock(null);

    setMessage({
      type: 'success',
      text: 'Block updated successfully.'
    });
  }

  setSaving(false);
};
  return (
    <div className="learning-materials-container">
      <Sidebar variant="admin" />

      <div className="learning-materials-main">
        <PageHeader title="Learning Materials" searchQuery={searchQuery} onSearchChange={setSearchQuery} variant="admin" />

        <div className="learning-materials-hero">
          <div>
            <p className="learning-materials-kicker">Admin access</p>
            <h2>Review the learning modules exactly as they are structured for the mobile experience.</h2>
            <p>Use this view to audit module content, page order, block text, and fire-class guide data without leaving the admin workspace.</p>
          </div>

          <div>
            <div className="learning-materials-filter-row">
              <label htmlFor="module-select">Show module</label>
              <select id="module-select" className="module-select" value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}>
                <option value="all">All modules</option>
                {modules.map((m) => (
                  <option key={m.module_no} value={m.module_no}>{'Module ' + m.module_no + ' - ' + (m.title || '')}</option>
                ))}
              </select>
            </div>

            <div className="learning-materials-stats">
              <article>
                <span>Modules</span>
                <strong>{formatCount(displayedModules.length)}</strong>
              </article>
              <article>
                <span>Pages</span>
                <strong>{formatCount(visiblePages)}</strong>
              </article>
              <article>
                <span>Blocks</span>
                <strong>{formatCount(visibleBlocks)}</strong>
              </article>
              <article>
                <span>Fire guides</span>
                <strong>{formatCount(fireGuides.length)}</strong>
              </article>
            </div>
          </div>
        </div>

        {message.text && <div className={`learning-materials-message ${message.type}`}>{message.text}</div>}

        {loading ? (
          <div className="learning-materials-empty">Loading learning materials...</div>
        ) : displayedModules.length === 0 ? (
          <div className="learning-materials-empty">No learning materials matched your search.</div>
        ) : (
          <div className="learning-materials-grid">
            {displayedModules.map((moduleEntry) => (
              <section key={moduleEntry.module_no} className="learning-material-card">
                <header className="learning-material-card-header">
                  <div>
                    <p className="learning-material-module-number">Module {moduleEntry.module_no}</p>
                    <h3>{moduleEntry.title || 'Untitled module'}</h3>
                    {moduleEntry.title_tl && <p className="learning-material-title-tl">{moduleEntry.title_tl}</p>}
                    {moduleEntry.subtitle && <p className="learning-material-subtitle">{moduleEntry.subtitle}</p>}
                    {moduleEntry.subtitle_tl && <p className="learning-material-subtitle-tl">{moduleEntry.subtitle_tl}</p>}
                  </div>
                  <div className="learning-material-card-metrics">
                    <span>{formatCount(moduleEntry.pages.length)} pages</span>
                    <span>{formatCount(moduleEntry.blockCount)} blocks</span>
                  </div>
                </header>

                {moduleEntry.hero_asset && (
                  <div className="learning-material-hero-asset">
                    <span>Hero asset</span>
                    <code>{moduleEntry.hero_asset}</code>
                  </div>
                )}

                <div className="learning-material-pages">
                  {moduleEntry.pages.map((page) => (
                    <article key={`${moduleEntry.module_no}-${page.page_no}`} className="learning-material-page">
                      <div className="learning-material-page-header">
                        <div>
                          <p className="learning-material-page-number">Page {page.page_no}</p>
                          <h4>{page.title_en || 'Untitled page'}</h4>
                          {page.title_tl && <p className="learning-material-page-title-tl">{page.title_tl}</p>}
                        </div>
                        <span className="learning-material-page-key">{page.page_key || '-'}</span>
                      </div>

                      {page.blocks.length > 0 ? (
                        <div className="learning-material-blocks">
                          {page.blocks.map((block) => (
                            <div key={block.id || `${moduleEntry.module_no}-${page.page_no}-${block.block_no}`} className="learning-material-block">
                              <div className="learning-material-block-meta">
                                <span>Block {block.block_no ?? '-'}</span>
                                <span>{block.block_type || 'text'}</span>
                                <span>{formatSourceLine(block.source_line)}</span>
                              </div>
                              <p className="learning-material-block-key">{block.block_key || 'Unnamed block'}</p>
                             {editingBlock === block.id ? (
  <div className="learning-material-editor">
    <label>English</label>
    <textarea
      className="learning-material-textarea"
      value={editedText}
      onChange={(e) => setEditedText(e.target.value)}
    />
    <label>Tagalog</label>
    <textarea
  className="learning-material-textarea"
  value={editedTextTl}
  onChange={(e) => setEditedTextTl(e.target.value)}
  placeholder="Tagalog translation"
/>

    <div className="learning-material-editor-actions">
      <button
        onClick={() => handleSaveBlock(block.id)}
        disabled={saving}
      >
        {saving ? 'Saving...' : 'Save'}
      </button>

      <button
        onClick={() => {
          setEditingBlock(null);
          setEditedText('');
        }}
      >
        Cancel
      </button>
    </div>
  </div>
) : (<>
  <p className="learning-material-block-en">
    {block.text_en || 'No English text found.'}
  </p>

  {block.text_tl && (
    <p className="learning-material-block-tl">
      {block.text_tl}
    </p>
  )}

  <button
    className="learning-material-edit-btn"
    onClick={() => {
      setEditingBlock(block.id);
      setEditedText(block.text_en || '');
      setEditedTextTl(block.text_tl || '');
    }}
  >
    Edit
  </button>
</>
)}
  
                            
                              {block.source_file && <p className="learning-material-block-source">Source: {block.source_file}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="learning-material-blocks-empty">No active blocks linked to this page.</div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <section className="learning-materials-fire-guides">
          <div className="learning-materials-section-heading">
            <div>
              <p className="learning-materials-kicker">Fire class guides</p>
              <h3>Supporting guide data</h3>
            </div>
            <p>These entries reflect the fire-class guide table used by the learning module content.</p>
          </div>

          {fireGuides.length === 0 ? (
            <div className="learning-materials-empty">No active fire class guides found.</div>
          ) : (
            <div className="learning-materials-guide-grid">
              {fireGuides.map((guide) => (
                <article key={guide.id} className="learning-material-guide-card">
                  <div className="learning-material-guide-image">
                    {guide.image_asset ? <code>{guide.image_asset}</code> : <span>No image asset</span>}
                  </div>
                  <div className="learning-material-guide-body">
                    <p className="learning-material-module-number">{guide.class_key}</p>
                    <h4>{guide.class_name_en}</h4>
                    {guide.class_name_tl && <p className="learning-material-title-tl">{guide.class_name_tl}</p>}
                    <div className="learning-material-guide-json">
                      <div>
                        <span>Examples EN</span>
                        <strong>{Array.isArray(guide.examples_en) ? guide.examples_en.length : 0}</strong>
                      </div>
                      <div>
                        <span>Examples TL</span>
                        <strong>{Array.isArray(guide.examples_tl) ? guide.examples_tl.length : 0}</strong>
                      </div>
                      <div>
                        <span>Agents EN</span>
                        <strong>{Array.isArray(guide.agents_en) ? guide.agents_en.length : 0}</strong>
                      </div>
                      <div>
                        <span>Agents TL</span>
                        <strong>{Array.isArray(guide.agents_tl) ? guide.agents_tl.length : 0}</strong>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
