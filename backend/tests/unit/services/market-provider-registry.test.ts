import { ProviderRegistry, ProviderCapabilityUnavailableError } from '../../../src/modules/seo/market/providers/provider.registry';
import { KeywordDemandProvider } from '../../../src/modules/seo/market/market.types';

function fakeKeywordProvider(configured: boolean): KeywordDemandProvider {
  return {
    id: 'fake-provider',
    kind: 'keyword-demand',
    isConfigured: () => configured,
    estimateCost: () => ({ usd: 0.1, unknown: false }),
    discoverKeywords: async () => [],
    getMetrics: async () => [],
  };
}

describe('ProviderRegistry with zero adapters configured', () => {
  it('module is enabled independent of any provider', () => {
    const registry = new ProviderRegistry();
    expect(registry.moduleEnabled()).toBe(true);
  });

  it('hasCapability returns false for every capability', () => {
    const registry = new ProviderRegistry();
    expect(registry.hasCapability('keyword-demand')).toBe(false);
    expect(registry.hasCapability('serp')).toBe(false);
    expect(registry.hasCapability('trend')).toBe(false);
    expect(registry.hasCapability('gsc-performance')).toBe(false);
  });

  it('get() returns null rather than a stub', () => {
    const registry = new ProviderRegistry();
    expect(registry.get('keyword-demand')).toBeNull();
  });

  it('require() throws ProviderCapabilityUnavailableError, not a generic error', () => {
    const registry = new ProviderRegistry();
    expect(() => registry.require('keyword-demand')).toThrow(ProviderCapabilityUnavailableError);
    try {
      registry.require('keyword-demand');
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ProviderCapabilityUnavailableError);
      expect((e as ProviderCapabilityUnavailableError).capability).toBe('keyword-demand');
      expect((e as Error).message).toBe('provider capability unavailable: keyword-demand');
    }
  });

  it('configuredIds() is empty', () => {
    const registry = new ProviderRegistry();
    expect(registry.configuredIds()).toEqual([]);
  });
});

describe('ProviderRegistry with a registered but unconfigured provider', () => {
  it('still reports the capability as unavailable', () => {
    const registry = new ProviderRegistry();
    registry.register(fakeKeywordProvider(false));
    expect(registry.hasCapability('keyword-demand')).toBe(false);
    expect(registry.get('keyword-demand')).toBeNull();
  });
});

describe('ProviderRegistry with a configured provider', () => {
  it('resolves the capability and lists it as configured', () => {
    const registry = new ProviderRegistry();
    registry.register(fakeKeywordProvider(true));
    expect(registry.hasCapability('keyword-demand')).toBe(true);
    expect(registry.require('keyword-demand')).toBeDefined();
    expect(registry.configuredIds()).toEqual(['fake-provider']);
  });
});
