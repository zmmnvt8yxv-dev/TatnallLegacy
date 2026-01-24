/**
 * Unit tests for src/utils/positions.ts
 */
import { positionSort, getPositionOrder } from '../utils/positions';

describe('getPositionOrder', () => {
    test('returns array with standard fantasy positions', () => {
        const order = getPositionOrder();
        expect(order).toContain('QB');
        expect(order).toContain('RB');
        expect(order).toContain('WR');
        expect(order).toContain('TE');
        expect(order).toContain('FLEX');
        expect(order).toContain('K');
        expect(order).toContain('DEF');
    });

    test('returns a copy, not the original array', () => {
        const order1 = getPositionOrder();
        const order2 = getPositionOrder();
        expect(order1).not.toBe(order2);
        expect(order1).toEqual(order2);
    });
});

describe('positionSort', () => {
    test('sorts QB before RB', () => {
        expect(positionSort('QB', 'RB')).toBeLessThan(0);
        expect(positionSort('RB', 'QB')).toBeGreaterThan(0);
    });

    test('sorts RB before WR', () => {
        expect(positionSort('RB', 'WR')).toBeLessThan(0);
    });

    test('sorts WR before TE', () => {
        expect(positionSort('WR', 'TE')).toBeLessThan(0);
    });

    test('sorts DEF last among known positions', () => {
        expect(positionSort('DEF', 'QB')).toBeGreaterThan(0);
        expect(positionSort('DEF', 'K')).toBeGreaterThan(0);
    });

    test('unknown positions sort after known positions', () => {
        expect(positionSort('UNKNOWN', 'QB')).toBeGreaterThan(0);
        expect(positionSort('UNKNOWN', 'DEF')).toBeGreaterThan(0);
    });

    test('two unknown positions sort alphabetically', () => {
        expect(positionSort('AAA', 'BBB')).toBeLessThan(0);
        expect(positionSort('ZZZ', 'AAA')).toBeGreaterThan(0);
    });

    test('returns 0 for same position', () => {
        expect(positionSort('QB', 'QB')).toBe(0);
        expect(positionSort('RB', 'RB')).toBe(0);
    });

    test('can be used to sort an array', () => {
        const positions = ['DEF', 'WR', 'QB', 'TE', 'RB', 'K', 'FLEX'];
        const sorted = [...positions].sort(positionSort);
        expect(sorted).toEqual(['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'DEF']);
    });
});
