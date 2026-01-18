// Set up import.meta.env before any module imports that might use it
// This needs to be done at the top level before imports
globalThis.import = {
    meta: {
        env: {
            DEV: true,
            BASE_URL: '/',
            MODE: 'test',
        },
    },
};

import '@testing-library/jest-dom';
import { jest, beforeEach, beforeAll, afterAll } from '@jest/globals';

// Mock fetch globally
globalThis.fetch = jest.fn();

// Reset mocks between tests
beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch.mockClear();
});

// Console error/warn spy for catching unexpected issues
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
    console.error = (...args) => {
        // Suppress React 18 act() warnings in tests
        if (args[0]?.includes?.('act(')) return;
        originalError.apply(console, args);
    };
    console.warn = (...args) => {
        // Suppress data loading warnings in tests
        if (args[0] === 'DATA_MISSING_KEYS' || args[0] === 'DATA_OPTIONAL_MISSING') return;
        originalWarn.apply(console, args);
    };
});

afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
});
