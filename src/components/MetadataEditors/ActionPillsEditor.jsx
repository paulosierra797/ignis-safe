import React from "react";
import "./ActionPillsEditor.css";

export default function ActionPillsEditor({
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

  const updatePill = (index, field, value) => {
    const updatedPages = editedModule.pages.map((p) => {
      if (p.page_no !== page.page_no) return p;

      return {
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== block.id) return b;

          const pills = [...(b.metadata.pills || [])];

          pills[index] = {
            ...pills[index],
            [field]: value,
          };

          return {
            ...b,
            metadata: {
              ...b.metadata,
              pills,
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

  const updateWideCard = (field, value) => {
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
                  wide_card: {
                    ...b.metadata.wide_card,
                    [field]: value,
                  },
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
      <h4>Action Pills</h4>

      <h5>Pills</h5>

      {(metadata.pills || []).map((pill, index) => (
        <div
          key={index}
          style={{
            border: "1px solid #ddd",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "8px",
          }}
        >
          <h5>Pill {index + 1}</h5>

          <div><label>Label (English)</label></div>
          <input className="label"
            type="text"
            value={pill.label_en || ""}
            onChange={(e) =>
              updatePill(index, "label_en", e.target.value)
            }
          />

          <div><label>Label (Tagalog)</label></div>
          <input
            type="text"
            value={pill.label_tl || ""}
            onChange={(e) =>
              updatePill(index, "label_tl", e.target.value)
            }
          />

         

          <div><label>Popup Title (English)</label></div>
          <input
            type="text"
            value={pill.popup_title_en || ""}
            onChange={(e) =>
              updatePill(index, "popup_title_en", e.target.value)
            }
          />

          <div><label>Popup Title (Tagalog)</label></div>
          <input
            type="text"
            value={pill.popup_title_tl || ""}
            onChange={(e) =>
              updatePill(index, "popup_title_tl", e.target.value)
            }
          />

          <div><label>Popup Body (English)</label></div>
          <textarea classname="popup-body"
            value={pill.popup_body_en || ""}
            onChange={(e) =>
              updatePill(index, "popup_body_en", e.target.value)
            }
          />

          <div><label>Popup Body (Tagalog)</label></div>
          <textarea classname="popup-body"
            value={pill.popup_body_tl || ""}
            onChange={(e) =>
              updatePill(index, "popup_body_tl", e.target.value)
            }
          />
        </div>
      ))}

      <hr />

      <h4>Wide Card</h4>

      <label>Title (English)</label>
      <input className="widecard-title"
        type="text"
        value={metadata.wide_card?.title_en || ""}
        onChange={(e) =>
          updateWideCard("title_en", e.target.value)
        }
      />

      <label>Title (Tagalog)</label>
      <input
        type="text"
        value={metadata.wide_card?.title_tl || ""}
        onChange={(e) =>
          updateWideCard("title_tl", e.target.value)
        }
      />

      <label>Subtitle (English)</label>
      <textarea
        value={metadata.wide_card?.subtitle_en || ""}
        onChange={(e) =>
          updateWideCard("subtitle_en", e.target.value)
        }
      />

      <label>Subtitle (Tagalog)</label>
      <textarea
        value={metadata.wide_card?.subtitle_tl || ""}
        onChange={(e) =>
          updateWideCard("subtitle_tl", e.target.value)
        }
      />

      
    </div>
  );
}