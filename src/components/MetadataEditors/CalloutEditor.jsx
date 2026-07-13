import "./CalloutEditor.css";
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
    <>
      <h4>English Lines</h4>

      {(metadata.lines_en || []).map((line, index) => (
        <textarea
          key={index}
          value={line}
          onChange={(e) => {
            const updated = [...metadata.lines_en];
            updated[index] = e.target.value;
            updateMetadata("lines_en", updated);
          }}
        />
      ))}

      <h4>Tagalog Lines</h4>

      {(metadata.lines_tl || []).map((line, index) => (
        <textarea classname="callout"
          key={index}
          value={line}
          onChange={(e) => {
            const updated = [...metadata.lines_tl];
            updated[index] = e.target.value;
            updateMetadata("lines_tl", updated);
          }}
        />
      ))}

     
    </>
  );
}