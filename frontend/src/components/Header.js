import React, { useState, useEffect, useRef } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../AuthProvider";

// ── Inline SVG icons ─────────────────────────────────────────────────────────

const HomeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const SitesIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const ProjectsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
  </svg>
);

const MenuIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ── Reusable icon nav link ────────────────────────────────────────────────────

const IconNavLink = ({ to, label, children, exact }) => {
  const location = useLocation();
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to);
  return (
    <NavLink
      to={to}
      title={label}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '2px',
        textDecoration: 'none',
        color: isActive ? 'var(--primary)' : 'var(--link)',
        fontSize: '0.65rem',
        fontWeight: isActive ? '600' : '400',
        lineHeight: 1,
        minWidth: '44px',
      }}
    >
      {children}
      <span>{label}</span>
    </NavLink>
  );
};

// ── Main header ───────────────────────────────────────────────────────────────

const MENU_LINKS = [
  { to: "/chargers",    label: "Chargers" },
  { to: "/vehicles",   label: "Equipment" },
  { to: "/catalog",    label: "Catalog" },
  { to: "/files",      label: "Files" },
  { to: "/departments",label: "Departments" },
  { to: "/priorities", label: "Priorities" },
  { to: "/financials", label: "Financials" },
  { to: "/settings",   label: "Settings" },
];

const ADMIN_LINKS = [
  { to: "/admin",      label: "Admin: User Roles" },
];

const Header = () => {
  const { user, login, logout, authEnabled, isAuthenticated, role } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close menu on route change
  const location = useLocation();
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <header className="sticky-header" style={{ background: 'var(--card)', borderBottom: '1px solid var(--card-border)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', paddingBottom: '10px', gap: '8px' }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--text)', flexShrink: 0 }}>
          <img src={`${process.env.PUBLIC_URL}/favicon.svg`} alt="EV Infra Logo" width="25px" />
        </Link>

        {/* Primary icon links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <IconNavLink to="/" label="Home" exact>
            <HomeIcon />
          </IconNavLink>
          <IconNavLink to="/sites/manage" label="Sites">
            <SitesIcon />
          </IconNavLink>
          <IconNavLink to="/project" label="Projects">
            <ProjectsIcon />
          </IconNavLink>
        </nav>

        {/* Right side: hamburger + auth */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>

          {authEnabled && isAuthenticated && user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-secondary, #666)', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.name || user.email}
              </span>
              <span style={{
                background: role ? 'var(--primary, #2563eb)' : '#e5e7eb',
                color: role ? '#fff' : '#6b7280',
                borderRadius: '4px',
                padding: '1px 7px',
                fontSize: '0.7rem',
                fontWeight: '600',
                letterSpacing: '0.03em',
                whiteSpace: 'nowrap',
              }}>
                {role ?? 'no role'}
              </span>
              <button
                onClick={logout}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--card-border, #ccc)',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  cursor: 'pointer',
                  color: 'var(--link)',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                Sign out
              </button>
            </div>
          )}

          {authEnabled && !isAuthenticated && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                onClick={login}
                style={{
                  background: 'var(--primary, #1a73e8)',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  whiteSpace: 'nowrap',
                }}
              >
                Sign in
              </button>
            </div>
          )}

          {/* Hamburger button + dropdown */}
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--link)',
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '4px',
              }}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>

            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  background: 'var(--card)',
                  border: '1px solid var(--card-border)',
                  borderRadius: '8px',
                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                  minWidth: '180px',
                  zIndex: 1000,
                  overflow: 'hidden',
                }}
              >
                {[...MENU_LINKS, ...(role === 'admin' ? ADMIN_LINKS : [])].map(({ to, label }) => (
                  <NavLink
                    key={to}
                    to={to}
                    style={({ isActive }) => ({
                      display: 'block',
                      padding: '10px 18px',
                      textDecoration: 'none',
                      color: isActive ? 'var(--primary)' : 'var(--link)',
                      fontWeight: isActive ? '600' : '400',
                      fontSize: '0.9rem',
                      borderBottom: '1px solid var(--card-border)',
                    })}
                  >
                    {label}
                  </NavLink>
                ))}
                {process.env.REACT_APP_BUILD_DATE && (
                  <div style={{ padding: '8px 18px', fontSize: '0.7rem', color: 'var(--text-secondary, #888)', textAlign: 'right' }}>
                    Built {process.env.REACT_APP_BUILD_DATE}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
