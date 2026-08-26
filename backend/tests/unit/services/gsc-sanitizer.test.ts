// =============================================================================
// UNIT TESTS — GSC credential sanitizer (BLOCKER 2)
// The sanitized output must contain NO recoverable credential fragment.
// =============================================================================

import { sanitizeGscError } from '../../../src/modules/seo/gsc.util';

const PEM = '-----BEGIN PRIVATE KEY-----MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwSECRETBODY1234-----END PRIVATE KEY-----';

describe('sanitizeGscError', () => {
  it('removes a FULL PEM block (marker + body + END marker)', () => {
    const out = sanitizeGscError(new Error(`boom ${PEM} tail`));
    expect(out).toContain('[REDACTED_PRIVATE_KEY]');
    expect(out).not.toContain('SECRETBODY1234');
    expect(out).not.toContain('END PRIVATE KEY'); // no dangling END marker
    expect(out).not.toContain('MIIEvQ');
    expect(out).toBe('boom [REDACTED_PRIVATE_KEY] tail');
  });

  it('removes an escaped JSON private_key value containing \\n', () => {
    const json = '{"type":"service_account","private_key":"-----BEGIN PRIVATE KEY-----\\nAAAABBBBCCCCSECRET\\nDDDD\\n-----END PRIVATE KEY-----\\n","client_email":"x@y.iam"}';
    const out = sanitizeGscError(new Error(json));
    expect(out).not.toContain('AAAABBBBCCCCSECRET');
    expect(out).not.toContain('BEGIN PRIVATE KEY');
  });

  it('redacts a Bearer token', () => {
    const out = sanitizeGscError(new Error('401 with Authorization: Bearer abcSECRETtoken123.def'));
    expect(out).not.toContain('abcSECRETtoken123');
    expect(out).toContain('Bearer [REDACTED]');
  });

  it('redacts a JWT', () => {
    const out = sanitizeGscError(new Error('assertion rejected: eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.SIGNATUREsecret'));
    expect(out).not.toContain('SIGNATUREsecret');
    expect(out).toContain('[REDACTED_JWT]');
  });

  it('redacts an access_token (ya29 and kv form)', () => {
    const out = sanitizeGscError(new Error('token=ya29.A0ARrdaMSECRETVALUE and access_token=abcd1234efgh5678'));
    expect(out).not.toContain('SECRETVALUE');
    expect(out).not.toContain('abcd1234efgh5678');
    expect(out).toContain('[REDACTED_TOKEN]');
  });

  it('redacts a GSC_SA_KEY_BASE64-like long base64 blob', () => {
    const blob = 'ewogICJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIsCiAgInByaXZhdGVfa2V5IjogIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFla' + 'MTIzNDU2Nzg5MEFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=';
    const out = sanitizeGscError(new Error(`GSC_SA_KEY_BASE64=${blob}`));
    expect(out).not.toContain(blob.slice(20, 60));
    expect(out).toContain('[REDACTED_BASE64]');
  });

  it('redacts MULTIPLE secret types in one message, leaving nothing recoverable', () => {
    const msg = `err ${PEM} Bearer TOKENsecretAAA jwt eyJhbGc.eyJzdWI.SIGsecretBBB access_token=ya29.CCCsecret ` +
      '"private_key":"-----BEGIN PRIVATE KEY-----\\nDDDsecret\\n-----END PRIVATE KEY-----\\n"';
    const out = sanitizeGscError(new Error(msg));
    for (const frag of ['SECRETBODY1234', 'TOKENsecretAAA', 'SIGsecretBBB', 'CCCsecret', 'DDDsecret', 'MIIEvQ']) {
      expect(out).not.toContain(frag);
    }
    expect(out).not.toContain('BEGIN PRIVATE KEY');
    expect(out).not.toContain('END PRIVATE KEY');
  });
});
