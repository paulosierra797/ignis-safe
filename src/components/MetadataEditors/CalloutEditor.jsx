import "./CalloutEditor.css";
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';
export default function CalloutEditor({
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
   <div className="lines-section">
  <BilingualGrid>
    <EditorField label="Callout Lines" language="English">
      <div className="module-editor-repeater-list">
        {(metadata.lines_en || []).map((line, index) => (
          <div className="module-editor-repeater-row" key={index}>
            <span>{index + 1}</span>
            <textarea
              className="line-textarea"
              value={line}
              onChange={(e) => {
                const updated = [...metadata.lines_en];
                updated[index] = e.target.value;
                updateMetadata("lines_en", updated);
              }}
            />
          </div>
        ))}
      </div>
    </EditorField>
    <EditorField label="Callout Lines" language="Tagalog">
      <div className="module-editor-repeater-list">
        {(metadata.lines_tl || []).map((line, index) => (
          <div className="module-editor-repeater-row" key={index}>
            <span>{index + 1}</span>
            <textarea
              className="line-textarea"
              value={line}
              onChange={(e) => {
                const updated = [...metadata.lines_tl];
                updated[index] = e.target.value;
                updateMetadata("lines_tl", updated);
              }}
            />
          </div>
        ))}
      </div>
    </EditorField>
  </BilingualGrid>
</div>
  );
}
