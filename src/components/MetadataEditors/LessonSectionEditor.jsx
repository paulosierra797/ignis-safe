import React from "react";
import "./LessonSection.css";

export default function LessonSectionEditor({
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

  const updateBullet = (lang, index, value) => {
    const field = `bullets_${lang}`;

    const bullets = [...(metadata[field] || [])];
    bullets[index] = value;

    updateMetadata(field, bullets);
  };

  return (
   <div className="lesson-editor">

      {/* IMAGE ROW */}
      {metadata.content_kind === "image_row" && (
        <>
          <label>Body (English)</label>
          <textarea
           className="lesson-textarea"
            value={metadata.body_en || ""}
            onChange={(e) =>
              updateMetadata("body_en", e.target.value)
            }
          />

          <label>Body (Tagalog)</label>
          <textarea
           className="lesson-textarea"
            value={metadata.body_tl || ""}
            onChange={(e) =>
              updateMetadata("body_tl", e.target.value)
            }
          />

          <label>Secondary Body (English)</label>
          <textarea
           className="lesson-textarea"
            value={metadata.body_secondary_en || ""}
            onChange={(e) =>
              updateMetadata("body_secondary_en", e.target.value)
            }
          />

          <label>Secondary Body (Tagalog)</label>
          <textarea
           className="lesson-textarea"
            value={metadata.body_secondary_tl || ""}
            onChange={(e) =>
              updateMetadata("body_secondary_tl", e.target.value)
            }
          />
        </>
      )}

      {/* BULLETS */}
      {metadata.content_kind === "bullets" && (
        <>
          <h4>English Bullets</h4>

          {(metadata.bullets_en || []).map((bullet, index) => (
            <textarea
             className="lesson-textarea"
              key={`en-${index}`}
              value={bullet}
              onChange={(e) =>
                updateBullet("en", index, e.target.value)
              }
            />
          ))}

          <h4>Tagalog Bullets</h4>

          {(metadata.bullets_tl || []).map((bullet, index) => (
            <textarea
             className="lesson-textarea"
              key={`tl-${index}`}
              value={bullet}
              onChange={(e) =>
                updateBullet("tl", index, e.target.value)
              }
            />
          ))}
        </>
      )}

      {metadata.content_kind === "body" && (
  <>
    <label>Body (English)</label>
    <textarea
     className="lesson-textarea"
      value={metadata.body_en || ""}
      onChange={(e) =>
        updateMetadata("body_en", e.target.value)
      }
    />

    <label>Body (Tagalog)</label>
    <textarea
     className="lesson-textarea"
      value={metadata.body_tl || ""}
      onChange={(e) =>
        updateMetadata("body_tl", e.target.value)
      }
    />
  </>
)}
{metadata.content_kind === "body_action" && (
  <>
    <label>Body (English)</label>
    <textarea
     className="lesson-textarea"
      value={metadata.body_en || ""}
      onChange={(e) =>
        updateMetadata("body_en", e.target.value)
      }
    />

    <label>Body (Tagalog)</label>
    <textarea
     className="lesson-textarea"
      value={metadata.body_tl || ""}
      onChange={(e) =>
        updateMetadata("body_tl", e.target.value)
      }
    />

    <label>Button Label (English)</label>
    <input
     className="lesson-input"
      value={metadata.action_label_en || ""}
      onChange={(e) =>
        updateMetadata("action_label_en", e.target.value)
      }
    />

    <label>Button Label (Tagalog)</label>
    <input
     className="lesson-input"
      value={metadata.action_label_tl || ""}
      onChange={(e) =>
        updateMetadata("action_label_tl", e.target.value)
      }
    />
  </>
)}

    </div>
  );
}