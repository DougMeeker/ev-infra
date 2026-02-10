import React, { useEffect, useRef, useState } from 'react';

export default function AsyncCombo({
  value,
  onChangeOption,
  loadOptions,
  onInputChange,
  placeholder = 'Search...',
  disabled = false,
  minChars = 2,
}) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync input with external value when it changes (e.g., selection or reset)
  useEffect(() => {
    if (typeof value === 'string') {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    const q = inputValue.trim();
    if (disabled || q.length < minChars) {
      setOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const opts = await loadOptions(q);
        setOptions(opts || []);
        setOpen(true);
        setHighlight(opts && opts.length ? 0 : -1);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [inputValue, loadOptions, disabled, minChars]);

  const selectOption = (opt) => {
    if (!opt) return;
    setInputValue(opt.name || '');
    setOpen(false);
    setHighlight(-1);
    onChangeOption && onChangeOption(opt);
  };

  const onKeyDown = (e) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min((options.length - 1), (h + 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, (h - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && options[highlight]) selectOption(options[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', minWidth: 280 }}>
      <input
        className="input"
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => { setInputValue(e.target.value); onInputChange && onInputChange(e.target.value); }}
        onFocus={() => { if (options.length) setOpen(true); }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        style={{ width: '100%' }}
      />
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            zIndex: 10, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: 4, maxHeight: 260, overflowY: 'auto'
          }}
        >
          {loading && (
            <div style={{ padding: 8, color: 'var(--muted)' }}>Loading…</div>
          )}
          {!loading && options.length === 0 && (
            <div style={{ padding: 8, color: 'var(--muted)' }}>No results</div>
          )}
          {!loading && options.map((opt, idx) => (
            <div
              key={opt.id}
              role="option"
              aria-selected={highlight === idx}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
              style={{
                padding: '6px 8px', cursor: 'pointer',
                background: highlight === idx ? '#f1f5f9' : '#fff'
              }}
            >
              <div>{opt.name || `Site ${opt.id}`}</div>
              {(opt.address || opt.city) && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {opt.address || ''}{opt.address && opt.city ? ', ' : ''}{opt.city || ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
    </div>
  );
}
