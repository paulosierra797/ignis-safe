import React from 'react';
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';
import './fireclass.css';

function ArrayEditorField({ label, language, items, onChange }) {
  return (
    <EditorField label={label} language={language}>
      <div className="module-editor-repeater-list">
        {(items || []).map((item, index) => (
          <div className="module-editor-repeater-row" key={index}>
            <span>{index + 1}</span>
            <input
              className="examples"
              value={item}
              onChange={(event) => {
                const updated = [...items];
                updated[index] = event.target.value;
                onChange(updated);
              }}
            />
          </div>
        ))}
      </div>
    </EditorField>
  );
}

export default function FireClassDetailsEditor({ detail, guide, updateDetail, updateGuide }) {
  const safeGuide = guide || {
    examples_en: [],
    examples_tl: [],
    agents_en: [],
    agents_tl: []
  };

  return (
    <div className="fire-details-section">
      <BilingualGrid>
        <EditorField label="Title" language="English">
          <input
            className="title"
            value={detail.title_en || ''}
            onChange={(event) => updateDetail('title_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Title" language="Tagalog">
          <input
            className="title"
            value={detail.title_tl || ''}
            onChange={(event) => updateDetail('title_tl', event.target.value)}
          />
        </EditorField>
        <EditorField label="Description" language="English">
          <textarea
            className="desc"
            value={detail.description_en || ''}
            onChange={(event) => updateDetail('description_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Description" language="Tagalog">
          <textarea
            className="desc"
            value={detail.description_tl || ''}
            onChange={(event) => updateDetail('description_tl', event.target.value)}
          />
        </EditorField>
        <EditorField label="Note" language="English">
          <textarea
            className="desc"
            value={detail.note_en || ''}
            onChange={(event) => updateDetail('note_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Note" language="Tagalog">
          <textarea
            className="desc"
            value={detail.note_tl || ''}
            onChange={(event) => updateDetail('note_tl', event.target.value)}
          />
        </EditorField>
        <EditorField label="Section 1 Title" language="English">
          <input
            className="title"
            value={detail.section1_title_en || ''}
            onChange={(event) => updateDetail('section1_title_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Section 1 Title" language="Tagalog">
          <input
            className="title"
            value={detail.section1_title_tl || ''}
            onChange={(event) => updateDetail('section1_title_tl', event.target.value)}
          />
        </EditorField>
        <EditorField label="Section 2 Title" language="English">
          <input
            className="title"
            value={detail.section2_title_en || ''}
            onChange={(event) => updateDetail('section2_title_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Section 2 Title" language="Tagalog">
          <input
            className="title"
            value={detail.section2_title_tl || ''}
            onChange={(event) => updateDetail('section2_title_tl', event.target.value)}
          />
        </EditorField>
        <ArrayEditorField
          label="Examples"
          language="English"
          items={safeGuide.examples_en}
          onChange={(value) => updateGuide('examples_en', value)}
        />
        <ArrayEditorField
          label="Examples"
          language="Tagalog"
          items={safeGuide.examples_tl}
          onChange={(value) => updateGuide('examples_tl', value)}
        />
        <ArrayEditorField
          label="Agents"
          language="English"
          items={safeGuide.agents_en}
          onChange={(value) => updateGuide('agents_en', value)}
        />
        <ArrayEditorField
          label="Agents"
          language="Tagalog"
          items={safeGuide.agents_tl}
          onChange={(value) => updateGuide('agents_tl', value)}
        />
      </BilingualGrid>
    </div>
  );
}
