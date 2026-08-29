import { sanitizeDataForSeoError } from '../../../src/modules/seo/market/providers/dataforseo/dataforseo.errors';

const originalLogin = process.env.DATAFORSEO_LOGIN;
const originalPassword = process.env.DATAFORSEO_PASSWORD;

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = 'myuser@example.com';
  process.env.DATAFORSEO_PASSWORD = 'sup3rSecretPW';
});
afterAll(() => {
  process.env.DATAFORSEO_LOGIN = originalLogin;
  process.env.DATAFORSEO_PASSWORD = originalPassword;
});

describe('sanitizeDataForSeoError', () => {
  it('redacts the raw login and password if they leak into an error message', () => {
    const out = sanitizeDataForSeoError(new Error('auth failed for myuser@example.com / sup3rSecretPW'));
    expect(out).not.toContain('myuser@example.com');
    expect(out).not.toContain('sup3rSecretPW');
    expect(out).toContain('[REDACTED_LOGIN]');
    expect(out).toContain('[REDACTED_PASSWORD]');
  });

  it('redacts a Basic auth header value', () => {
    const b64 = Buffer.from('myuser@example.com:sup3rSecretPW').toString('base64');
    const out = sanitizeDataForSeoError(new Error(`request failed, sent Authorization: Basic ${b64}`));
    expect(out).not.toContain(b64);
    expect(out).toContain('Basic [REDACTED]');
  });

  it('passes through a non-Error value safely', () => {
    expect(sanitizeDataForSeoError('plain string error')).toBe('plain string error');
  });
});
