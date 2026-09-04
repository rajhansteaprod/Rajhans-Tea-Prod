import request from 'supertest';

jest.mock('../../../src/modules/cms/services/cms.service', () => ({
  CmsService: jest.fn().mockImplementation(() => ({
    generateSitemap: jest.fn(async (baseUrl: string) =>
      `<?xml version="1.0"?><urlset><url><loc>${baseUrl}/</loc></url></urlset>`,
    ),
  })),
}));

import app from '../../../src/app';

describe('CMS public URL generation behind trusted proxy', () => {
  it('uses X-Forwarded-Proto=https when generating sitemap URLs', async () => {
    const res = await request(app)
      .get('/api/v1/sitemap.xml')
      .set('Host', 'rajhanstea.com')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
    expect(res.text).toContain('https://rajhanstea.com/');
    expect(res.text).not.toContain('http://rajhanstea.com/');
  });
});
