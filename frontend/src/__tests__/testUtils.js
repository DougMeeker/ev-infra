/**
 * Test utilities and common setup for frontend tests.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';

/**
 * Wrapper component with Router context.
 */
export const RouterWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

/**
 * Render a component with BrowserRouter context.
 */
export const renderWithRouter = (ui, options = {}) => {
  return render(ui, { wrapper: RouterWrapper, ...options });
};

/**
 * Render a component with MemoryRouter and initial entries.
 */
export const renderWithMemoryRouter = (ui, { initialEntries = ['/'], ...options } = {}) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>,
    options
  );
};

/**
 * Create a mock API response.
 */
export const createMockResponse = (data) => Promise.resolve({ data });

/**
 * Create a mock API error.
 */
export const createMockError = (message, status = 500) => {
  const error = new Error(message);
  error.response = { status, data: { error: message } };
  return Promise.reject(error);
};

/**
 * Wait for loading to complete.
 */
export const waitForLoadingToComplete = async (screen, loadingText = /loading/i) => {
  const { findByText, queryByText } = screen;
  
  // Wait for loading text to appear then disappear
  try {
    await findByText(loadingText);
  } catch {
    // Loading may have already finished
  }
  
  // Wait for loading to disappear
  await new Promise((resolve) => setTimeout(resolve, 100));
};

/**
 * Mock window.confirm to return specified value.
 */
export const mockConfirm = (returnValue = true) => {
  const originalConfirm = window.confirm;
  window.confirm = jest.fn(() => returnValue);
  return () => {
    window.confirm = originalConfirm;
  };
};

/**
 * Mock window.alert.
 */
export const mockAlert = () => {
  const originalAlert = window.alert;
  window.alert = jest.fn();
  return () => {
    window.alert = originalAlert;
  };
};

/**
 * Create mock project data.
 */
export const createMockProject = (overrides = {}) => ({
  id: 1,
  name: 'Test Project',
  description: 'A test project',
  steps_count: 5,
  is_deleted: false,
  ...overrides,
});

/**
 * Create mock site data.
 */
export const createMockSite = (overrides = {}) => ({
  id: 1,
  name: 'Test Site',
  address: '123 Test St',
  city: 'Test City',
  latitude: 34.0522,
  longitude: -118.2437,
  department_id: 'DEPT001',
  is_deleted: false,
  ...overrides,
});

/**
 * Create mock service data.
 */
export const createMockService = (overrides = {}) => ({
  id: 1,
  site_id: 1,
  utility: 'Test Utility',
  meter_number: 'MTR-001',
  main_breaker_amps: 200,
  voltage: 480,
  phase_count: 3,
  power_factor: 0.95,
  ...overrides,
});

/**
 * Create mock bill data.
 */
export const createMockBill = (overrides = {}) => ({
  id: 1,
  service_id: 1,
  year: 2025,
  month: 1,
  energy_usage: 15000,
  max_power: 75.5,
  ...overrides,
});

/**
 * Create mock step data.
 */
export const createMockStep = (overrides = {}) => ({
  id: 1,
  project_id: 1,
  title: 'Test Step',
  step_order: 1,
  description: 'A test step',
  ...overrides,
});
