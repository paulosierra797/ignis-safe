import React from "react";

export default function PageBannerEditor({
  block,
  page,
  editedModule,
  setEditedModule
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
                  [field]: value
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
    <div className="metadata-editor">
      <h4>Page Banner</h4>

      <label>Page Tag (English)</label>
      <input
        type="text"
        value={metadata.page_tag_en || ""}
        onChange={(e) =>
          updateMetadata("page_tag_en", e.target.value)
        }
      />

      <label>Page Tag (Tagalog)</label>
      <input
        type="text"
        value={metadata.page_tag_tl || ""}
        onChange={(e) =>
          updateMetadata("page_tag_tl", e.target.value)
        }
      />

      <label>Subtitle (English)</label>
      <textarea
        value={metadata.subtitle_en || ""}
        onChange={(e) =>
          updateMetadata("subtitle_en", e.target.value)
        }
      />

      <label>Subtitle (Tagalog)</label>
      <textarea
        value={metadata.subtitle_tl || ""}
        onChange={(e) =>
          updateMetadata("subtitle_tl", e.target.value)
        }
      />
    </div>
  );
}