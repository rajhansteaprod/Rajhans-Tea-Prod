import { providerRegistry } from './provider.registry';
import { DataForSeoProvider } from './dataforseo/dataforseo.provider';

let bootstrapped = false;

/**
 * Explicit, idempotent provider registration. This is NOT a hidden import side
 * effect — nothing registers a provider merely by being imported. An entrypoint
 * (the 4b.2 validation script; a future cron/route in later phases) must call
 * this itself. Safe to call more than once; registers each provider only once.
 */
export function bootstrapMarketProviders(): void {
  if (bootstrapped) return;
  providerRegistry.register(new DataForSeoProvider());
  bootstrapped = true;
}

/** Test-only: reset the idempotency guard between test cases. */
export function __resetProviderBootstrapForTests(): void {
  bootstrapped = false;
}
