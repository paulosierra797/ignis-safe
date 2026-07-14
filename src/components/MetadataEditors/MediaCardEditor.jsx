import React from "react";
import "./MediaCard.css";

export default function MediaCardEditor({
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

  const updatePassStep = (index, field, value) => {
    const updatedPages = editedModule.pages.map((p) => {
      if (p.page_no !== page.page_no) return p;

      return {
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== block.id) return b;

          const steps = [...(b.metadata.pass_steps || [])];
          steps[index] = {
            ...steps[index],
            [field]: value,
          };

          return {
            ...b,
            metadata: {
              ...b.metadata,
              pass_steps: steps,
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
  <h4>Model Viewer</h4>

  <div className="language-grid">
    {/* English */}
    <div className="language-card">
      <h4>English</h4>

      <div className="field">
        <label>Model Badge (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.model_badge_en || ""}
          onChange={(e) => updateMetadata("model_badge_en", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Viewer Title (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.viewer_title_en || ""}
          onChange={(e) => updateMetadata("viewer_title_en", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Viewer Subtitle (English)</label>
        <textarea
          className="desc1"
          value={metadata.viewer_subtitle_en || ""}
          onChange={(e) =>
            updateMetadata("viewer_subtitle_en", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Subtitle (English)</label>
        <textarea
          className="desc1"
          value={metadata.subtitle_en || ""}
          onChange={(e) => updateMetadata("subtitle_en", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Interaction Hint (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.interaction_hint_en || ""}
          onChange={(e) =>
            updateMetadata("interaction_hint_en", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Model Alt (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.model_alt_en || ""}
          onChange={(e) => updateMetadata("model_alt_en", e.target.value)}
        />
      </div>

      <div className="field">
        <label>PASS Heading (English)</label>
        <input
          className="title"
          type="text"
          value={metadata.pass_heading_en || ""}
          onChange={(e) => updateMetadata("pass_heading_en", e.target.value)}
        />
      </div>
    </div>

    {/* Tagalog */}
    <div className="language-card">
      <h4>Tagalog</h4>

      <div className="field">
        <label>Model Badge (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.model_badge_tl || ""}
          onChange={(e) => updateMetadata("model_badge_tl", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Viewer Title (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.viewer_title_tl || ""}
          onChange={(e) => updateMetadata("viewer_title_tl", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Viewer Subtitle (Tagalog)</label>
        <textarea
          className="desc1"
          value={metadata.viewer_subtitle_tl || ""}
          onChange={(e) =>
            updateMetadata("viewer_subtitle_tl", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Subtitle (Tagalog)</label>
        <textarea
          className="desc1"
          value={metadata.subtitle_tl || ""}
          onChange={(e) => updateMetadata("subtitle_tl", e.target.value)}
        />
      </div>

      <div className="field">
        <label>Interaction Hint (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.interaction_hint_tl || ""}
          onChange={(e) =>
            updateMetadata("interaction_hint_tl", e.target.value)
          }
        />
      </div>

      <div className="field">
        <label>Model Alt (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.model_alt_tl || ""}
          onChange={(e) => updateMetadata("model_alt_tl", e.target.value)}
        />
      </div>

      <div className="field">
        <label>PASS Heading (Tagalog)</label>
        <input
          className="title"
          type="text"
          value={metadata.pass_heading_tl || ""}
          onChange={(e) => updateMetadata("pass_heading_tl", e.target.value)}
        />
      </div>
    </div>
 

  

  {/* PASS Steps... */}
</div>



      <hr />

      <h4>PASS Steps</h4>

{(metadata.pass_steps || []).map((step, index) => (
  <div className="pass-step" key={index}>
    <h5>Step {index + 1}</h5>

    <div className="field letter-field">
      <label>Letter</label>
      <input
        className="letters"
        type="text"
        value={step.letter || ""}
        onChange={(e) =>
          updatePassStep(index, "letter", e.target.value)
        }
      />
    </div>

    <div className="step-grid">
      <div>
        <div className="field">
          <label>Title (English)</label>
          <input
            className="title"
            type="text"
            value={step.title_en || ""}
            onChange={(e) =>
              updatePassStep(index, "title_en", e.target.value)
            }
          />
        </div>

        <div className="field">
          <label>Description (English)</label>
          <textarea
            className="desc"
            value={step.desc_en || ""}
            onChange={(e) =>
              updatePassStep(index, "desc_en", e.target.value)
            }
          />
        </div>
      </div>

      <div>
        <div className="field">
          <label>Title (Tagalog)</label>
          <input
            className="title"
            type="text"
            value={step.title_tl || ""}
            onChange={(e) =>
              updatePassStep(index, "title_tl", e.target.value)
            }
          />
        </div>

        <div className="field">
          <label>Description (Tagalog)</label>
          <textarea
            className="desc"
            value={step.desc_tl || ""}
            onChange={(e) =>
              updatePassStep(index, "desc_tl", e.target.value)
            }
          />
        </div>
      </div>
    </div>
  </div>
))}
</div>
);
}