import React from 'react';

export default function StatusHistoryRow({ status }) {
  const date = status.status_date ? new Date(status.status_date).toLocaleDateString() : '—';
  const step = status.current_step;
  const message = status.status_message || '—';
  const est = typeof status.estimated_cost === 'number' ? `$${status.estimated_cost.toLocaleString()}` : '—';
  const actual = typeof status.actual_cost === 'number' ? `$${status.actual_cost.toLocaleString()}` : '—';

  return (
    <tr className="historyRow">
      <td>{date}</td>
      <td>{step}</td>
      <td>{message}</td>
      <td>{est}</td>
      <td>{actual}</td>
    </tr>
  );
}
