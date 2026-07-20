const MAX_LINE_LENGTH = 20;

export const wrapChartLabel = (label, maxLineLength = MAX_LINE_LENGTH) => {
  const text = String(label ?? '').trim();
  if (!text) return [''];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > maxLineLength && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  });

  if (currentLine) lines.push(currentLine);

  return lines.length ? lines : [text];
};

export const wrapChartLabels = (labels, maxLineLength = MAX_LINE_LENGTH) =>
  (labels || []).map((label) => wrapChartLabel(label, maxLineLength));
