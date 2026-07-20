import  "./LearningMaterials.css";
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';

export default function LearningMaterialTextsEditor({
  text,
  updateText
}) {
  return (
    <div className="learning-material-text-card">
  <BilingualGrid>
    <EditorField label="Learning Material Text" language="English">
      <textarea
        className="material-text"
        value={text.text_en || ""}
        onChange={(e) => updateText("text_en", e.target.value)}
      />
    </EditorField>
    <EditorField label="Learning Material Text" language="Tagalog">
      <textarea
        className="material-text"
        value={text.text_tl || ""}
        onChange={(e) => updateText("text_tl", e.target.value)}
      />
    </EditorField>
  </BilingualGrid>
</div>
  );
}
