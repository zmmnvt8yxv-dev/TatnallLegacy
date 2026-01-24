/**
 * Unit tests for src/utils/format.ts
 */
import { describe, test, expect } from '@jest/globals';
import { safeNumber, formatPoints, filterRegularSeasonWeeks } from '../utils/format';

describe('safeNumber', () => {
    test('returns number for valid numeric input', () => {
        expect(safeNumber(42)).toBe(42);
        expect(safeNumber(3.14)).toBe(3.14);
        expect(safeNumber(-10)).toBe(-10);
    });

    test('converts numeric strings to numbers', () => {
        expect(safeNumber('42')).toBe(42);
        expect(safeNumber('3.14')).toBe(3.14);
    });

    test('returns fallback for invalid inputs', () => {
        expect(safeNumber(null)).toBe(0);
        expect(safeNumber(undefined)).toBe(0);
        expect(safeNumber('abc')).toBe(0);
        expect(safeNumber(NaN)).toBe(0);
        expect(safeNumber(Infinity)).toBe(0);
    });

    test('uses custom fallback when provided', () => {
        // Note: safeNumber(null, -1) returns 0 because Number(null) is 0, which is finite
        // The fallback is only used when Number.isFinite returns false
        expect(safeNumber('abc', 999)).toBe(999);
        expect(safeNumber(NaN, -1)).toBe(-1);
    });
});

describe('formatPoints', () => {
    test('formats valid numbers with 2 decimal places by default', () => {
        expect(formatPoints(25)).toBe('25.00');
        expect(formatPoints(25.5)).toBe('25.50');
        expect(formatPoints(25.123)).toBe('25.12');
    });

    test('respects custom decimal places', () => {
        expect(formatPoints(25.123, 1)).toBe('25.1');
        expect(formatPoints(25.123, 0)).toBe('25');
        expect(formatPoints(25.123, 3)).toBe('25.123');
    });

    test('formats null as 0.00 since Number(null) = 0', () => {
        // formatPoints calls safeNumber which returns 0 for null (Number(null) is 0)
        expect(formatPoints(null)).toBe('0.00');
    });

    test('returns em dash for undefined and non-numeric strings', () => {
        // Number(undefined) is NaN, which is not finite
        expect(formatPoints(undefined)).toBe('—');
        expect(formatPoints('abc')).toBe('—');
    });
});

describe('filterRegularSeasonWeeks', () => {
    test('filters to weeks 1-18', () => {
        const rows = [
            { week: 1 }, { week: 10 }, { week: 18 }, { week: 19 }, { week: 0 }
        ];
        const result = filterRegularSeasonWeeks(rows);
        expect(result).toHaveLength(3);
        expect(result.map(r => r.week)).toEqual([1, 10, 18]);
    });

    test('handles custom week key', () => {
        const rows = [{ game_week: 5 }, { game_week: 20 }];
        const result = filterRegularSeasonWeeks(rows, 'game_week');
        expect(result).toHaveLength(1);
        expect(result[0].game_week).toBe(5);
    });

    test('returns empty array for null/undefined input', () => {
        expect(filterRegularSeasonWeeks(null)).toEqual([]);
        expect(filterRegularSeasonWeeks(undefined)).toEqual([]);
    });

    test('filters out invalid week values', () => {
        const rows = [{ week: 'abc' }, { week: null }, { week: 5 }];
        const result = filterRegularSeasonWeeks(rows);
        expect(result).toHaveLength(1);
        expect(result[0].week).toBe(5);
    });
});
