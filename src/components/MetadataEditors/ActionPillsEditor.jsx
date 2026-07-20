import React from 'react';
import { BilingualGrid, EditorField, EditorItemCard } from '../EditorUI/ModuleEditorUI';
import './ActionPillsEditor.css';

export default function ActionPillsEditor({ block, page, editedModule, setEditedModule }) {
  const metadata = block.metadata || {};

  const updatePill = (index, field, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) => {
          if (candidate.id !== block.id) return candidate;
          const pills = [...(candidate.metadata.pills || [])];
          pills[index] = { ...pills[index], [field]: value };
          return { ...candidate, metadata: { ...candidate.metadata, pills } };
        })
      };
    });
    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  const updateWideCard = (field, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) =>
          candidate.id === block.id
            ? {
                ...candidate,
                metadata: {
                  ...candidate.metadata,
                  wide_card: { ...candidate.metadata.wide_card, [field]: value }
                }
              }
            : candidate
        )
      };
    });
    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  return (
    <div className="metadata-editor metadata-pills-section">
      <div className="module-editor-item-list">
        {(metadata.pills || []).map((pill, index) => (
          <EditorItemCard key={index} number={index + 1} label="Action Pill">
            <BilingualGrid>
              <EditorField label="Label" language="English">
                <input
                  className="pill-input"
                  value={pill.label_en || ''}
                  onChange={(event) => updatePill(index, 'label_en', event.target.value)}
                />
              </EditorField>
              <EditorField label="Label" language="Tagalog">
                <input
                  className="pill-input"
                  value={pill.label_tl || ''}
                  onChange={(event) => updatePill(index, 'label_tl', event.target.value)}
                />
              </EditorField>
              <EditorField label="Popup Title" language="English">
                <input
                  className="pill-input"
                  value={pill.popup_title_en || ''}
                  onChange={(event) => updatePill(index, 'popup_title_en', event.target.value)}
                />
              </EditorField>
              <EditorField label="Popup Title" language="Tagalog">
                <input
                  className="pill-input"
                  value={pill.popup_title_tl || ''}
                  onChange={(event) => updatePill(index, 'popup_title_tl', event.target.value)}
                />
              </EditorField>
              <EditorField label="Popup Body" language="English">
                <textarea
                  className="pill-textarea"
                  value={pill.popup_body_en || ''}
                  onChange={(event) => updatePill(index, 'popup_body_en', event.target.value)}
                />
              </EditorField>
              <EditorField label="Popup Body" language="Tagalog">
                <textarea
                  className="pill-textarea"
                  value={pill.popup_body_tl || ''}
                  onChange={(event) => updatePill(index, 'popup_body_tl', event.target.value)}
                />
              </EditorField>
            </BilingualGrid>
          </EditorItemCard>
        ))}

        <EditorItemCard label="Wide Card">
          <BilingualGrid>
            <EditorField label="Title" language="English">
              <input
                className="widecard-title"
                value={metadata.wide_card?.title_en || ''}
                onChange={(event) => updateWideCard('title_en', event.target.value)}
              />
            </EditorField>
            <EditorField label="Title" language="Tagalog">
              <input
                className="widecard-title"
                value={metadata.wide_card?.title_tl || ''}
                onChange={(event) => updateWideCard('title_tl', event.target.value)}
              />
            </EditorField>
            <EditorField label="Subtitle" language="English">
              <textarea
                className="widecard-subtitle"
                value={metadata.wide_card?.subtitle_en || ''}
                onChange={(event) => updateWideCard('subtitle_en', event.target.value)}
              />
            </EditorField>
            <EditorField label="Subtitle" language="Tagalog">
              <textarea
                className="widecard-subtitle"
                value={metadata.wide_card?.subtitle_tl || ''}
                onChange={(event) => updateWideCard('subtitle_tl', event.target.value)}
              />
            </EditorField>
          </BilingualGrid>
        </EditorItemCard>
      </div>
    </div>
  );
}
