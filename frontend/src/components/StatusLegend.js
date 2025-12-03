import React from 'react';

export default function StatusLegend({ style, className }) {
  const base = { display: 'flex', gap: 12, marginBottom: 8, fontSize: '0.85rem', ...(style || {}) };
  return (
    <div style={base} className={className}>
      <span style={{ background:'#bfdbfe', border:'1px solid #60a5fa', padding:'2px 6px', borderRadius:4 }}>Earlier Step</span>
      <span style={{ background:'#93c5fd', border:'1px solid #3b82f6', padding:'2px 6px', borderRadius:4 }}>Mid Step</span>
      <span style={{ background:'#60a5fa', border:'1px solid #2563eb', padding:'2px 6px', borderRadius:4 }}>Later Step</span>
      <span style={{ background:'#f1f5f9', border:'1px solid #cbd5e1', padding:'2px 6px', borderRadius:4 }}>No Status</span>
    </div>
  );
}
