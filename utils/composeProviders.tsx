import React, { type ComponentType, type ReactNode } from "react";

type ProviderEntry = ComponentType<{ children: ReactNode }>;

/**
 * Composes multiple React context providers into a single wrapper.
 * Providers are applied from first to last (first = outermost).
 *
 * Usage:
 *   const AppProviders = composeProviders([ProviderA, ProviderB, ProviderC]);
 *   // equivalent to <ProviderA><ProviderB><ProviderC>{children}</ProviderC></ProviderB></ProviderA>
 */
export function composeProviders(
  providers: ProviderEntry[]
): ComponentType<{ children: ReactNode }> {
  return function ComposedProviders({ children }: { children: ReactNode }) {
    return providers.reduceRight<ReactNode>(
      (acc, Provider) => <Provider>{acc}</Provider>,
      children
    );
  };
}
