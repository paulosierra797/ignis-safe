import React from "react";
import "./DidyouKnow.css";

export default function DidYouKnowEditor({
  block,
  page,
  editedModule,
  setEditedModule,
}) {
  const metadata = block.metadata || {};

  const updateMetadata = (field, value) => {
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
                  [field]: value,
                },
              }
            : b
        ),
      };
    });

    setEditedModule({
      ...editedModule,
      pages: updatedPages,
    });
  };

  return (
    <div className="metadata-editor">
  <h4>Did You Know</h4>

  <div className="language-grid">

    {/* English */}
    <div className="language-card">
      <h4>English</h4>

      <div className="field">
        <label>Teaser (English)</label>
        <textarea
          className="teaser"
          value={metadata.teaser_en || ""}
          onChange={(e) =>
            updateMetadata("teaser_en", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Popup Title (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.popup_title_en || ""}
          onChange={(e) =>
            updateMetadata("popup_title_en", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Source Label (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.source_label_en || ""}
          onChange={(e) =>
            updateMetadata("source_label_en", e.target.value)
          }
        />
      </div>
    </div>

    {/* Tagalog */}
    <div className="language-card">
      <h4>Tagalog</h4>

      <div className="field">
        <label>Teaser (Tagalog)</label>
        <textarea
          className="teaser"
          value={metadata.teaser_tl || ""}
          onChange={(e) =>
            updateMetadata("teaser_tl", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Popup Title (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.popup_title_tl || ""}
          onChange={(e) =>
            updateMetadata("popup_title_tl", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Source Label (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.source_label_tl || ""}
          onChange={(e) =>
            updateMetadata("source_label_tl", e.target.value)
          }
        />
      </div>
    </div>

  </div>
</div>
  )
}