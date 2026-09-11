// Read in bounded batches so the API's row cap cannot silently hide older history.
export async function readAllRows(createQuery, limit = Infinity) {
  const rows = [];
  while (rows.length < limit) {
    const batchSize = Math.min(500, limit - rows.length);
    const { data, error } = await createQuery().range(rows.length, rows.length + batchSize - 1);
    if (error) throw new Error(error.message || 'Could not load records.');
    rows.push(...(data || []));
    if (!data || data.length < batchSize) break;
  }
  return rows;
}
