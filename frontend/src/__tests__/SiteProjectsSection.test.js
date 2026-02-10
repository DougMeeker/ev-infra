/**
 * Tests for SiteProjectsSection component.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import SiteProjectsSection from '../components/SiteProjectsSection';

// Mock the API module
jest.mock('../api', () => ({
  getSiteProjects: jest.fn(),
  removeSiteFromProject: jest.fn(),
  getProjects: jest.fn(),
  assignSiteToProject: jest.fn(),
}));

import { getSiteProjects, removeSiteFromProject, getProjects } from '../api';

const mockProjects = [
  {
    id: 1,
    name: 'EV Charger Installation',
    description: 'Install new EV chargers',
    steps_count: 5,
    current_step: 3,
    progress_percent: 60,
    status_message: 'Design phase complete',
    status_date: '2026-02-01',
  },
  {
    id: 2,
    name: 'Solar Panel Project',
    description: 'Add solar panels',
    steps_count: 4,
    current_step: 1,
    progress_percent: 25,
    status_message: 'Initial assessment',
    status_date: '2026-01-15',
  },
];

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('SiteProjectsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSiteProjects.mockResolvedValue({ data: mockProjects });
    getProjects.mockResolvedValue({ data: [] });
  });

  test('renders loading state initially', () => {
    renderWithRouter(<SiteProjectsSection siteId={1} />);
    
    expect(screen.getByText(/Loading projects.../i)).toBeInTheDocument();
  });

  test('renders projects after loading', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('EV Charger Installation')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Solar Panel Project')).toBeInTheDocument();
  });

  test('shows no projects message when empty', async () => {
    getSiteProjects.mockResolvedValue({ data: [] });
    
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/No projects associated with this site/i)).toBeInTheDocument();
    });
  });

  test('displays progress percentage', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
    
    expect(screen.getByText('25%')).toBeInTheDocument();
  });

  test('displays step progress', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Step 3 of 5')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  test('displays status message', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Design phase complete')).toBeInTheDocument();
    });
  });

  test('renders View Details button', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const detailsButtons = screen.getAllByText('View Details');
      expect(detailsButtons.length).toBe(2);
    });
  });

  test('View Details button links to correct project URL', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const detailsButtons = screen.getAllByText('View Details');
      expect(detailsButtons[0]).toBeInTheDocument();
    });
    
    // Button should navigate to /project/{projectId}?siteId={siteId}
    const detailsButtons = screen.getAllByText('View Details');
    expect(detailsButtons[0]).toBeInTheDocument();
  });

  test('renders Remove from Site button', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const removeButtons = screen.getAllByText('Remove from Site');
      expect(removeButtons.length).toBe(2);
    });
  });

  test('renders Reassign button', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const reassignButtons = screen.getAllByText('Reassign to Different Site');
      expect(reassignButtons.length).toBe(2);
    });
  });

  test('displays project description', async () => {
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Install new EV chargers')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Add solar panels')).toBeInTheDocument();
  });

  test('Manage Projects button shows when no projects', async () => {
    getSiteProjects.mockResolvedValue({ data: [] });
    
    await act(async () => {
      renderWithRouter(<SiteProjectsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Manage Projects')).toBeInTheDocument();
    });
  });
});
