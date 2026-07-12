export default function PassStepEditor({
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
    <>
      <label>Letter</label>
      <input
        value={metadata.letter || ""}
        onChange={(e) =>
          updateMetadata("letter", e.target.value)
        }
      />

      <label>Description (English)</label>
      <textarea
        value={metadata.desc_en || ""}
        onChange={(e) =>
          updateMetadata("desc_en", e.target.value)
        }
      />

      <label>Description (Tagalog)</label>
      <textarea
        value={metadata.desc_tl || ""}
        onChange={(e) =>
          updateMetadata("desc_tl", e.target.value)
        }
      />

      <label>Video Title (English)</label>
      <input
        value={metadata.video_title_en || ""}
        onChange={(e) =>
          updateMetadata("video_title_en", e.target.value)
        }
      />

      <label>Video Title (Tagalog)</label>
      <input
        value={metadata.video_title_tl || ""}
        onChange={(e) =>
          updateMetadata("video_title_tl", e.target.value)
        }
      />
    </>
  );
}