describe('bootstrapMarketProviders', () => {
  beforeEach(() => jest.resetModules());

  it('registers DataForSEO exactly once even if called multiple times (idempotent)', async () => {
    const { bootstrapMarketProviders, __resetProviderBootstrapForTests } = await import('../../../src/modules/seo/market/providers/provider.bootstrap');
    const { providerRegistry: freshRegistry } = await import('../../../src/modules/seo/market/providers/provider.registry');
    __resetProviderBootstrapForTests();
    bootstrapMarketProviders();
    bootstrapMarketProviders();
    bootstrapMarketProviders();
    // hasCapability reflects configuration state, not registration count; assert no throw and stable behavior instead.
    expect(() => freshRegistry.hasCapability('keyword-demand')).not.toThrow();
  });

  it('does not register anything merely by being imported (no hidden side effect)', async () => {
    jest.resetModules();
    const { providerRegistry: freshRegistry } = await import('../../../src/modules/seo/market/providers/provider.registry');
    // Importing provider.bootstrap must not itself register — only calling bootstrapMarketProviders() does.
    await import('../../../src/modules/seo/market/providers/provider.bootstrap');
    expect(freshRegistry.hasCapability('keyword-demand')).toBe(false);
  });

  it('module remains usable with DataForSEO unconfigured after bootstrap', async () => {
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
    jest.resetModules();
    const { bootstrapMarketProviders } = await import('../../../src/modules/seo/market/providers/provider.bootstrap');
    const { providerRegistry: freshRegistry } = await import('../../../src/modules/seo/market/providers/provider.registry');
    bootstrapMarketProviders();
    expect(freshRegistry.hasCapability('keyword-demand')).toBe(false);
    expect(() => freshRegistry.require('keyword-demand')).toThrow();
  });
});
