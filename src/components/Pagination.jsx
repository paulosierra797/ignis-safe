import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { pageNumbers, PAGE_SIZE } from '../utils/pagination';
import './Pagination.css';

export default function Pagination({ page, totalItems, onPageChange, label = 'List pages' }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const current = Math.max(1, Math.min(page, totalPages));
  if (totalItems <= PAGE_SIZE) return null;
  return <nav className="list-pagination" aria-label={label}>
    <div className="list-pagination-controls">
      <button type="button" aria-label="Previous page" disabled={current === 1} onClick={() => onPageChange(current - 1)}><FiChevronLeft aria-hidden="true" /></button>
      {pageNumbers(current, totalPages).map((number, index) => number === 'gap'
        ? <span className="list-pagination-gap" key={`gap-${index}`} aria-hidden="true">...</span>
        : <button type="button" key={number} aria-label={`Page ${number}`} aria-current={number === current ? 'page' : undefined} onClick={() => onPageChange(number)}>{number}</button>)}
      <button type="button" aria-label="Next page" disabled={current === totalPages} onClick={() => onPageChange(current + 1)}><FiChevronRight aria-hidden="true" /></button>
    </div>
    <span className="list-pagination-summary" role="status">{(current - 1) * PAGE_SIZE + 1}-{Math.min(current * PAGE_SIZE, totalItems)} of {totalItems}</span>
  </nav>;
}
