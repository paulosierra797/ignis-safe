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

import  './ModuleEditor.css';


export default function ModuleEditor({
    moduleEntry,

   

    editedModule,
    setEditedModule,

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
    console.log("moduleEntry", moduleEntry);
console.log("editedModule", editedModule);
const [showConfirm, setShowConfirm] = useState(false);
    const formatCount = (value) =>
  new Intl.NumberFormat("en-US").format(Number(value || 0));

const formatSourceLine = (line) =>
  Number.isInteger(line) ? `Line ${line}` : "-";

const formatBlockReference = (block, moduleNo, pageNo) => {
  const rawKey = String(block?.block_key || "").trim();
  const match = rawKey.match(/^m(\d+)_p(\d+)_b(\d+)$/i);

  if (match) {
    return `Block reference: Module ${match[1]} • Page ${match[2]} • Block ${match[3]}`;
  }

  const blockNo = Number.isInteger(block?.block_no)
    ? block.block_no
    : "-";

  return `Block reference: Module ${moduleNo} • Page ${pageNo} • Block ${blockNo}`;
};
     const activeModule = moduleEntry;
  const totalPages = activeModule.pages.length;
  const currentPageIndex = Math.min(
    currentPages[moduleEntry.module_no] ?? 0,
    Math.max(totalPages - 1, 0)
  );
  const page = activeModule.pages[currentPageIndex] || null;
   const pageTexts = learningTexts.filter(
  (text) =>
    text.module_no === moduleEntry.module_no &&
    text.page_no === page?.page_no
);

const shouldShowBlock = (moduleNo, pageNo, blockNo) => {
  // Hide Module 2 Page 1 Blocks 1-20
  if (
    moduleNo === 2 &&
    pageNo === 1 &&
    blockNo >= 1 &&
    blockNo <= 20
  ) {
    return false;
  }
  if (
    moduleNo === 2 &&
    pageNo === 2 &&
    blockNo >= 1 &&
    blockNo <= 17
  ) {
    return false;
  }
  if (
    moduleNo === 2 &&
    pageNo === 3 &&
    blockNo >= 1 &&
    blockNo <= 11
  ) {
    return false;
  }
  if (
    moduleNo === 3 &&
    pageNo === 1 &&
    blockNo >= 1 &&
    blockNo <= 20
  ) {
    return false;
  }
  if (
    moduleNo === 3 &&
    pageNo === 2 &&
    blockNo >= 1 &&
    blockNo <= 30
  ) {
    return false;
  }
  if (
    moduleNo === 3 &&
    pageNo === 3 &&
    blockNo >= 1 &&
    blockNo <= 40
  ) {
    return false;
  }
  if (
    moduleNo === 4 &&
    pageNo === 1 &&
    blockNo >= 1 &&
    blockNo <= 20
  ) {
    return false;
  }
  if (
    moduleNo === 4 &&
    pageNo === 2 &&
    blockNo >= 1 &&
    blockNo <= 22
  ) {
    return false;
  }
  if (
    moduleNo === 4 &&
    pageNo === 3 &&
    blockNo >= 1 &&
    blockNo <= 21
  ) {
    return false;
  }
  if (
    moduleNo === 5 &&
    pageNo === 1 &&
    blockNo >= 1 &&
    blockNo <= 19
  ) {
    return false;
  }
  if (
    moduleNo === 5 &&
    pageNo === 2 &&
    blockNo >= 1 &&
    blockNo <= 19
  ) {
    return false;
  }
  if (
    moduleNo === 5 &&
    pageNo === 3 &&
    blockNo >= 1 &&
    blockNo <= 19
  ) {
    return false;
  }

  return true;
};

const visibleBlocks = page
  ? page.blocks.filter((block) =>
      shouldShowBlock(
        moduleEntry.module_no,
        page.page_no,
        block.block_no
      )
    )
  : [];
const pageMedia = mediaAssets.filter(
    (asset) =>
        asset.module_no === moduleEntry.module_no &&
        asset.page_no === page?.page_no
);
const uploadMedia = async (asset, file) => {

    const extension = file.name.split(".").pop();

    const path =
        `${asset.module_no}/${asset.asset_key}.${extension}`;

    const { error } = await supabase.storage
        .from("learning-materials")
        .upload(path,file,{
            upsert:true
        });

    if(error){
        console.error(error);
        return;
    }

    const { data } = supabase.storage
        .from("learning-materials")
        .getPublicUrl(path);

    setMediaAssets(prev =>
        prev.map(a =>
            a.id===asset.id
                ?{
                    ...a,
                    asset_path:path,
                    public_url:data.publicUrl
                }
                :a
        )
    );
};
return(
    <>
 <section key={moduleEntry.module_no} className="learning-material-card">
                <header className="learning-material-card-header">
                  
                  <div>
                    <p className="learning-material-module-number">Module {moduleEntry.module_no}</p>
                   
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

  


               </div>
                  <div className="learning-material-card-metrics">
                    <span>{formatCount(moduleEntry.pages.length)} pages</span>
                    <span>{formatCount(moduleEntry.blockCount)} blocks</span>
                  </div>
                </header>

             

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
                         
                           
                          
                        </div>
                       
                      </div>

                     {visibleBlocks.length > 0 ? (
  <div className="learning-material-blocks">
    {visibleBlocks.map((block) => (
      <div
        key={block.id || `${moduleEntry.module_no}-${page.page_no}-${block.block_no}`}
        className="learning-material-block"
      >
        


        {/* English */}
        <textarea
          className="learning-material-textarea"
          value={
            editedModule.pages
              .find((p) => p.page_no === page.page_no)
              ?.blocks.find((b) => b.id === block.id)?.text_en || ""
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
                ),
              };
            });

            setEditedModule({
              ...editedModule,
              pages: updatedPages,
            });
          }}
        />

        {/* Tagalog */}
        <textarea
          className="learning-material-textarea learning-material-block-tl"
          value={
            editedModule.pages
              .find((p) => p.page_no === page.page_no)
              ?.blocks.find((b) => b.id === block.id)?.text_tl || ""
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
                ),
              };
            });

            setEditedModule({
              ...editedModule,
              pages: updatedPages,
            });
          }}
        />

        <MetadataEditor
          moduleNo={moduleEntry.module_no}
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />

        {block.source_file && (
          <p className="learning-material-block-source">
            Source: {block.source_file}
          </p>
        )}
      </div>
    ))}
  </div>
) : (
  <div className="learning-material-blocks-empty">
    No active blocks linked to this page.
  </div>
)}
<section className="learning-material-texts">
  <h3>Additional Learning Texts</h3>

  {pageTexts.map((text) => (
    <LearningMaterialsTextEditor
      key={text.id}
      text={text}
      updateText={(field, value) => {
        setLearningTexts(prev =>
          prev.map(t =>
            t.id === text.id
              ? { ...t, [field]: value }
              : t
          )
        );
      }}
    />
  ))}
