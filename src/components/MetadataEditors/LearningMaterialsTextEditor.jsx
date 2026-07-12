export default function LearningMaterialTextsEditor({
  text,
  updateText
}) {
  return (
    <div className="learning-material-text-card">
      <h4>{text.text_key}</h4>

      <label>English</label>
      <textarea
        value={text.text_en || ""}
        onChange={(e) =>
          updateText("text_en", e.target.value)
        }
      />

      <label>Tagalog</label>
      <textarea
        value={text.text_tl || ""}
        onChange={(e) =>
          updateText("text_tl", e.target.value)
        }
      />
    </div>
  );
}