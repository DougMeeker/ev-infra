import React, { useEffect, useState, useMemo } from 'react';
import { getSites } from '../api';

/**
 * Reusable site selector component with search functionality
 * @param {Object} props
 * @param {string|number|null} props.value - Currently selected site ID
 * @param {Function} props.onChange - Callback when selection changes (siteId)
 * @param {string} props.placeholder - Placeholder text for empty selection
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {Array} props.excludeSiteIds - Array of site IDs to exclude from the list
 * @param {string} props.variant - Display variant: 'dropdown' (default) or 'searchable'
 * @param {number} props.size - For dropdown variant, the visible size (default 1)
 * @param {Object} props.style - Additional styles to apply to container
 */
export default function SiteSelector({ 
    value, 
    onChange, 
    placeholder = '-- Select a site --',
    disabled = false,
    excludeSiteIds = [],
    variant = 'dropdown', // 'dropdown' or 'searchable'
    size = 1,
    style = {}
}) {
    const [sites, setSites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);

    // Create a stable string representation of excludeSiteIds for the dependency
    const excludeIdsKey = useMemo(() => JSON.stringify(excludeSiteIds), [excludeSiteIds.join(',')]);

    useEffect(() => {
        setLoading(true);
        getSites()
            .then(res => {
                const allSites = res.data || [];
                // Sort alphabetically by name
                allSites.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                // Filter out excluded sites
                const filtered = allSites.filter(s => !excludeSiteIds.includes(s.id));
                setSites(filtered);
            })
            .catch(err => {
                console.error('Error loading sites:', err);
                setSites([]);
            })
            .finally(() => setLoading(false));
    }, [excludeIdsKey]); // Use the stable key instead of the array

    const filteredSites = sites.filter(site => {
        if (!search) return true;
        const searchLower = search.toLowerCase();
        return (
            (site.name || '').toLowerCase().includes(searchLower) ||
            (site.address || '').toLowerCase().includes(searchLower) ||
            (site.city || '').toLowerCase().includes(searchLower)
        );
    });

    const selectedSite = sites.find(s => s.id === Number(value));
    const displayName = selectedSite ? `${selectedSite.name}` : '';

    if (loading) {
        return <div style={{ padding: '8px', color: 'var(--muted)', ...style }}>Loading sites...</div>;
    }

    // Searchable variant (autocomplete style)
    if (variant === 'searchable') {
        return (
            <div style={{ position: 'relative', ...style }}>
                <input
                    className="input"
                    placeholder={placeholder}
                    value={showDropdown ? search : displayName}
                    onChange={e => {
                        setSearch(e.target.value);
                        setShowDropdown(true);
                    }}
                    onFocus={() => {
                        setSearch('');
                        setShowDropdown(true);
                    }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    disabled={disabled}
                />
                {showDropdown && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: 300,
                        overflowY: 'auto',
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--card-border)',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        zIndex: 1000,
                        marginTop: '2px'
                    }}>
                        {filteredSites.length === 0 ? (
                            <div style={{ padding: '12px', color: 'var(--muted)', textAlign: 'center' }}>
                                No sites found
                            </div>
                        ) : (
                            filteredSites.map(s => (
                                <div
                                    key={s.id}
                                    onClick={() => {
                                        onChange(s.id);
                                        setSearch('');
                                        setShowDropdown(false);
                                    }}
                                    style={{
                                        padding: '10px 12px',
                                        cursor: 'pointer',
                                        backgroundColor: Number(value) === s.id ? 'var(--table-row-hover)' : 'var(--card)',
                                        borderBottom: '1px solid var(--card-border)',
                                        transition: 'background-color 0.15s'
                                    }}
                                    onMouseEnter={e => e.target.style.backgroundColor = 'var(--table-row-hover)'}
                                    onMouseLeave={e => e.target.style.backgroundColor = Number(value) === s.id ? 'var(--table-row-hover)' : 'var(--card)'}
                                >
                                    <div style={{ fontWeight: '500' }}>{s.name}</div>
                                    {s.address && (
                                        <div style={{ fontSize: '0.85em', color: 'var(--muted)' }}>
                                            {s.address}{s.city ? `, ${s.city}` : ''}
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        );
    }

    // Standard dropdown variant
    return (
        <div style={style}>
            {size > 1 && (
                <input
                    type="text"
                    className="input"
                    placeholder="Type to search sites..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ marginBottom: '8px', width: '100%' }}
                    disabled={disabled}
                />
            )}
            <select
                className="input"
                value={value || ''}
                onChange={e => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
                disabled={disabled}
                size={size}
                style={{ width: '100%' }}
            >
                <option value="">{placeholder}</option>
                {filteredSites.map(site => (
                    <option key={site.id} value={site.id}>
                        {site.name}{site.address ? ` - ${site.address}` : ''}{site.city ? `, ${site.city}` : ''}
                    </option>
                ))}
            </select>
        </div>
    );
}
