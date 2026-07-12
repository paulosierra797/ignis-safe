import React from "react";

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

      <label>Teaser (English)</label>
      <textarea
        value={metadata.teaser_en || ""}
        onChange={(e) => updateMetadata("teaser_en", e.target.value)}
      />

      <label>Teaser (Tagalog)</label>
      <textarea
        value={metadata.teaser_tl || ""}
        onChange={(e) => updateMetadata("teaser_tl", e.target.value)}
      />

      <label>Popup Title (English)</label>
      <input
        type="text"
        value={metadata.popup_title_en || ""}
        onChange={(e) => updateMetadata("popup_title_en", e.target.value)}
      />

      <label>Popup Title (Tagalog)</label>
      <input
        type="text"
        value={metadata.popup_title_tl || ""}
        onChange={(e) => updateMetadata("popup_title_tl", e.target.value)}
      />

      <label>Source Label (English)</label>
      <input
        type="text"
        value={metadata.source_label_en || ""}
        onChange={(e) => updateMetadata("source_label_en", e.target.value)}
      />

      <label>Source Label (Tagalog)</label>
      <input
        type="text"
        value={metadata.source_label_tl || ""}
        onChange={(e) => updateMetadata("source_label_tl", e.target.value)}
      />
    </div>
  );
}