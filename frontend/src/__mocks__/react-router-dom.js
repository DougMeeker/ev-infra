/**
 * Mock react-router-dom for testing.
 */
import React from 'react';

const mockNavigate = jest.fn();
const mockUseParams = jest.fn(() => ({}));
const mockUseSearchParams = jest.fn(() => [new URLSearchParams(), jest.fn()]);
const mockUseLocation = jest.fn(() => ({ pathname: '/', search: '', hash: '', state: null }));

export const useNavigate = () => mockNavigate;
export const useParams = mockUseParams;
export const useSearchParams = mockUseSearchParams;
export const useLocation = mockUseLocation;
export const BrowserRouter = ({ children }) => React.createElement('div', { 'data-testid': 'browser-router' }, children);
export const MemoryRouter = ({ children }) => React.createElement('div', { 'data-testid': 'memory-router' }, children);
export const Link = ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children);
export const NavLink = ({ children, to, ...props }) => React.createElement('a', { href: to, ...props }, children);
export const Routes = ({ children }) => React.createElement('div', { 'data-testid': 'routes' }, children);
export const Route = () => null;
export const Outlet = () => null;
export const Navigate = () => null;
export const useRoutes = jest.fn(() => null);
export const useNavigationType = jest.fn(() => 'PUSH');
export const useMatch = jest.fn(() => null);
export const useResolvedPath = jest.fn((to) => ({ pathname: to, search: '', hash: '' }));

// Export mocks for test assertions
export const __mockNavigate = mockNavigate;
export const __mockUseParams = mockUseParams;
export const __mockUseSearchParams = mockUseSearchParams;
export const __mockUseLocation = mockUseLocation;
