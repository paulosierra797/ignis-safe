import React, { useEffect, useMemo, useState } from 'react';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import {
  buildLearningMaterialModules,
  filterLearningMaterialModules,
  getLearningMaterialFireClassGuides,
  getLearningMaterialsAdminView,
  updateLearningMaterialBlock,
  updateLearningMaterialModule,
  updateLearningMaterialPage
} from '../utils/learningMaterialsService';
import './LearningMaterials.css';

const formatCount = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const formatSourceLine = (line) => (Number.isInteger(line) ? `Line ${line}` : '-');
const formatBlockReference = (block, moduleNo, pageNo) => {
  const rawKey = String(block?.block_key || '').trim();
  const match = rawKey.match(/^m(\d+)_p(\d+)_b(\d+)$/i);

  if (match) {
    return `Block reference: Module ${match[1]} • Page ${match[2]} • Block ${match[3]}`;
  }

  const blockNo = Number.isInteger(block?.block_no) ? block.block_no : '-';
  return `Block reference: Module ${moduleNo ?? '-'} • Page ${pageNo ?? '-'} • Block ${blockNo}`;
};

export default function LearningMaterials() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [modules, setModules] = useState([]);
  const [fireGuides, setFireGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  const [editingModule, setEditingModule] = useState(null);
  const [editedModule, setEditedModule] = useState(null);
  const [currentPages, setCurrentPages] = useState({});

 

  const handlePageChange = (moduleNo, nextIndex, totalPages) => {
    const safeMax = Math.max(totalPages - 1, 0);
    const safeIndex = Math.min(Math.max(nextIndex, 0), safeMax);

    setCurrentPages((prev) => ({
      ...prev,
      [moduleNo]: safeIndex
    }));
  };

  const handleSaveModule = async () => {
    if (!editedModule) {
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    const moduleResult = await updateLearningMaterialModule(editedModule.module_no, {
      title_en: editedModule.title,
      title_tl: editedModule.title_tl,
      subtitle_en: editedModule.subtitle,
      subtitle_tl: editedModule.subtitle_tl
      
    });

    if (moduleResult.error) {
      setMessage({
        type: 'error',
        text: `Failed to update module details: ${moduleResult.error}`
      });
      setSaving(false);
      return;
    }

    for (const page of editedModule.pages) {
      const pageResult = await updateLearningMaterialPage(editedModule.module_no, page.page_no, {
        title_en: page.title_en,
        title_tl: page.title_tl
      });

      if (pageResult.error) {
        setMessage({
          type: 'error',
          text: `Failed to update page ${page.page_no}: ${pageResult.error}`
        });
        setSaving(false);
        return;
      }

      for (const block of page.blocks) {
        const blockResult = await updateLearningMaterialBlock(block.id, {
          text_en: block.text_en,
          text_tl: block.text_tl,
          metadata: block.metadata
        });

        if (blockResult.error) {
          setMessage({
            type: 'error',
            text: `Failed to update block ${block.block_no ?? '-'} on page ${page.page_no}: ${blockResult.error}`
          });
          setSaving(false);
          return;
        }
      }
    }

    setModules((prev) =>
      prev.map((m) =>
        m.module_no === editedModule.module_no
          ? editedModule
          : m
      )
    );

    setEditingModule(null);
    setEditedModule(null);
    setMessage({
      type: 'success',
      text: 'Module updated successfully.'
    });
    setSaving(false);
  };
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
           {displayedModules.map((moduleEntry) => {
  const activeModule = editingModule === moduleEntry.module_no && editedModule
    ? editedModule
    : moduleEntry;
  const totalPages = activeModule.pages.length;
  const currentPageIndex = Math.min(
    currentPages[moduleEntry.module_no] ?? 0,
    Math.max(totalPages - 1, 0)
  );
  const page = activeModule.pages[currentPageIndex] || null;

  return (
              
              <section key={moduleEntry.module_no} className="learning-material-card">
                <header className="learning-material-card-header">
                  <button
  className="learning-material-edit-btn"
  disabled={saving || (editingModule !== null && editingModule !== moduleEntry.module_no)}
  onClick={() => {
    setEditingModule(moduleEntry.module_no);
    setEditedModule(JSON.parse(JSON.stringify(moduleEntry)));
  }}
>
  Edit Module
</button>
                  <div>
                    <p className="learning-material-module-number">Module {moduleEntry.module_no}</p>
                    {editingModule === moduleEntry.module_no ? (
  <input
    type="text"
    value={editedModule.title || ''}
    onChange={(e) =>
      setEditedModule({
        ...editedModule,
        title: e.target.value
      })
    }
  />
) : (
  <h3>{moduleEntry.title || 'Untitled module'}</h3>
)}
                    {editingModule === moduleEntry.module_no ? (
  <input
    className="learning-material-title-tl"
    type="text"
    value={editedModule.title_tl || ''}
    onChange={(e) =>
      setEditedModule({
        ...editedModule,
        title_tl: e.target.value
      })
    }
  />
) : (
  moduleEntry.title_tl && (
    <p className="learning-material-title-tl">
      {moduleEntry.title_tl}
    </p>
  )
)}
{editingModule === moduleEntry.module_no ? (
  <input
    className="learning-material-subtitle"
    type="text"
    value={editedModule.subtitle || ''}
    onChange={(e) =>
      setEditedModule({
        ...editedModule,
        subtitle: e.target.value
      })
    }
  />
) : (
  moduleEntry.subtitle && (
    <p className="learning-material-subtitle">
      {moduleEntry.subtitle}
    </p>
  )
)}
{editingModule === moduleEntry.module_no ? (
  <input
    className="learning-material-subtitle-tl"
    type="text"
    value={editedModule.subtitle_tl || ''}
    onChange={(e) =>
      setEditedModule({
        ...editedModule,
        subtitle_tl: e.target.value
      })
    }
  />
) : (
  moduleEntry.subtitle_tl && (
    <p className="learning-material-subtitle-tl">
      {moduleEntry.subtitle_tl}
    </p>
  )
)}

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

                {totalPages > 0 && (
                  <div className="learning-material-page-nav">
                    <button
                      type="button"
                      onClick={() => handlePageChange(moduleEntry.module_no, currentPageIndex - 1, totalPages)}
                      disabled={currentPageIndex === 0}
                    >
                      Previous Page
                    </button>
                    <span>{`Page ${currentPageIndex + 1} of ${totalPages}`}</span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(moduleEntry.module_no, currentPageIndex + 1, totalPages)}
                      disabled={currentPageIndex >= totalPages - 1}
                    >
                      Next Page
                    </button>
                  </div>
                )}

                <div className="learning-material-pages">
                  {page ? (
                    <article key={`${moduleEntry.module_no}-${page.page_no}`} className="learning-material-page">
                      <div className="learning-material-page-header">
                        <div>
                          <p className="learning-material-page-number">Page {page.page_no}</p>
                         {editingModule === moduleEntry.module_no ? (
  <input
    type="text"
    value={editedModule.pages.find(p => p.page_no === page.page_no)?.title_en || ''}
    onChange={(e) => {
      const updatedPages = editedModule.pages.map((p) =>
        p.page_no === page.page_no
          ? { ...p, title_en: e.target.value }
          : p
      );

      setEditedModule({
        ...editedModule,
        pages: updatedPages
      });
    }}
  />
) : (
  <h4>{page.title_en || 'Untitled page'}</h4>
)}
                          {editingModule === moduleEntry.module_no ? (
                            <input
                              className="learning-material-page-title-tl"
                              type="text"
                              value={editedModule.pages.find((p) => p.page_no === page.page_no)?.title_tl || ''}
                              onChange={(e) => {
                                const updatedPages = editedModule.pages.map((p) =>
                                  p.page_no === page.page_no
                                    ? { ...p, title_tl: e.target.value }
                                    : p
                                );

                                setEditedModule({
                                  ...editedModule,
                                  pages: updatedPages
                                });
                              }}
                            />
                          ) : (
                            page.title_tl && <p className="learning-material-page-title-tl">{page.title_tl}</p>
                          )}
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
                              <p className="learning-material-block-key">
                                {formatBlockReference(block, moduleEntry.module_no, page.page_no)}
                              </p>
                             <>
  {editingModule === moduleEntry.module_no ? (
  <textarea
    className="learning-material-textarea"
    value={
      editedModule.pages
        .find((p) => p.page_no === page.page_no)
        ?.blocks.find((b) => b.id === block.id)?.text_en || ''
    }
    onChange={(e) => {
      const updatedPages = editedModule.pages.map((p) => {
        if (p.page_no !== page.page_no) return p;

        return {
          ...p,
          blocks: p.blocks.map((b) =>
            b.id === block.id
              ? { ...b, text_en: e.target.value }
              : b
          )
        };
      });

      setEditedModule({
        ...editedModule,
        pages: updatedPages
      });
    }}
  />
) : (
  <p className="learning-material-block-en">
    {block.text_en || 'No English text found.'}
  </p>
)}
{editingModule === moduleEntry.module_no ? (
  <textarea
    className="learning-material-textarea learning-material-block-tl"
    value={
      editedModule.pages
        .find((p) => p.page_no === page.page_no)
        ?.blocks.find((b) => b.id === block.id)?.text_tl || ''
    }
    onChange={(e) => {
      const updatedPages = editedModule.pages.map((p) => {
        if (p.page_no !== page.page_no) return p;

        return {
          ...p,
          blocks: p.blocks.map((b) =>
            b.id === block.id
              ? { ...b, text_tl: e.target.value }
              : b
          )
        };
      });

      setEditedModule({
        ...editedModule,
        pages: updatedPages
      });
    }}
  />
) : (
  block.text_tl && (
    <p className="learning-material-block-tl">
      {block.text_tl}
    </p>
  )
)}
{editingModule === moduleEntry.module_no ? (() => {
  const currentBlock = editedModule.pages
    .find((p) => p.page_no === page.page_no)
    ?.blocks.find((b) => b.id === block.id);

  const metadata = currentBlock?.metadata || {};

  const updateMetadata = (key, value) => {
    const updatedPages = editedModule.pages.map((p) => {
      if (p.page_no !== page.page_no) return p;

      return {
        ...p,
        blocks: p.blocks.map((b) =>
          b.id === block.id
            ? {
                ...b,
                metadata: {
                  ...b.metadata,
                  [key]: value
                }
              }
            : b
        )
      };
    });

    setEditedModule({
      ...editedModule,
      pages: updatedPages
    });
  };

  return (
    <div className="learning-material-metadata-editor">

      <label>Page Tag (English)</label>
      <input
        type="text"
        value={metadata.page_tag_en || ""}
        onChange={(e) => updateMetadata("page_tag_en", e.target.value)}
      />

      <label>Page Tag (Tagalog)</label>
      <input
        type="text"
        value={metadata.page_tag_tl || ""}
        onChange={(e) => updateMetadata("page_tag_tl", e.target.value)}
      />

      <label>Subtitle (English)</label>
      <textarea
        value={metadata.subtitle_en || ""}
        onChange={(e) => updateMetadata("subtitle_en", e.target.value)}
      />

      <label>Subtitle (Tagalog)</label>
      <textarea
        value={metadata.subtitle_tl || ""}
        onChange={(e) => updateMetadata("subtitle_tl", e.target.value)}
      />

    </div>
  );
})() : (
  <pre className="learning-material-metadata-preview">
    {JSON.stringify(block.metadata, null, 2)}
  </pre>
)}
  
</>


  
                            
                              {block.source_file && <p className="learning-material-block-source">Source: {block.source_file}</p>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="learning-material-blocks-empty">No active blocks linked to this page.</div>
                      )}
                    </article>
                  ) : (
                    <div className="learning-material-blocks-empty">No pages available for this module.</div>
                  )}
                </div>
                {editingModule === moduleEntry.module_no && (
  <div className="learning-material-module-actions">
    <button onClick={handleSaveModule} disabled={saving}>
      {saving ? 'Saving...' : 'Save Module'}
    </button>

    <button
      disabled={saving}
      onClick={() => {
        setEditingModule(null);
        setEditedModule(null);
      }}
    >
      Cancel
    </button>
  </div>
)}
                
              </section>
           );
})}
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
