/**
 * Unit tests for src/lib/url.js
 * Note: Tests always provide explicit base URL to avoid import.meta.env dependency
 */
import { describe, test, expect } from '@jest/globals';
import { safeUrl } from '../lib/url.js';

describe('safeUrl', () => {
    test('returns absolute URLs unchanged', () => {
        expect(safeUrl('https://example.com/data.json', '/')).toBe('https://example.com/data.json');
        expect(safeUrl('http://example.com/data.json', '/')).toBe('http://example.com/data.json');
    });

    test('prepends base URL to relative paths', () => {
        const result = safeUrl('data/manifest.json', '/TatnallLegacy/');
        expect(result).toContain('TatnallLegacy');
        expect(result).toContain('data/manifest.json');
    });

    test('handles paths starting with slash', () => {
        const result = safeUrl('/data/manifest.json', '/');
        expect(result).toContain('data/manifest.json');
    });

    test('handles empty path', () => {
        const result = safeUrl('', '/TatnallLegacy/');
        expect(result).toBe('/TatnallLegacy/');
    });

    test('handles null path', () => {
        const result = safeUrl(null, '/');
        expect(result).toBe('/');
    });

    test('handles base URL without trailing slash', () => {
        const result = safeUrl('data/test.json', '/TatnallLegacy');
        expect(result).toContain('TatnallLegacy');
        expect(result).toContain('data/test.json');
    });
});
