export const formatStatusLabel = (value, fallback = '-') => {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

  if (!normalized) return fallback;

  return normalized
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
};
