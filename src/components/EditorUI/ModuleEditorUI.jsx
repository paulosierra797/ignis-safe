import React, { useState } from 'react';

const joinClasses = (...classes) => classes.filter(Boolean).join(' ');

export function EditorSection({
  title,
  description,
  eyebrow,
  collapsible = false,
  defaultOpen = true,
  className,
  children
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const heading = (
    <div className="module-editor-section-heading">
      <div>
        {eyebrow && <span className="module-editor-section-eyebrow">{eyebrow}</span>}
        <h3>{title}</h3>
        {description && <p>{description}</p>}
      </div>
      {collapsible && <span className="module-editor-collapse-icon" aria-hidden="true">⌄</span>}
    </div>
  );

  if (collapsible) {
    return (
      <details
        className={joinClasses('module-editor-section', 'module-editor-section-collapsible', className)}
        open={isOpen}
        onToggle={(event) => setIsOpen(event.currentTarget.open)}
      >
        <summary>{heading}</summary>
        <div className="module-editor-section-body">{children}</div>
      </details>
    );
  }

  return (
    <section className={joinClasses('module-editor-section', className)}>
      {heading}
      <div className="module-editor-section-body">{children}</div>
    </section>
  );
}

export function BilingualGrid({ children, className }) {
  return <div className={joinClasses('module-editor-bilingual-grid', className)}>{children}</div>;
}

export function EditorField({ label, language, hint, className, children }) {
  return (
    <div className={joinClasses('module-editor-field', className)}>
      <div className="module-editor-field-label">
        <span>{label}</span>
        {language && <span className="module-editor-language-badge">{language}</span>}
      </div>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function EditorItemCard({ number, label, meta, className, children }) {
  return (
    <article className={joinClasses('module-editor-item-card', className)}>
      <header className="module-editor-item-card-header">
        {number !== undefined && <span className="module-editor-item-number">{number}</span>}
        <div>
          <h4>{label}</h4>
          {meta && <p>{meta}</p>}
        </div>
      </header>
      <div className="module-editor-item-card-body">{children}</div>
    </article>
  );
}
