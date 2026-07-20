import React from 'react';
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';
import './LessonSection.css';

export default function LessonSectionEditor({ block, page, editedModule, setEditedModule }) {
  const metadata = block.metadata || {};

  const updateMetadata = (field, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) =>
          candidate.id === block.id
            ? { ...candidate, metadata: { ...candidate.metadata, [field]: value } }
            : candidate
        )
      };
    });

    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  const updateBullet = (language, index, value) => {
    const field = `bullets_${language}`;
    const bullets = [...(metadata[field] || [])];
    bullets[index] = value;
    updateMetadata(field, bullets);
  };

  const renderBodyPair = (englishField, tagalogField, label) => (
    <BilingualGrid>
      <EditorField label={label} language="English">
        <textarea
          className="lesson-textarea"
          value={metadata[englishField] || ''}
          onChange={(event) => updateMetadata(englishField, event.target.value)}
        />
      </EditorField>
      <EditorField label={label} language="Tagalog">
        <textarea
          className="lesson-textarea"
          value={metadata[tagalogField] || ''}
          onChange={(event) => updateMetadata(tagalogField, event.target.value)}
        />
      </EditorField>
    </BilingualGrid>
  );

  return (
    <div className="lesson-editor">
      {metadata.content_kind === 'image_row' && (
        <div className="module-editor-stack">
          {renderBodyPair('body_en', 'body_tl', 'Body')}
          {renderBodyPair('body_secondary_en', 'body_secondary_tl', 'Secondary Body')}
        </div>
      )}

      {metadata.content_kind === 'bullets' && (
        <BilingualGrid>
          <EditorField label="Bullet Items" language="English">
            <div className="module-editor-repeater-list">
              {(metadata.bullets_en || []).map((bullet, index) => (
                <div className="module-editor-repeater-row" key={`en-${index}`}>
                  <span>{index + 1}</span>
                  <textarea
                    className="lesson-textarea"
                    value={bullet}
                    onChange={(event) => updateBullet('en', index, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </EditorField>
          <EditorField label="Bullet Items" language="Tagalog">
            <div className="module-editor-repeater-list">
              {(metadata.bullets_tl || []).map((bullet, index) => (
                <div className="module-editor-repeater-row" key={`tl-${index}`}>
                  <span>{index + 1}</span>
                  <textarea
                    className="lesson-textarea"
                    value={bullet}
                    onChange={(event) => updateBullet('tl', index, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </EditorField>
        </BilingualGrid>
      )}

      {metadata.content_kind === 'body' && renderBodyPair('body_en', 'body_tl', 'Body')}

      {metadata.content_kind === 'body_action' && (
        <div className="module-editor-stack">
          {renderBodyPair('body_en', 'body_tl', 'Body')}
          <BilingualGrid>
            <EditorField label="Button Label" language="English">
              <input
                className="lesson-input"
                value={metadata.action_label_en || ''}
                onChange={(event) => updateMetadata('action_label_en', event.target.value)}
              />
            </EditorField>
            <EditorField label="Button Label" language="Tagalog">
              <input
                className="lesson-input"
                value={metadata.action_label_tl || ''}
                onChange={(event) => updateMetadata('action_label_tl', event.target.value)}
              />
            </EditorField>
          </BilingualGrid>
        </div>
      )}
    </div>
  );
}
