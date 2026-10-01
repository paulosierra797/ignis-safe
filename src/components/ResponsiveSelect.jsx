import { FiChevronDown } from 'react-icons/fi';
import './ResponsiveSelect.css';

export default function ResponsiveSelect({ options, value, disabled = false, ...props }) {
  const selectedOption = options.find((option) => String(option.value) === String(value));

  return (
    <div className={`responsive-select${disabled ? ' responsive-select--disabled' : ''}`}>
      <span className="responsive-select-label" aria-hidden="true">
        {selectedOption?.label || ''}
      </span>
      <FiChevronDown className="responsive-select-chevron" aria-hidden="true" />
      {/* Keep the native picker and keyboard support while the visible label wraps. */}
      <select {...props} value={value} disabled={disabled}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
