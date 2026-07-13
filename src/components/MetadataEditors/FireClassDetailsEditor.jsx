import React from "react";
import "./Fireclass.css";

export default function FireClassDetailsEditor({
  detail,
  guide,
  updateDetail,
  updateGuide
}) {
  return (
    <div className="metadata-editor">
      <h4>Fire Class Details</h4>

     <div> <label>Title (English)</label>
      <input className="title"
        value={detail.title_en || ""}
        onChange={(e) => updateDetail("title_en", e.target.value)}
      />

      <label>Title (Tagalog)</label>
      <input className="title"
        value={detail.title_tl || ""}
        onChange={(e) => updateDetail("title_tl", e.target.value)}
      /></div>
 <div>
      <label>Description (English)</label>
      <textarea className="desc"
        value={detail.description_en || ""}
        onChange={(e) =>
          updateDetail("description_en", e.target.value)
        }
      />

      <label>Description (Tagalog)</label>
      <textarea className="desc"
        value={detail.description_tl || ""}
        onChange={(e) =>
          updateDetail("description_tl", e.target.value)
        }
      />
</div>
 <div>
      <label>Note (English)</label>
      <textarea className="desc"
        value={detail.note_en || ""}
        onChange={(e) =>
          updateDetail("note_en", e.target.value)
        }
      />

      <label>Note (Tagalog)</label>
      <textarea className="desc"
        value={detail.note_tl || ""}
        onChange={(e) =>
          updateDetail("note_tl", e.target.value)
        }
      />
</div>
 <div>
      <label>Section 1 Title (English)</label>
      <input className="title"
        value={detail.section1_title_en || ""}
        onChange={(e) =>
          updateDetail("section1_title_en", e.target.value)
        }
      />

      <label>Section 1 Title (Tagalog)</label>
      <input className="title"
        value={detail.section1_title_tl || ""}
        onChange={(e) =>
          updateDetail("section1_title_tl", e.target.value)
        }
      />
 </div>
      <label>Section 2 Title (English)</label>
      <input className="title"
        value={detail.section2_title_en || ""}
        onChange={(e) =>
          updateDetail("section2_title_en", e.target.value)
        }
      />

      <label>Section 2 Title (Tagalog)</label>
      <input className="title"
        value={detail.section2_title_tl || ""}
        onChange={(e) =>
          updateDetail("section2_title_tl", e.target.value)
        }
      />
       <div>
      <label>Examples (English)</label>

{guide.examples_en.map((item, index) => (
    <input className="examples"
        key={index}
        value={item}
        onChange={(e) => {
            const updated = [...guide.examples_en];
            updated[index] = e.target.value;
            updateGuide("examples_en", updated);
        }}
    />
))}
 </div>
<label>Examples (Tagalog)</label>

{guide.examples_tl.map((item, index) => (
    <input className="examples"
        key={index}
        value={item}
        onChange={(e) => {
            const updated = [...guide.examples_tl];
            updated[index] = e.target.value;
            updateGuide("examples_tl", updated);
        }}
    />
))}
 <div>
<label>Agents (English)</label>

{guide.agents_en.map((item, index) => (
    <input className="examples"
        key={index}
        value={item}
        onChange={(e) => {
            const updated = [...guide.agents_en];
            updated[index] = e.target.value;
            updateGuide("agents_en", updated);
        }}
    />
))}
 </div>
<label>Agents (Tagalog)</label>

{guide.agents_tl.map((item, index) => (
    <input className="examples"
        key={index}
        value={item}
        onChange={(e) => {
            const updated = [...guide.agents_tl];
            updated[index] = e.target.value;
            updateGuide("agents_tl", updated);
        }}
    />
))}
    </div>
  );
}