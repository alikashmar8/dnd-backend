import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('should reflect any origin when CORS_ORIGIN is unset', () => {
    expect(parseCorsOrigins(undefined)).toBe(true);
    expect(parseCorsOrigins('')).toBe(true);
  });

  it('should reflect any origin when CORS_ORIGIN is *', () => {
    expect(parseCorsOrigins('*')).toBe(true);
    expect(parseCorsOrigins(' *, ')).toBe(true);
  });

  it('should build an exact-origin allowlist from a comma list', () => {
    expect(
      parseCorsOrigins(
        'https://admin.dishanddash.com, https://www.dishanddash.com',
      ),
    ).toEqual(['https://admin.dishanddash.com', 'https://www.dishanddash.com']);
  });

  it('should trim whitespace around each origin', () => {
    expect(parseCorsOrigins(' https://a.com , https://b.com ')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('should never return a literal * so credentialed requests work', () => {
    const result = parseCorsOrigins('*');
    expect(result).not.toBe('*');
  });
});
