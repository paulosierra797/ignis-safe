import React from "react";
import "./ContentSection.css";

export default function ContentSectionEditor({
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

  const updatePart = (index, field, value) => {
    const updatedPages = editedModule.pages.map((p) => {
      if (p.page_no !== page.page_no) return p;

      return {
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== block.id) return b;

          const parts = [...(b.metadata.parts || [])];
          parts[index] = {
            ...parts[index],
            [field]: value,
          };

          return {
            ...b,
            metadata: {
              ...b.metadata,
              parts,
            },
          };
        }),
      };
    });

    setEditedModule({
      ...editedModule,
      pages: updatedPages,
    });
  };

  const updatePartLine = (partIndex, lineIndex, lang, value) => {
    const updatedPages = editedModule.pages.map((p) => {
      if (p.page_no !== page.page_no) return p;

      return {
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== block.id) return b;

          const parts = [...(b.metadata.parts || [])];
          const lines = [...(parts[partIndex][lang] || [])];

          lines[lineIndex] = value;

          parts[partIndex] = {
            ...parts[partIndex],
            [lang]: lines,
          };

          return {
            ...b,
            metadata: {
              ...b.metadata,
              parts,
            },
          };
        }),
      };
    });

    setEditedModule({
      ...editedModule,
      pages: updatedPages,
    });
  };
  const updatePill = (partIndex, pillIndex, field, value) => {
  const updatedPages = editedModule.pages.map((p) => {
    if (p.page_no !== page.page_no) return p;

    return {
      ...p,
      blocks: p.blocks.map((b) => {
        if (b.id !== block.id) return b;

        const parts = [...(b.metadata.parts || [])];
        const pills = [...(parts[partIndex].pills || [])];

        pills[pillIndex] = {
          ...pills[pillIndex],
          [field]: value,
        };

        parts[partIndex] = {
          ...parts[partIndex],
          pills,
        };

        return {
          ...b,
          metadata: {
            ...b.metadata,
            parts,
          },
        };
      }),
    };
  });

  setEditedModule({
    ...editedModule,
    pages: updatedPages,
  });
};

  return (
    <div className="metadata-editor">
      <h4>Content Section</h4>

     

      

      

      

      {(metadata.parts || []).map((part, index) => (
        
        <div
          key={index}
          style={{
            border: "1px solid #ddd",
            padding: 16,
            marginBottom: 20,
          }}
        >
            {part.type === "mini_headline" && (
  <>
    <label>Headline (English)</label>
    <input className="headline"
      value={part.text_en || ""}
      onChange={(e) =>
        updatePart(index, "text_en", e.target.value)
      }
    />

    <label>Headline (Tagalog)</label>
     <input className="headline"
      value={part.text_tl || ""}
      onChange={(e) =>
        updatePart(index, "text_tl", e.target.value)
      }
    />
  </>
)}
{part.type === "chip_line" && (
  <>
    <label>Text (English)</label>
    <textarea className="text"
      value={part.text_en || ""}
      onChange={(e) =>
        updatePart(index, "text_en", e.target.value)
      }
    />

    <label>Text (Tagalog)</label>
    <textarea className="text"
      value={part.text_tl || ""}
      onChange={(e) =>
        updatePart(index, "text_tl", e.target.value)
      }
    />

   
  </>
)}
{part.type === "action_pills" && (
  <>
    <h5>Action Pills</h5>

    {(part.pills || []).map((pill, pillIndex) => (
      <div
        key={pillIndex}
        style={{
          border: "1px solid #ccc",
          padding: 12,
          marginBottom: 15,
        }}
      >
        <h6>Pill {pillIndex + 1}</h6>

        <label>Label (English)</label>
        <input
          value={pill.label_en || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "label_en", e.target.value)
          }
        />

        <label>Label (Tagalog)</label>
        <input
          value={pill.label_tl || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "label_tl", e.target.value)
          }
        />

        <label>Popup Title (English)</label>
        <input
          value={pill.popup_title_en || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "popup_title_en", e.target.value)
          }
        />

        <label>Popup Title (Tagalog)</label>
        <input
          value={pill.popup_title_tl || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "popup_title_tl", e.target.value)
          }
        />

       <div> <label>Popup Body (English)</label>
        <textarea className="popup-body"
          rows={5}
          value={pill.popup_body_en || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "popup_body_en", e.target.value)
          }
        />
        

        <label>Popup Body (Tagalog)</label>
        <textarea className="popup-body"
          rows={5}
          value={pill.popup_body_tl || ""}
          onChange={(e) =>
            updatePill(index, pillIndex, "popup_body_tl", e.target.value)
          }
        />
</div>
       
      </div>
    ))}
  </>
)}
          <h5>{part.type}</h5>

          {part.title_en !== undefined && (
            <>
            <div>  <label>Title (English)</label>
              <input className="title"
                value={part.title_en}
                onChange={(e) =>
                  updatePart(index, "title_en", e.target.value)
                }
              />

              <label>Title (Tagalog)</label>
              <input className="title"
                value={part.title_tl}
                onChange={(e) =>
                  updatePart(index, "title_tl", e.target.value)
                }
              />
              </div>
            </>
          )}

          {part.text_en !== undefined && (
            <>
              <label>Text (English)</label>
              <textarea className="text"
                value={part.text_en}
                onChange={(e) =>
                  updatePart(index, "text_en", e.target.value)
                }
              />

              <label>Text (Tagalog)</label>
              <textarea className="text"
                value={part.text_tl}
                onChange={(e) =>
                  updatePart(index, "text_tl", e.target.value)
                }
              />
            </>
          )}

          {part.asset_key !== undefined && (
            <>
              
            </>
          )}

          {part.url !== undefined && (
            <>
             <div> <label>URL</label>
              <input className="url"
                value={part.url}
                onChange={(e) => updatePart(index, "url", e.target.value)}
              />
</div>
              <label>Organization</label>
              <input className="org"
                value={part.organization}
                onChange={(e) =>
                  updatePart(index, "organization", e.target.value)
                }
              />

             

              <label>Title</label>
              <input className="title"
                value={part.title}
                onChange={(e) =>
                  updatePart(index, "title", e.target.value)
                }
              />
            </>
          )}

          {part.lines_en && (
            <>
              <h6>Lines (English)</h6>
              {part.lines_en.map((line, i) => (
                <input className="line"
                  key={i}
                  value={line}
                  onChange={(e) =>
                    updatePartLine(index, i, "lines_en", e.target.value)
                  }
                />
              ))}

              <h6>Lines (Tagalog)</h6>
              {part.lines_tl.map((line, i) => (
                <input className="line"
                  key={i}
                  value={line}
                  onChange={(e) =>
                    updatePartLine(index, i, "lines_tl", e.target.value)
                  }
                />
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  );
}