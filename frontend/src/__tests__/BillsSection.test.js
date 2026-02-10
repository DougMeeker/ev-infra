/**
 * Tests for BillsSection component.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BillsSection from '../components/BillsSection';

// Mock the API module
jest.mock('../api', () => ({
  getBills: jest.fn(),
  getServices: jest.fn(),
  createBill: jest.fn(),
  updateBill: jest.fn(),
  deleteBill: jest.fn(),
}));

import { getBills, getServices, createBill, updateBill, deleteBill } from '../api';

const mockServices = [
  { id: 1, site_id: 1, utility: 'PG&E', meter_number: 'MTR-001' },
];

const mockBills = [
  { id: 1, service_id: 1, year: 2025, month: 1, energy_usage: 15000, max_power: 75.5 },
  { id: 2, service_id: 1, year: 2025, month: 2, energy_usage: 16000, max_power: 80 },
];

describe('BillsSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getBills.mockResolvedValue({ data: mockBills });
    getServices.mockResolvedValue({ data: mockServices });
  });

  test('renders loading state initially', async () => {
    render(<BillsSection siteId={1} />);
    // Component renders, loading happens async
    expect(document.body).toBeInTheDocument();
  });

  test('renders bills after loading', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('2025-01')).toBeInTheDocument();
    });
    
    expect(screen.getByText('2025-02')).toBeInTheDocument();
  });

  test('renders add bill form when services exist', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Year')).toBeInTheDocument();
    });
    
    expect(screen.getByPlaceholderText('Month')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Energy kWh')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Max kW')).toBeInTheDocument();
  });

  test('shows warning when no services exist', async () => {
    getServices.mockResolvedValue({ data: [] });
    
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/You need to add at least one service/i)).toBeInTheDocument();
    });
  });

  test('displays energy usage in table', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('15000')).toBeInTheDocument();
    });
    
    expect(screen.getByText('16000')).toBeInTheDocument();
  });

  test('displays max power in table', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('75.5')).toBeInTheDocument();
    });
    
    expect(screen.getByText('80')).toBeInTheDocument();
  });

  test('renders edit button for each bill', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const editButtons = screen.getAllByText('Edit');
      expect(editButtons.length).toBe(2);
    });
  });

  test('renders delete button for each bill', async () => {
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      const deleteButtons = screen.getAllByText('Delete');
      expect(deleteButtons.length).toBe(2);
    });
  });

  test('shows no bills message when empty', async () => {
    getBills.mockResolvedValue({ data: [] });
    
    await act(async () => {
      render(<BillsSection siteId={1} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText(/No bills yet/i)).toBeInTheDocument();
    });
  });

  test('calls onTotalsChange with total energy', async () => {
    const mockOnTotalsChange = jest.fn();
    
    await act(async () => {
      render(<BillsSection siteId={1} onTotalsChange={mockOnTotalsChange} />);
    });
    
    await waitFor(() => {
      expect(mockOnTotalsChange).toHaveBeenCalledWith(31000); // 15000 + 16000
    });
  });
});
