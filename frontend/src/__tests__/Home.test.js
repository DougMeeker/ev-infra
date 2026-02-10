/**
 * Tests for Home page component.
 */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from '../pages/Home';

// Mock the API module
jest.mock('../api', () => ({
  getAggregateMetrics: jest.fn(),
  getProjects: jest.fn(),
  getLatestProjectStatuses: jest.fn(),
  getSitesForMap: jest.fn(),
}));

import { 
  getAggregateMetrics, 
  getProjects, 
  getLatestProjectStatuses, 
  getSitesForMap,
} from '../api';

// Mock leaflet to avoid issues in test environment
jest.mock('leaflet', () => ({
  Icon: {
    Default: {
      prototype: {
        _getIconUrl: jest.fn(),
      },
      mergeOptions: jest.fn(),
    },
  },
  icon: jest.fn(() => ({})),
  divIcon: jest.fn(() => ({})),
}));

// Mock react-leaflet
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Popup: () => null,
  useMap: () => ({ setView: jest.fn() }),
  useMapEvents: jest.fn(() => null),
}));

const renderWithRouter = (ui) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>);
};

describe('Home Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAggregateMetrics.mockResolvedValue({ 
      data: { 
        data: [],
        total_sites: 0,
        total_chargers: 0,
      } 
    });
    getProjects.mockResolvedValue({ data: [] });
    getLatestProjectStatuses.mockResolvedValue({ data: [] });
    getSitesForMap.mockResolvedValue({ data: [] });
  });

  test('renders page header', async () => {
    await act(async () => {
      renderWithRouter(<Home />);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/EV Infrastructure/i)).toBeInTheDocument();
    });
  });

  test('renders map container', async () => {
    await act(async () => {
      renderWithRouter(<Home />);
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('map-container')).toBeInTheDocument();
    });
  });

  test('calls API functions on mount', async () => {
    await act(async () => {
      renderWithRouter(<Home />);
    });
    
    await waitFor(() => {
      expect(getProjects).toHaveBeenCalled();
    });
  });
});
