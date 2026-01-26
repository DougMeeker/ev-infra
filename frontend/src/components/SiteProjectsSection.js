import React, { useEffect, useState } from 'react';
import { getSiteProjects, removeSiteFromProject, reassignProjectSite, getSites } from '../api';
import { useNavigate } from 'react-router-dom';

export default function SiteProjectsSection({ siteId }) {
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [reassigning, setReassigning] = useState(null); // { projectId, projectName }
    const [availableSites, setAvailableSites] = useState([]);
    const [selectedSiteId, setSelectedSiteId] = useState('');
    const [siteSearch, setSiteSearch] = useState('');
    const navigate = useNavigate();

    const loadProjects = () => {
        setLoading(true);
        getSiteProjects(siteId)
            .then(res => {
                setProjects(res.data || []);
            })
            .catch(err => console.error('Error fetching site projects:', err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadProjects();
    }, [siteId]);

    const handleRemoveProject = async (projectId, projectName) => {
        if (!window.confirm(`Remove "${projectName}" from this site? This will not delete the project, only unassign it from this site.`)) {
            return;
        }
        
        try {
            await removeSiteFromProject(projectId, siteId);
            loadProjects(); // Reload the list
        } catch (err) {
            console.error('Error removing project:', err);
            alert('Failed to remove project from site');
        }
    };

    const handleReassignClick = async (projectId, projectName) => {
        // Load available sites
        try {
            const res = await getSites();
            // Filter out current site and sort alphabetically by name
            const otherSites = res.data
                .filter(s => s.id !== parseInt(siteId))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setAvailableSites(otherSites);
            setReassigning({ projectId, projectName });
            setSelectedSiteId('');
            setSiteSearch('');
        } catch (err) {
            console.error('Error loading sites:', err);
            alert('Failed to load available sites');
        }
    };

    const handleReassignSubmit = async () => {
        if (!selectedSiteId) {
            alert('Please select a site');
            return;
        }

        try {
            const res = await reassignProjectSite(reassigning.projectId, siteId, selectedSiteId);
            alert(`Project reassigned successfully! ${res.data.statuses_copied} status records copied.`);
            setReassigning(null);
            loadProjects(); // Reload the list
        } catch (err) {
            console.error('Error reassigning project:', err);
            alert('Failed to reassign project: ' + (err.response?.data?.error || err.message));
        }
    };

    const getProgressColor = (percent) => {
        if (percent >= 75) return '#4CAF50';
        if (percent >= 50) return '#2196F3';
        if (percent >= 25) return '#FF9800';
        return '#9E9E9E';
    };

    if (loading) {
        return <div style={{ padding: '12px' }}>Loading projects...</div>;
    }

    if (projects.length === 0) {
        return (
            <div style={{ padding: '12px', color: '#666' }}>
                No projects associated with this site. 
                <button 
                    className="btn btn-secondary" 
                    style={{ marginLeft: '12px' }}
                    onClick={() => navigate('/status')}
                >
                    Manage Projects
                </button>
            </div>
        );
    }

    return (
        <div>
            {projects.map(project => (
                <div key={project.id} className="card" style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                        <div style={{ flex: 1 }}>
                            <h4 style={{ margin: '0 0 8px 0' }}>{project.name}</h4>
                            {project.description && (
                                <p style={{ margin: '0 0 8px 0', color: '#666' }}>{project.description}</p>
                            )}
                            
                            {/* Progress Bar */}
                            <div style={{ marginBottom: '8px' }}>
                                <div style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    alignItems: 'center',
                                    fontSize: '14px',
                                    marginBottom: '4px'
                                }}>
                                    <span style={{ fontWeight: '500' }}>
                                        Step {project.current_step || 0} of {project.steps_count || 0}
                                    </span>
                                    <span style={{ color: getProgressColor(project.progress_percent || 0), fontWeight: '600' }}>
                                        {project.progress_percent || 0}%
                                    </span>
                                </div>
                                <div style={{ 
                                    width: '100%', 
                                    height: '8px', 
                                    backgroundColor: '#e0e0e0', 
                                    borderRadius: '4px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{ 
                                        width: `${project.progress_percent || 0}%`, 
                                        height: '100%', 
                                        backgroundColor: getProgressColor(project.progress_percent || 0),
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                            </div>
                            
                            {/* Latest Status Message */}
                            {project.status_message && (
                                <div style={{ 
                                    padding: '8px 12px', 
                                    backgroundColor: '#f5f5f5', 
                                    borderRadius: '4px',
                                    borderLeft: '3px solid ' + getProgressColor(project.progress_percent || 0),
                                    marginBottom: '8px'
                                }}>
                                    <div style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>
                                        Latest Update: {project.status_date ? new Date(project.status_date).toLocaleDateString() : 'N/A'}
                                    </div>
                                    <div style={{ fontSize: '14px', color: '#333' }}>
                                        {project.status_message}
                                    </div>
                                </div>
                            )}
                            
                        </div>
                        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button 
                                className="btn btn-secondary"
                                onClick={() => navigate(`/status?project=${project.id}&site=${siteId}`)}
                            >
                                View Details
                            </button>
                            <button 
                                className="btn btn-warning"
                                onClick={() => handleReassignClick(project.id, project.name)}
                                style={{ backgroundColor: '#ff9800', color: 'white' }}
                            >
                                Reassign to Different Site
                            </button>
                            <button 
                                className="btn btn-danger"
                                onClick={() => handleRemoveProject(project.id, project.name)}
                            >
                                Remove from Site
                            </button>
                        </div>
                    </div>
                </div>
            ))}

            {/* Reassign Modal */}
            {reassigning && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '24px',
                        borderRadius: '8px',
                        maxWidth: '500px',
                        width: '90%'
                    }}>
                        <h3 style={{ marginTop: 0 }}>Reassign Project to Different Site</h3>
                        <p>
                            Reassigning <strong>{reassigning.projectName}</strong> to a different site.
                            All status history will be copied to the new site.
                        </p>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                                Search Sites:
                            </label>
                            <input
                                type="text"
                                value={siteSearch}
                                onChange={(e) => setSiteSearch(e.target.value)}
                                placeholder="Type to search by name or address..."
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    marginBottom: '12px'
                                }}
                            />
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                                Select New Site:
                            </label>
                            <select
                                value={selectedSiteId}
                                onChange={(e) => setSelectedSiteId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    maxHeight: '200px'
                                }}
                                size="8"
                            >
                                <option value="">-- Select a site --</option>
                                {availableSites
                                    .filter(site => {
                                        if (!siteSearch) return true;
                                        const searchLower = siteSearch.toLowerCase();
                                        return (
                                            (site.name || '').toLowerCase().includes(searchLower) ||
                                            (site.address || '').toLowerCase().includes(searchLower)
                                        );
                                    })
                                    .map(site => (
                                        <option key={site.id} value={site.id}>
                                            {site.name} ({site.address || 'No address'})
                                        </option>
                                    ))}
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setReassigning(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={handleReassignSubmit}
                                disabled={!selectedSiteId}
                            >
                                Reassign Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
