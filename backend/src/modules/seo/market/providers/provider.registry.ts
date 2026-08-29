import { marketConfig } from '../market.config';
import { AnyProvider, ProviderKind, SearchProvider } from '../market.types';

/**
 * Vendor-neutral provider registry.
 *
 * Phase 4b.1 ships with ZERO adapters registered — no DataForSEO, no Google Ads,
 * no SERP. The registry exists so later sub-phases can register adapters without
 * touching call sites, and so the module is fully testable with no provider.
 *
 * Semantics (refinement 6): the market module being enabled is SEPARATE from any
 * provider being configured. A run that needs a capability with no configured
 * provider must fail with a clear "provider capability unavailable" — NOT be
 * treated as the whole module being disabled.
 */
export class ProviderCapabilityUnavailableError extends Error {
  constructor(public capability: ProviderKind) {
    super(`provider capability unavailable: ${capability}`);
    this.name = 'ProviderCapabilityUnavailableError';
  }
}

export class ProviderRegistry {
  private readonly providers = new Map<ProviderKind, SearchProvider[]>();

  /** Register an adapter (later sub-phases). Ignored if module disabled. */
  register(provider: SearchProvider): void {
    const list = this.providers.get(provider.kind) ?? [];
    list.push(provider);
    this.providers.set(provider.kind, list);
  }

  /** Whether the market module itself is enabled (independent of providers). */
  moduleEnabled(): boolean {
    return marketConfig.enabled;
  }

  /** Is at least one CONFIGURED provider available for a capability? */
  hasCapability(kind: ProviderKind): boolean {
    return (this.providers.get(kind) ?? []).some((p) => p.isConfigured());
  }

  /** First configured provider for a capability, or null (UNKNOWN — never a stub). */
  get<T extends AnyProvider = AnyProvider>(kind: ProviderKind): T | null {
    const p = (this.providers.get(kind) ?? []).find((x) => x.isConfigured());
    return (p as T) ?? null;
  }

  /** Get or throw a clear capability-unavailable error (for run orchestration in 4b.2+). */
  require<T extends AnyProvider = AnyProvider>(kind: ProviderKind): T {
    const p = this.get<T>(kind);
    if (!p) throw new ProviderCapabilityUnavailableError(kind);
    return p;
  }

  /** Ids of every configured provider (diagnostics). */
  configuredIds(): string[] {
    return [...this.providers.values()].flat().filter((p) => p.isConfigured()).map((p) => p.id);
  }
}

/** Process-wide registry. Empty in 4b.1. */
export const providerRegistry = new ProviderRegistry();
