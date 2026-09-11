export const PAGE_SIZE = 10;

export function pageNumbers(page, total) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const middle = page <= 4 ? [2, 3, 4, 5] : page >= total - 3 ? [total - 4, total - 3, total - 2, total - 1] : [page - 1, page, page + 1];
  const numbers = [1, ...middle, total];
  return numbers.flatMap((number, index) => index && number - numbers[index - 1] > 1 ? ['gap', number] : [number]);
}
