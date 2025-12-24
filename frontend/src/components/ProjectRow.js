import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProjectRow({ project, siteId }) {
  const navigate = useNavigate();
  const cellStyle = { verticalAlign: 'middle' };
  const actionsStyle = {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
    minHeight: 42,
  };
  return (
    <tr style={{ height: 48 }}>
      <td style={cellStyle}>{project.name}</td>
      <td style={cellStyle}>{project.description || '—'}</td>
      <td style={{ ...cellStyle, width: 180 }}>
        <div style={actionsStyle}>
          <button
            className="btn"
            onClick={() => navigate(`/project/${project.id}/site/${siteId}`)}
          >Project Details</button>
        </div>
      </td>
    </tr>
  );
}
