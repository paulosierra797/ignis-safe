import { useState } from 'react';
import { PAGE_SIZE } from '../utils/pagination';

export default function usePagination(items, filterKey = '') {
  const [state, setState] = useState({ page: 1, filterKey });
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = state.filterKey === filterKey ? Math.max(1, Math.min(state.page, totalPages)) : 1;
  return {
    page,
    totalItems: items.length,
    onPageChange: next => setState({ page: Math.max(1, Math.min(next, totalPages)), filterKey }),
    items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    offset: (page - 1) * PAGE_SIZE
  };
}
