
import "./PassStep.css";
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';

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
   <div className="letter-section">
  <h4>Letter Details</h4>

  <EditorField label="Letter" className="module-editor-compact-field">
    <input
      className="letter"
      value={metadata.letter || ""}
      onChange={(e) => updateMetadata("letter", e.target.value)}
    />
  </EditorField>

  <BilingualGrid>
    <EditorField label="Description" language="English">
      <textarea
        className="description"
        value={metadata.desc_en || ""}
        onChange={(e) => updateMetadata("desc_en", e.target.value)}
      />
    </EditorField>
    <EditorField label="Description" language="Tagalog">
      <textarea
        className="description"
        value={metadata.desc_tl || ""}
        onChange={(e) => updateMetadata("desc_tl", e.target.value)}
      />
    </EditorField>
    <EditorField label="Video Title" language="English">
      <input
        className="video-title"
        value={metadata.video_title_en || ""}
        onChange={(e) => updateMetadata("video_title_en", e.target.value)}
      />
    </EditorField>
    <EditorField label="Video Title" language="Tagalog">
      <input
        className="video-title"
        value={metadata.video_title_tl || ""}
        onChange={(e) => updateMetadata("video_title_tl", e.target.value)}
      />
    </EditorField>
  </BilingualGrid>
</div>
  );
}
