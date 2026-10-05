import Header from './Header';
import Footer from './Footer';
import LandingPageSections from './LandingPageSections';
import { LandingContentPreviewProvider } from '../context/LandingContentContext';
import './LandingPreview.css';

function LandingPageCanvas({ editorMode, onEditItem }) {
  const handleCanvasClick = (event) => {
    if (!editorMode) return;
    if (event.target.closest('[data-landing-editor-control="true"]')) return;

    const textTarget = event.target.closest('[data-landing-edit-path]');
    if (textTarget) {
      event.preventDefault();
      event.stopPropagation();
      onEditItem?.({
        path: textTarget.dataset.landingEditPath,
        label: textTarget.dataset.landingEditLabel || 'Landing page content',
        multiline: textTarget.dataset.landingEditMultiline === 'true',
        lines: textTarget.dataset.landingEditLines === 'true',
        secondaryPath: textTarget.dataset.landingEditSecondaryPath || '',
        secondaryLabel: textTarget.dataset.landingEditSecondaryLabel || '',
      });
      return;
    }

    if (event.target.closest('a, button')) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return (
    <div className={`landing-inline-page${editorMode ? ' is-edit-mode' : ' is-view-mode'}`} onClickCapture={handleCanvasClick}>
      <Header />
      <main id="main-content">
        <LandingPageSections editMode={editorMode} />
      </main>
      <Footer />
    </div>
  );
}

export default function LandingPreview({
  content,
  editorMode = false,
  onEditItem,
}) {
  return (
    <div className="landing-live-editor-canvas">
      <LandingContentPreviewProvider content={content}>
        <LandingPageCanvas
          editorMode={editorMode}
          onEditItem={onEditItem}
        />
      </LandingContentPreviewProvider>
    </div>
  );
}
