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
  updateLearningMaterialPage,
  getLearningMaterialTexts,
  getLearningMaterialFireClassDetails,
  updateLearningMaterialFireClassDetail,
  updateLearningMaterialFireClassGuides,
  updateLearningMaterialTexts,
  getLearningMaterialMediaAssets,   // ← Add this
  updateLearningMaterialMediaAsset
} from '../utils/learningMaterialsService';
import MetadataEditor from "./MetadataEditors/MetadataEditor";
import FireClassDetailsEditor from "./MetadataEditors/FireClassDetailsEditor";
import LearningMaterialsTextEditor from "./MetadataEditors/LearningMaterialsTextEditor";
import MediaAssetEditor from "./MetadataEditors/MediaAssetEditor";
import ModuleEditor from "./ModuleEditor";
import ModuleCard from "./ModuleCard";

import './LearningMaterials.css';

const formatCount = (value) => new Intl.NumberFormat('en-US').format(Number(value || 0));
const FORMAT_SOURCE_LINE = (line) => (Number.isInteger(line) ? `Line ${line}` : '-');
const FORMAT_BLOCK_REFERENCE = (block, moduleNo, pageNo) => {
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
  const [learningTexts, setLearningTexts] = useState([]);
  const [fireClassDetails, setFireClassDetails] = useState([]);
  const [mediaAssets, setMediaAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [saving, setSaving] = useState(false);
  
  const [editedModule, setEditedModule] = useState(null);
  const [currentPages, setCurrentPages] = useState({});
 
  const [selectedModuleCard, setSelectedModuleCard] = useState(null);

 

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

    await Promise.all(
  editedModule.pages.map(async (page) => {
    const pageResult = await updateLearningMaterialPage(
      editedModule.module_no,
      page.page_no,
      {
        title_en: page.title_en,
        title_tl: page.title_tl,
      }
    );

    if (pageResult.error) {
      throw new Error(
        `Failed to update page ${page.page_no}: ${pageResult.error}`
      );
    }

    await Promise.all(
      page.blocks.map(async (block) => {
        const blockResult = await updateLearningMaterialBlock(block.id, {
          text_en: block.text_en,
          text_tl: block.text_tl,
          metadata: block.metadata,
        });

        if (blockResult.error) {
          throw new Error(
            `Failed to update block ${block.block_no} on page ${page.page_no}`
          );
        }
      })
    );
  })
);
try {
  await Promise.all(
    fireClassDetails.map(async (detail) => {
      const result = await updateLearningMaterialFireClassDetail(detail.id, {
        title_en: detail.title_en,
        title_tl: detail.title_tl,
        description_en: detail.description_en,
        description_tl: detail.description_tl,
        note_en: detail.note_en,
        note_tl: detail.note_tl,
        section1_title_en: detail.section1_title_en,
        section1_title_tl: detail.section1_title_tl,
        section2_title_en: detail.section2_title_en,
        section2_title_tl: detail.section2_title_tl,
      });

      if (result.error) {
        throw new Error(result.error);
      }
    })
  );
} catch (err) {
  setMessage({
    type: "error",
    text: err.message,
  });

  setSaving(false);
  return;
}
try {
  await Promise.all(
    learningTexts.map(async (text) => {
      const result = await updateLearningMaterialTexts(text.id, {
        text_en: text.text_en,
        text_tl: text.text_tl,
      });

      if (result.error) {
        throw new Error(result.error);
      }
    })
  );
} catch (err) {
  setMessage({
    type: "error",
    text: err.message,
  });

  setSaving(false);
  return;
}
try {
  await Promise.all(
    mediaAssets.map(async (asset) => {
      const result = await updateLearningMaterialMediaAsset(asset.id, {
        asset_path: asset.asset_path,
        public_url: asset.public_url,
        alt_en: asset.alt_en,
        alt_tl: asset.alt_tl,
      });

      if (result.error) {
        throw new Error(
          result.error.message || result.error
        );
      }
    })
  );
} catch (err) {
  setMessage({
    type: "error",
    text: `Failed to update media asset: ${err.message}`,
  });

  setSaving(false);
  return;
}
try {
  await Promise.all(
    fireGuides.map(async (guide) => {
      const result =
        await updateLearningMaterialFireClassGuides(
          guide.id,
          {
            examples_en: guide.examples_en,
            examples_tl: guide.examples_tl,
            agents_en: guide.agents_en,
            agents_tl: guide.agents_tl,
          }
        );

      if (result.error) {
        throw new Error(
          `Failed to update ${guide.class_key}: ${result.error}`
        );
      }
    })
  );
} catch (err) {
  setMessage({
    type: "error",
    text: err.message,
  });

  setSaving(false);
  return;
}
   setModules((prev) =>
  prev.map((m) =>
    m.module_no === editedModule.module_no
      ? editedModule
      : m
  )
);
setSelectedModuleCard(null);
setEditedModule(null);
setMessage({
  type: "success",
  text: "Changes have been saved successfully."
});

setSaving(false);
    return;
  };
  

  
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setMessage({ type: '', text: '' });

      const [
  materialsResult,
  guidesResult,
  detailsResult,
  textsResult,
  mediaResult
] = await Promise.all([
  getLearningMaterialsAdminView(),
  getLearningMaterialFireClassGuides(),
  getLearningMaterialFireClassDetails(),
   getLearningMaterialTexts(),
   getLearningMaterialMediaAssets()
]);

      if (!mounted) return;

      if (materialsResult.error) {
        setMessage({ type: 'error', text: `Failed to load learning materials: ${materialsResult.error}` });
      }

      if (guidesResult.error && !message.text) {
        setMessage({ type: 'error', text: `Failed to load class guides: ${guidesResult.error}` });
      }
      if (detailsResult.error && !message.text) {
    setMessage({
        type: "error",
        text: `Failed to load fire class details: ${detailsResult.error}`
    });
}

if (textsResult.error && !message.text) {
    setMessage({
        type: "error",
        text: `Failed to load learning texts: ${textsResult.error}`
    });
}

      setModules(buildLearningMaterialModules(materialsResult.data || []));
      setFireGuides(guidesResult.data || []);
      setFireClassDetails(detailsResult.data || []);
      setLearningTexts(textsResult.data || []);
      setMediaAssets(mediaResult.data || []);
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
  const SELECTED_MODULE_DATA = displayedModules.find(
  m => m.module_no === selectedModuleCard
);

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
  <div className="learning-materials-empty">
    Loading learning materials...
  </div>
) : displayedModules.length === 0 ? (
  <div className="learning-materials-empty">
    No learning materials matched your search.
  </div>
) : selectedModuleCard === null ? (

 <div className="module-card-grid">
  {displayedModules.map((module) => (
    <ModuleCard
      key={module.module_no}
      module={module}
      onOpen={() => {
        setEditedModule(JSON.parse(JSON.stringify(module)));
        setSelectedModuleCard(module.module_no);
      }}
    />
  ))}
</div>

) : (

  <>
   <div className="back-button-container">
  <button
    className="back-button"
    onClick={() => {
      setSelectedModuleCard(null);
      setEditedModule(null);
    }}
  >
    ← Back to Modules
  </button>
</div>

    <ModuleEditor
    moduleEntry={editedModule}
    editedModule={editedModule}
    setEditedModule={setEditedModule}

    currentPages={currentPages}
    handlePageChange={handlePageChange}

    fireGuides={fireGuides}
    fireClassDetails={fireClassDetails}
    learningTexts={learningTexts}
    mediaAssets={mediaAssets}

    setFireGuides={setFireGuides}
    setFireClassDetails={setFireClassDetails}
    setLearningTexts={setLearningTexts}
    setMediaAssets={setMediaAssets}

    handleSaveModule={handleSaveModule}
    saving={saving}
    onBack={() => {
      setSelectedModuleCard(null);
      setEditedModule(null);
    }}
/>
  </>
)}
        
       

      </div>
    </div>
  );
}
