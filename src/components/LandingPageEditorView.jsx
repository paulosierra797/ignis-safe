import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import Sidebar from './Sidebar';
import PageHeader from './PageHeader';
import LandingContentEditor from './LandingContentEditor';
import './AppDialog.css';
import './LandingPageEditorView.css';

export default function LandingPageEditorView() {
  const editorRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const bypassNavigationRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showExitPrompt, setShowExitPrompt] = useState(false);

  const shouldBlockNavigation = useCallback(({ currentLocation, nextLocation }) => {
    if (bypassNavigationRef.current) {
      bypassNavigationRef.current = false;
      return false;
    }

    const currentPath = `${currentLocation.pathname}${currentLocation.search}${currentLocation.hash}`;
    const nextPath = `${nextLocation.pathname}${nextLocation.search}${nextLocation.hash}`;
    return isDirty && currentPath !== nextPath;
  }, [isDirty]);

  const blocker = useBlocker(shouldBlockNavigation);

  useEffect(() => {
    if (!isDirty) return undefined;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const requestNavigation = (navigation) => {
    if (!isDirty) {
      navigation.action();
      return;
    }

    pendingNavigationRef.current = navigation;
    setShowExitPrompt(true);
  };

  const closeExitPrompt = () => {
    pendingNavigationRef.current = null;
    setShowExitPrompt(false);
    if (blocker.state === 'blocked') blocker.reset();
  };

  const discardAndLeave = () => {
    const pendingNavigation = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    editorRef.current?.discardUnsavedChanges();
    setIsDirty(false);
    setShowExitPrompt(false);

    if (blocker.state === 'blocked') {
      blocker.proceed();
      return;
    }

    if (pendingNavigation) {
      bypassNavigationRef.current = true;
      pendingNavigation.action();
    }
  };

  return (
    <div className="landing-page-editor-view">
      <Sidebar variant="admin" onNavigationRequest={requestNavigation} />

      <div className="landing-page-editor-main">
        <PageHeader
          title="Landing Page Editor"
          variant="admin"
          onNavigationRequest={requestNavigation}
        />

        <LandingContentEditor
          embedded
          visualMode
          ref={editorRef}
          onDirtyChange={setIsDirty}
        />
      </div>

      {(showExitPrompt || blocker.state === 'blocked') && (
        <div
          className="app-unsaved-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="landing-editor-exit-title"
          aria-describedby="landing-editor-exit-description"
        >
          <div className="app-unsaved-dialog">
            <div className="app-unsaved-icon" aria-hidden="true">!</div>
            <h3 id="landing-editor-exit-title" className="app-unsaved-title">
              Leave Landing Page Editor?
            </h3>
            <p id="landing-editor-exit-description" className="app-unsaved-message">
              You have unpublished changes. Leaving now will discard them.
            </p>
            <div className="app-unsaved-actions">
              <button
                type="button"
                className="app-unsaved-button app-unsaved-button--discard"
                onClick={discardAndLeave}
              >
                Discard and Leave
              </button>
              <button
                type="button"
                className="app-unsaved-button app-unsaved-button--cancel"
                onClick={closeExitPrompt}
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
