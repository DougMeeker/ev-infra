/**
 * Tests for SitesManager component.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import SitesManager from '../pages/SitesManager';

// Mock the API module
jest.mock('../api', () => ({
  getSites: jest.fn(),
  createSite: jest.fn(),
  updateSite: jest.fn(),
  deleteSite: jest.fn(),
}));

import { getSites, updateSite } from '../api';

const mockSites = [
  { id: 1, site_name: 'Test Site 1', address: '123 Test St', city: 'Sacramento', owner_dept: 'Admin' },
  { id: 2, site_name: 'Test Site 2', address: '456 Oak Ave', city: 'San Francisco', owner_dept: 'Operations' },
];

// Wrapper for router context
const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('SitesManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSites.mockResolvedValue({ data: mockSites });
  });

  test('renders loading state initially', () => {
    renderWithRouter(<SitesManager />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  test('renders sites after loading', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Test Site 2')).toBeInTheDocument();
  });

  test('renders search input', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search by name, address, city/i)).toBeInTheDocument();
    });
  });

  test('filters sites by search query', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search by name, address, city/i);
    await userEvent.type(searchInput, 'Site 1');
    
    expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Site 2')).not.toBeInTheDocument();
  });

  test('filters sites by address', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search by name, address, city/i);
    await userEvent.type(searchInput, '123 Test');
    
    expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    expect(screen.queryByText('Test Site 2')).not.toBeInTheDocument();
  });

  test('filters sites by city', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search by name, address, city/i);
    await userEvent.type(searchInput, 'San Francisco');
    
    expect(screen.queryByText('Test Site 1')).not.toBeInTheDocument();
    expect(screen.getByText('Test Site 2')).toBeInTheDocument();
  });

  test('shows no matching sites message when search has no results', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/Search by name, address, city/i);
    await userEvent.type(searchInput, 'nonexistent site xyz');
    
    expect(screen.getByText(/No matching sites/i)).toBeInTheDocument();
  });

  test('displays site details link', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    const detailsLinks = screen.getAllByText('Details');
    expect(detailsLinks.length).toBeGreaterThan(0);
  });

  test('displays address column', async () => {
    await act(async () => {
      renderWithRouter(<SitesManager />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test Site 1')).toBeInTheDocument();
    });
    
    expect(screen.getByText('123 Test St')).toBeInTheDocument();
    expect(screen.getByText('456 Demo Ave')).toBeInTheDocument();
  });
});
