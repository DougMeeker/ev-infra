import React from "react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "../AuthProvider";

const Header = () => {
  const { user, logout, authEnabled } = useAuth();

  return (
    <header className="sticky-header" style={{ background: 'var(--card)', borderBottom: '1px solid var(--card-border)' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', paddingBottom: '12px' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--text)' }}>
          <img src={`${process.env.PUBLIC_URL}/favicon.svg`} alt="EV Infra Logo" width="25px" />
        </Link>
        <nav className="flex-row gap-md">
          <NavLink to="/" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Home
          </NavLink>
          <NavLink to="/sites/manage" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Sites
          </NavLink>
          <NavLink to="/project" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Projects
          </NavLink>
          <NavLink to="/chargers" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Chargers
          </NavLink>
          <NavLink to="/vehicles" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Vehicles
          </NavLink>
          <NavLink to="/catalog" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Catalog
          </NavLink>
          <NavLink to="/files" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Files
          </NavLink>
          <NavLink to="/departments" style={({ isActive }) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration: 'none' })}>
            Departments
          </NavLink>
        </nav>
        {authEnabled && user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-secondary, #666)' }}>{user.name || user.email}</span>
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
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
