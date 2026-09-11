import { useState } from 'react';

export default function OrgSelectField({ label, value = '', options, onChange, disabled }) {
  const [manual, setManual] = useState(Boolean(value) && !options.some(option => option.value === value));
  return (
    <div className="org-choice-field">
      <label className="org-edit-field">
        <span>{label}</span>
        <select className="org-input" value={manual ? '__other__' : value} disabled={disabled}
          onChange={event => {
            const custom = event.target.value === '__other__';
            setManual(custom);
            if (!custom) onChange(event.target.value);
          }}>
          <option value="">Select {label.toLowerCase()}</option>
          {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          <option value="__other__">Other (enter manually)</option>
        </select>
      </label>
      {manual && <label className="org-edit-field">
        <span>Custom {label.toLowerCase()}</span>
        <input className="org-input" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      </label>}
    </div>
  );
}
