/**
 * Unit tests for src/lib/identity.js
 */
import { normalizeKey, normalizeOwnerName, resolveOwnerName, OWNER_ALIASES } from '../lib/identity.js';

describe('normalizeKey', () => {
    test('converts to lowercase', () => {
        expect(normalizeKey('HELLO')).toBe('hello');
        expect(normalizeKey('HeLLo WoRLd')).toBe('hello world');
    });

    test('handles null/undefined', () => {
        expect(normalizeKey(null)).toBe('');
        expect(normalizeKey(undefined)).toBe('');
        expect(normalizeKey('')).toBe('');
    });

    test('strips email domains', () => {
        expect(normalizeKey('user@example.com')).toBe('user');
    });

    test('normalizes whitespace and underscores', () => {
        expect(normalizeKey('hello_world')).toBe('hello world');
        expect(normalizeKey('hello   world')).toBe('hello world');
        expect(normalizeKey('  hello  ')).toBe('hello');
    });

    test('removes punctuation', () => {
        expect(normalizeKey("john's")).toBe('john s');
        expect(normalizeKey('hello,world')).toBe('hello world');
    });

    test('normalizes accented characters', () => {
        expect(normalizeKey('café')).toBe('cafe');
        expect(normalizeKey('naïve')).toBe('naive');
    });
});

describe('normalizeOwnerName', () => {
    test('resolves known aliases', () => {
        expect(normalizeOwnerName('conner27lax')).toBe('Conner Malley');
        expect(normalizeOwnerName('cmarvin713')).toBe('Carl Marvin');
        expect(normalizeOwnerName('jawnwick13')).toBe('Jared Duncan');
    });

    test('handles case insensitivity', () => {
        expect(normalizeOwnerName('CONNER27LAX')).toBe('Conner Malley');
        expect(normalizeOwnerName('Conner27Lax')).toBe('Conner Malley');
    });

    test('returns title case for unknown names', () => {
        expect(normalizeOwnerName('john doe')).toBe('John Doe');
        expect(normalizeOwnerName('JANE SMITH')).toBe('Jane Smith');
    });

    test('handles null/undefined', () => {
        expect(normalizeOwnerName(null)).toBe('');
        expect(normalizeOwnerName(undefined)).toBe('');
        expect(normalizeOwnerName('')).toBe('');
    });

    test('extracts name from object', () => {
        expect(normalizeOwnerName({ display_name: 'conner27lax' })).toBe('Conner Malley');
        expect(normalizeOwnerName({ nickname: 'jawnwick13' })).toBe('Jared Duncan');
        expect(normalizeOwnerName({ team_name: 'roylee6' })).toBe('Roy Lee');
    });
});

describe('resolveOwnerName', () => {
    test('is an alias for normalizeOwnerName', () => {
        expect(resolveOwnerName('conner27lax')).toBe('Conner Malley');
        expect(resolveOwnerName('unknown')).toBe('Unknown');
    });
});

describe('OWNER_ALIASES', () => {
    test('contains expected league members', () => {
        expect(Object.values(OWNER_ALIASES)).toContain('Conner Malley');
        expect(Object.values(OWNER_ALIASES)).toContain('Carl Marvin');
        expect(Object.values(OWNER_ALIASES)).toContain('Jared Duncan');
        expect(Object.values(OWNER_ALIASES)).toContain('Jeff Crossland');
        expect(Object.values(OWNER_ALIASES)).toContain('John Downs');
        expect(Object.values(OWNER_ALIASES)).toContain('Roy Lee');
    });

    test('all aliases map to a non-empty string', () => {
        for (const [alias, name] of Object.entries(OWNER_ALIASES)) {
            expect(typeof name).toBe('string');
            expect(name.length).toBeGreaterThan(0);
        }
    });
});
