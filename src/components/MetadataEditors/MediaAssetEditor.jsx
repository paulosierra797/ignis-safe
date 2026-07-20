import React from 'react';
import { BilingualGrid, EditorField } from '../EditorUI/ModuleEditorUI';

export default function MediaAssetEditor({ asset, updateAsset, uploadFile }) {
  return (
    <div className="media-editor">
      {asset.asset_type === 'image' ? (
        <img
          src={asset.public_url}
          alt={asset.alt_en}
          className="media-preview"
        />
      ) : (
        <video className="media-preview" controls>
          <source src={asset.public_url} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      )}

      <EditorField label="Replace Media File" className="module-editor-full-field">
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(event) => uploadFile(asset, event.target.files[0])}
        />
      </EditorField>

      <BilingualGrid className="module-editor-full-field">
        <EditorField label="Alternative Text" language="English">
          <input
            value={asset.alt_en || ''}
            onChange={(event) => updateAsset('alt_en', event.target.value)}
          />
        </EditorField>
        <EditorField label="Alternative Text" language="Tagalog">
          <input
            value={asset.alt_tl || ''}
            onChange={(event) => updateAsset('alt_tl', event.target.value)}
          />
        </EditorField>
      </BilingualGrid>
    </div>
  );
}
