import React from "react";
import PageBannerEditor from "./PageBannerEditor";
import MediaCardEditor from "./MediaCardEditor";
import DidYouKnowEditor from "./DidYouKnowEditor";
import ContentSectionEditor from "./ContentSectionEditor";
import ActionPillsEditor from "./ActionPillsEditor";
import PassStepEditor from "./PassStepEditor";
import CalloutEditor from "./CalloutEditor";
import LessonSectionEditor from "./LessonSectionEditor";
export default function MetadataEditor({
  moduleNo,
  block,
  page,
  editedModule,
  setEditedModule
}) {

  // Module 4 editors
  if (moduleNo === 4) {
    switch (block.block_type) {
      case "lesson_section":
        return (
          <LessonSectionEditor
            block={block}
            page={page}
            editedModule={editedModule}
            setEditedModule={setEditedModule}
          />
        );

      default:
        return (
          <div className="learning-material-metadata-preview">
            <p>No metadata editor available for:</p>
            <code>{block.block_type}</code>
          </div>
        );
    }
  }

  // Module 1 editors
  if (moduleNo !== 1) {
    return null;
  }

  switch (block.block_type) {
    case "page_banner":
      return (
        <PageBannerEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "media_card":
      return (
        <MediaCardEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "did_you_know":
      return (
        <DidYouKnowEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "expandable_lesson":
      return (
        <ContentSectionEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "action_pills":
      return (
        <ActionPillsEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "pass_step":
      return (
        <PassStepEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    case "callout":
      return (
        <CalloutEditor
          block={block}
          page={page}
          editedModule={editedModule}
          setEditedModule={setEditedModule}
        />
      );

    default:
      return (
        <div className="learning-material-metadata-preview">
          <p>No metadata editor available for:</p>
          <code>{block.block_type}</code>
        </div>
      );
  }
}