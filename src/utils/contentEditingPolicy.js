// Content editors may change existing text, never asset references or structure.
export function projectExistingText(original, edited, canEdit, path = []) {
  if (Array.isArray(original)) {
    return original.map((value, index) => projectExistingText(
      value, Array.isArray(edited) ? edited[index] : undefined, canEdit, [...path, String(index)]
    ));
  }
  if (original && typeof original === 'object') {
    return Object.fromEntries(Object.entries(original).map(([key, value]) => [
      key, projectExistingText(value, edited?.[key], canEdit, [...path, key])
    ]));
  }
  return (typeof original === 'string' || original == null)
    && typeof edited === 'string' && canEdit(path) ? edited : original;
}

export function isLearningTextPath(path) {
  const field = path.findLast((part) => !/^\d+$/.test(part)) || '';
  return !/(?:url|path|asset|image|video|model|icon|key|type|id)(?:_en|_tl)?$/i.test(field)
    && (/(?:_en|_tl)$/.test(field) || ['title', 'subtitle', 'text', 'organization', 'letter'].includes(field));
}

export function isLandingTextPath(path) {
  const [section] = path;
  if (['media', 'layout'].includes(section)) return false;
  if (section === 'hero' && path[1] === 'photos') return false;
  if (section === 'copy') return path.length === 3;
  if (section === 'mobileRelease') {
    return ['version', 'size', 'compatibility', 'architecture', 'format', 'releaseDate'].includes(path[1]);
  }
  const field = path.findLast((part) => !/^\d+$/.test(part));
  return ['hero', 'about', 'contact', 'trust', 'process', 'faq'].includes(section)
    && !['icon', 'id', 'key', 'num', 'url', 'image', 'href'].includes(field);
}

export const projectLandingText = (original, edited) => projectExistingText(original, edited, isLandingTextPath);
export const projectLearningText = (original, edited) => projectExistingText(original, edited, isLearningTextPath);

export const projectChartText = (original, edited) => projectExistingText(
  original, edited, (path) => ['name', 'rank', 'title'].includes(path.at(-1))
);