</section>
  {moduleEntry.module_no === 1 && 
  page.page_no === 2 &&(               
  <section className="learning-materials-fire-details">
    <h3>Fire Class Details</h3>

    {fireClassDetails.map((detail) => (
      <div
        key={detail.id}
        className="learning-material-fire-detail-card"
      >
        <h4>{detail.class_key}</h4>

       <FireClassDetailsEditor
  detail={detail}
  guide={fireGuides.find(g => g.class_key === detail.class_key)}
  updateDetail={(field, value) => {
    setFireClassDetails(prev =>
      prev.map(d =>
        d.id === detail.id
          ? { ...d, [field]: value }
          : d
      )
    );
  }}
  updateGuide={(field, value) => {
    setFireGuides(prev =>
      prev.map(g =>
        g.id === guide.id
          ? { ...g, [field]: value }
          : g
      )
    );
  }}
/>
      </div>
      
    ))}
    </section>
  )}
    <section className="learning-material-media">
  <h3>Media Assets</h3>

  {pageMedia.length > 0 ? (
    pageMedia.map((asset) => (
      <MediaAssetEditor
        key={asset.id}
        asset={asset}
        uploadMedia={uploadMedia}
        updateAsset={(field, value) => {
          setMediaAssets(prev =>
            prev.map(a =>
              a.id === asset.id
                ? { ...a, [field]: value }
                : a
            )
          );
        }}
      />
    ))
  ) : (
    <p>No media assets for this page.</p>
  )}
</section>
    
  </article>
) : (
  <div className="learning-material-blocks-empty">
    No pages available for this module.
  </div>
)}
  
              </div>
              
            </section>
       <div className="learning-material-actions">
  <button
    type="button"
    className="save-button"
    onClick={() => setShowConfirm(true)}
    disabled={saving}
  >
    {saving ? "Saving..." : "Save Changes"}
  </button>
</div>

{showConfirm && (
  <div className="confirm-overlay">
    <div className="confirm-modal">
      <div className="confirm-icon">
        💾
      </div>

      <h3>Save Changes?</h3>

      <p>
        This will update the learning module and make your latest edits
        available to users.
      </p>

      <div className="confirm-buttons">
        <button
          className="cancel-btn"
          onClick={() => setShowConfirm(false)}
        >
          Cancel
        </button>

        <button
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

  </>   
  );
}