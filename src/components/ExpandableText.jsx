import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line no-unused-vars -- Tag is used as a JSX element name below
function ExpandableText({ text, as: Tag = 'div', lines = 2, className = '', emptyFallback = null }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded) {
      return undefined;
    }

    const checkOverflow = () => {
      setCanExpand(el.scrollHeight - el.clientHeight > 1);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, [text, expanded]);

  if (!text) {
    return emptyFallback;
  }

  return (
    <div className="expandable-text-wrap">
      <Tag
        ref={textRef}
        className={`expandable-text ${expanded ? 'expandable-text-expanded' : ''} ${className}`.trim()}
        style={expanded ? undefined : { WebkitLineClamp: lines }}
      >
        {text}
      </Tag>
      {canExpand && (
        <button
          type="button"
          className="expandable-text-toggle"
          onClick={() => setExpanded((previous) => !previous)}
        >
          {expanded ? 'See Less' : 'See More'}
        </button>
      )}
    </div>
  );
}

export default ExpandableText;
