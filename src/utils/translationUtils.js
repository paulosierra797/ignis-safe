const LANGUAGE_SUFFIX = {
  en: '_en',
  fil: '_tl',
};

const isBlank = (value) => typeof value !== 'string' || value.trim() === '';
const NON_TEXT_FIELD = /(?:url|uri|href|path|asset|image|video|email|phone|key|type|id)(?:_en|_tl)?$/i;

const getPairKeys = (object, key, sourceLanguage, targetLanguage) => {
  if (NON_TEXT_FIELD.test(key)) return null;
  const sourceSuffix = LANGUAGE_SUFFIX[sourceLanguage];
  const targetSuffix = LANGUAGE_SUFFIX[targetLanguage];

  if (key.endsWith(sourceSuffix)) {
    const stem = key.slice(0, -sourceSuffix.length);
    const explicitTarget = `${stem}${targetSuffix}`;
    if (Object.hasOwn(object, explicitTarget)) return [key, explicitTarget];

    // A few legacy records store English without an `_en` suffix (for example
    // title/title_tl). This branch supports Filipino -> English for those rows.
    if (sourceLanguage === 'fil' && Object.hasOwn(object, stem)) return [key, stem];
  }

  if (sourceLanguage === 'en' && !key.endsWith('_tl') && !key.endsWith('_en')) {
    const legacyTarget = `${key}_tl`;
    if (Object.hasOwn(object, legacyTarget)) return [key, legacyTarget];
  }

  return null;
};

const pathKey = (path) => JSON.stringify(path);

const collectStringPairs = (source, target, sourcePath, targetPath, pairs, baseline) => {
  if (typeof source === 'string') {
    if (!source.trim()) return;
    if (isBlank(target)) {
      pairs.push({ sourcePath, targetPath, text: source });
    } else if (baseline && Object.hasOwn(baseline, pathKey(sourcePath)) && baseline[pathKey(sourcePath)] !== source) {
      // Source was edited since it was loaded or last translated, so the
      // existing translation is probably stale. Flag it for a confirmed overwrite.
      pairs.push({ sourcePath, targetPath, text: source, existing: target });
    }
    return;
  }

  if (!Array.isArray(source)) return;
  source.forEach((item, index) => {
    const targetItem = Array.isArray(target) ? target[index] : undefined;
    collectStringPairs(item, targetItem, [...sourcePath, index], [...targetPath, index], pairs, baseline);
  });
};

/**
 * Collects bilingual text whose counterpart is blank, plus (when a baseline is
 * given) text edited since the baseline whose counterpart already has content;
 * those carry `existing`. Pair order follows object/array insertion order so an
 * API response can be applied positionally.
 */
export function collectTranslationPairs(value, sourceLanguage, targetLanguage, baseline) {
  const pairs = [];

  const visit = (node, path = []) => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (!node || typeof node !== 'object') return;

    Object.keys(node).forEach((key) => {
      const pairKeys = getPairKeys(node, key, sourceLanguage, targetLanguage);
      if (pairKeys) {
        const [sourceKey, targetKey] = pairKeys;
        collectStringPairs(
          node[sourceKey],
          node[targetKey],
          [...path, sourceKey],
          [...path, targetKey],
          pairs,
          baseline,
        );
      }
      visit(node[key], [...path, key]);
    });
  };

  visit(value);
  return pairs;
}

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const setAtPath = (root, path, value) => {
  let cursor = root;
  path.slice(0, -1).forEach((part, index) => {
    const nextPart = path[index + 1];
    if (cursor[part] === undefined || cursor[part] === null) {
      cursor[part] = typeof nextPart === 'number' ? [] : {};
    }
    cursor = cursor[part];
  });
  cursor[path.at(-1)] = value;
};

/** Applies translations to a clone and never replaces a now non-blank target. */
export function applyTranslationResults(value, pairs, translations) {
  if (!Array.isArray(translations) || translations.length !== pairs.length) {
    throw new Error('Translation response did not match the requested text.');
  }

  const next = cloneValue(value);
  let appliedCount = 0;
  pairs.forEach((pair, index) => {
    let currentTarget = next;
    pair.targetPath.forEach((part) => { currentTarget = currentTarget?.[part]; });
    let currentSource = next;
    pair.sourcePath.forEach((part) => { currentSource = currentSource?.[part]; });
    // Ignore stale provider results if the admin changed the source while the
    // request was running, and protect any target they changed since: blank
    // targets must still be blank, confirmed overwrites must be unchanged.
    if (currentSource !== pair.text) return;
    if (pair.existing === undefined ? !isBlank(currentTarget) : currentTarget !== pair.existing) return;

    const translation = String(translations[index] || '');
    if (!translation.trim()) return;
    setAtPath(next, pair.targetPath, translation);
    appliedCount += 1;
  });

  return { value: next, appliedCount };
}

export const translationPathKey = pathKey;

/**
 * Records the current text of every translatable string, keyed by path, so a
 * later edit to a source field can be told apart from untouched loaded content.
 */
export function snapshotTranslatableText(value) {
  const snapshot = {};
  const visit = (node, path = []) => {
    if (typeof node === 'string') {
      if (node.trim()) snapshot[pathKey(path)] = node;
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, index]));
      return;
    }
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach((key) => {
      if (!NON_TEXT_FIELD.test(key)) visit(node[key], [...path, key]);
    });
  };
  visit(value);
  return snapshot;
}

export function countExistingTranslationTargets(value, sourceLanguage, targetLanguage) {
  let count = 0;
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    Object.keys(node).forEach((key) => {
      const pair = getPairKeys(node, key, sourceLanguage, targetLanguage);
      if (pair) {
        const [sourceKey, targetKey] = pair;
        const source = node[sourceKey];
        const target = node[targetKey];
        if (typeof source === 'string' && source.trim() && !isBlank(target)) count += 1;
        if (Array.isArray(source)) {
          source.forEach((item, index) => {
            if (typeof item === 'string' && item.trim() && !isBlank(target?.[index])) count += 1;
          });
        }
      }
      visit(node[key]);
    });
  };
  visit(value);
  return count;
}
