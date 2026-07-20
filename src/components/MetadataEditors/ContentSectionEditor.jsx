import React from 'react';
import { BilingualGrid, EditorField, EditorItemCard } from '../EditorUI/ModuleEditorUI';
import './ContentSection.css';

export default function ContentSectionEditor({ block, page, editedModule, setEditedModule }) {
  const metadata = block.metadata || {};

  const updatePart = (index, field, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) => {
          if (candidate.id !== block.id) return candidate;
          const parts = [...(candidate.metadata.parts || [])];
          parts[index] = { ...parts[index], [field]: value };
          return { ...candidate, metadata: { ...candidate.metadata, parts } };
        })
      };
    });
    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  const updatePartLine = (partIndex, lineIndex, language, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) => {
          if (candidate.id !== block.id) return candidate;
          const parts = [...(candidate.metadata.parts || [])];
          const lines = [...(parts[partIndex][language] || [])];
          lines[lineIndex] = value;
          parts[partIndex] = { ...parts[partIndex], [language]: lines };
          return { ...candidate, metadata: { ...candidate.metadata, parts } };
        })
      };
    });
    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  const updatePill = (partIndex, pillIndex, field, value) => {
    const updatedPages = editedModule.pages.map((entry) => {
      if (entry.page_no !== page.page_no) return entry;
      return {
        ...entry,
        blocks: entry.blocks.map((candidate) => {
          if (candidate.id !== block.id) return candidate;
          const parts = [...(candidate.metadata.parts || [])];
          const pills = [...(parts[partIndex].pills || [])];
          pills[pillIndex] = { ...pills[pillIndex], [field]: value };
          parts[partIndex] = { ...parts[partIndex], pills };
          return { ...candidate, metadata: { ...candidate.metadata, parts } };
        })
      };
    });
    setEditedModule({ ...editedModule, pages: updatedPages });
  };

  const renderPair = (index, label, englishField, tagalogField, type = 'input') => (
    <BilingualGrid>
      <EditorField label={label} language="English">
        {type === 'textarea' ? (
          <textarea
            value={metadata.parts[index][englishField] || ''}
            onChange={(event) => updatePart(index, englishField, event.target.value)}
          />
        ) : (
          <input
            value={metadata.parts[index][englishField] || ''}
            onChange={(event) => updatePart(index, englishField, event.target.value)}
          />
        )}
      </EditorField>
      <EditorField label={label} language="Tagalog">
        {type === 'textarea' ? (
          <textarea
            value={metadata.parts[index][tagalogField] || ''}
            onChange={(event) => updatePart(index, tagalogField, event.target.value)}
          />
        ) : (
          <input
            value={metadata.parts[index][tagalogField] || ''}
            onChange={(event) => updatePart(index, tagalogField, event.target.value)}
          />
        )}
      </EditorField>
    </BilingualGrid>
  );

  return (
    <div className="metadata-editor">
      <div className="module-editor-item-list">
        {(metadata.parts || []).map((part, index) => (
          <EditorItemCard
            key={index}
            number={index + 1}
            label={(part.type || 'Content part').replace(/_/g, ' ')}
          >
            {part.type === 'mini_headline' && renderPair(index, 'Headline', 'text_en', 'text_tl')}

            {part.type === 'action_pills' && (
              <div className="module-editor-item-list">
                {(part.pills || []).map((pill, pillIndex) => (
                  <EditorItemCard key={pillIndex} number={pillIndex + 1} label="Action Pill">
                    <BilingualGrid>
                      <EditorField label="Label" language="English">
                        <input
                          value={pill.label_en || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'label_en', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Label" language="Tagalog">
                        <input
                          value={pill.label_tl || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'label_tl', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Popup Title" language="English">
                        <input
                          value={pill.popup_title_en || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'popup_title_en', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Popup Title" language="Tagalog">
                        <input
                          value={pill.popup_title_tl || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'popup_title_tl', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Popup Body" language="English">
                        <textarea
                          className="popup-body"
                          value={pill.popup_body_en || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'popup_body_en', event.target.value)
                          }
                        />
                      </EditorField>
                      <EditorField label="Popup Body" language="Tagalog">
                        <textarea
                          className="popup-body"
                          value={pill.popup_body_tl || ''}
                          onChange={(event) =>
                            updatePill(index, pillIndex, 'popup_body_tl', event.target.value)
                          }
                        />
                      </EditorField>
                    </BilingualGrid>
                  </EditorItemCard>
                ))}
              </div>
            )}

            {part.title_en !== undefined && renderPair(index, 'Title', 'title_en', 'title_tl')}
            {part.text_en !== undefined && renderPair(index, 'Text', 'text_en', 'text_tl', 'textarea')}

            {part.url !== undefined && (
              <div className="module-editor-single-grid">
                <EditorField label="URL">
                  <input
                    className="url"
                    value={part.url || ''}
                    onChange={(event) => updatePart(index, 'url', event.target.value)}
                  />
                </EditorField>
                <EditorField label="Organization">
                  <input
                    className="org"
                    value={part.organization || ''}
                    onChange={(event) => updatePart(index, 'organization', event.target.value)}
                  />
                </EditorField>
                <EditorField label="Title">
                  <input
                    className="title"
                    value={part.title || ''}
                    onChange={(event) => updatePart(index, 'title', event.target.value)}
                  />
                </EditorField>
              </div>
            )}

            {part.lines_en && (
              <BilingualGrid>
                <EditorField label="Lines" language="English">
                  <div className="module-editor-repeater-list">
                    {part.lines_en.map((line, lineIndex) => (
                      <div className="module-editor-repeater-row" key={lineIndex}>
                        <span>{lineIndex + 1}</span>
                        <input
                          className="line"
                          value={line}
                          onChange={(event) =>
                            updatePartLine(index, lineIndex, 'lines_en', event.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </EditorField>
                <EditorField label="Lines" language="Tagalog">
                  <div className="module-editor-repeater-list">
                    {(part.lines_tl || []).map((line, lineIndex) => (
                      <div className="module-editor-repeater-row" key={lineIndex}>
                        <span>{lineIndex + 1}</span>
                        <input
                          className="line"
                          value={line}
                          onChange={(event) =>
                            updatePartLine(index, lineIndex, 'lines_tl', event.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </EditorField>
              </BilingualGrid>
            )}
          </EditorItemCard>
        ))}
      </div>
    </div>
  );
}
