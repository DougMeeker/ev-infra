import React from "react";
import { Link, NavLink } from "react-router-dom";

const Header = () => {
  return (
    <header style={{ background: 'var(--card)', borderBottom: '1px solid var(--card-border)' }}>
      <div className="container" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop: '12px', paddingBottom: '12px' }}>
        <Link to="/" style={{ textDecoration:'none', color:'var(--text)' }}>
          <strong>EV Infra</strong>
          <span className="pill">Beta</span>
        </Link>
        <nav className="flex-row gap-md">
          <NavLink to="/" style={({isActive}) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration:'none' })}>
            Home
          </NavLink>
          <NavLink to="/catalog" style={({isActive}) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration:'none' })}>
            Catalog
          </NavLink>
          <NavLink to="/sites/import" style={({isActive}) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration:'none' })}>
            Sites Import
          </NavLink>
          <NavLink to="/projects" style={({isActive}) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration:'none' })}>
            Projects
          </NavLink>
          <NavLink to="/projects/status" style={({isActive}) => ({ color: isActive ? 'var(--primary)' : 'var(--link)', textDecoration:'none' })}>
            Status
          </NavLink>
        </nav>
      </div>
    </header>
  );
};

export default Header;
