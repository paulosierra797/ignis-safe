// Match the Personnel rank dropdown; retain historical prefixes when loading.
export const ORG_RANK_OPTIONS = [
  ['FDIR', 'Fire Director'], ['DFDIR', 'Deputy Fire Director'],
  ['SSUPT', 'Senior Fire Superintendent'], ['SUPT', 'Fire Superintendent'],
  ['CINSP', 'Fire Chief Inspector'], ['SINSP', 'Fire Senior Inspector'],
  ['INSP', 'Fire Inspector'], ['SFO4', 'Senior Fire Officer IV'],
  ['SFO3', 'Senior Fire Officer III'], ['SFO2', 'Senior Fire Officer II'],
  ['SFO1', 'Senior Fire Officer I'], ['FO3', 'Fire Officer III'],
  ['FO2', 'Fire Officer II'], ['FO1', 'Fire Officer I'],
].map(([value, label]) => ({ value, label: `${value} - ${label}` }));

const prefixes = [...ORG_RANK_OPTIONS.map(option => option.value), 'FCINSP', 'FSINSP', 'FINSP', 'FSSUPT', 'FSUPT'];
const rankPrefix = new RegExp(`^(${prefixes.join('|')})\\.?\\s+(.+)$`, 'i');

export function separateOrgRank(node) {
  if (Object.hasOwn(node, 'rank')) return { rank: node.rank || '', name: node.name || '' };
  const match = String(node.name || '').trim().match(rankPrefix);
  return match ? { rank: match[1], name: match[2] } : { rank: '', name: node.name || '' };
}
