import React from 'react';
import { ratioFrom, getStatusShade } from '../utils/statusShading';
import styles from '../pages/ProjectStatus.module.css';

export default function LatestStatusBox({ item, stepsCount, onUpdate, isSelected = false }) {
  const ratio = ratioFrom(item.current_step, stepsCount);
  const col = getStatusShade(ratio);

  const baseStyle = {
    background: col.bg,
    border: '1px solid ' + col.border
  };

  const content = (
    <div className={styles.latestRowContent}>
      <strong className={styles.siteName}>{item.site_name || `Site ${item.site_id}`}</strong>
      <span className={styles.token}>Step {item.current_step ?? '—'}</span>
      {item.status_date && (
        <span className={styles.tokenMuted}>{new Date(item.status_date).toLocaleDateString()}</span>
      )}
      {item.status_message && (
        <span className={styles.msgToken} title={item.status_message}>{item.status_message}</span>
      )}
      {typeof item.estimated_cost === 'number' && (
        <span className={styles.token}>Est ${item.estimated_cost.toLocaleString()}</span>
      )}
      {typeof item.actual_cost === 'number' && (
        <span className={styles.token}>Actual ${item.actual_cost.toLocaleString()}</span>
      )}
    </div>
  );

  const handleSelect = () => onUpdate?.(String(item.site_id), item.current_step);
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect();
    }
  };

  return (
    <div
      className={`${styles.latestRow} ${isSelected ? styles.latestRowSelected : ''}`}
      style={baseStyle}
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={onKey}
    >
      {content}
    </div>
  );
}
