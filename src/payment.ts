import { x402ResourceServer } from "@x402/mcp";
import { HTTPFacilitatorClient, type FacilitatorConfig } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { createFacilitatorConfig } from "@coinbase/x402";
import type { Network, PaymentRequirements } from "@x402/core/types";

/**
 * Payment plumbing for the MCP storefront (SPEC §4: x402 in-band, same
 * facilitator, same payout wallet, same prices as everywhere). Mirrors the
 * origin's resolveFacilitator fail-fast rule: mainnet refuses to start
 * without CDP credentials — a storefront that cannot settle must not exist.
 */

export interface PaymentEnv {
  network: "base" | "base-sepolia";
  payTo: string;
  cdpApiKeyId?: string;
  cdpApiKeySecret?: string;
  facilitatorUrl?: string;
}

export interface PaymentSetup {
  resourceServer: x402ResourceServer;
  network: Network;
  payTo: string;
  /** Pre-built requirements for a paid tool (price differs per tool). */
  acceptsFor(priceUsd: number): Promise<PaymentRequirements[]>;
}

export function toCaip2(network: "base" | "base-sepolia"): Network {
  return (network === "base" ? "eip155:8453" : "eip155:84532") as Network;
}

export async function buildPaymentSetup(env: PaymentEnv): Promise<PaymentSetup> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(env.payTo)) {
    throw new Error("payments require a valid PAYOUT_WALLET_ADDRESS (0x…)");
  }
  let facilitator: HTTPFacilitatorClient;
  if (env.cdpApiKeyId && env.cdpApiKeySecret) {
    facilitator = new HTTPFacilitatorClient(
      createFacilitatorConfig(env.cdpApiKeyId, env.cdpApiKeySecret) as FacilitatorConfig,
    );
  } else if (env.network === "base" && !env.facilitatorUrl) {
    throw new Error(
      "X402_NETWORK=base (mainnet) requires CDP_API_KEY_ID + CDP_API_KEY_SECRET (or an explicit FACILITATOR_URL)",
    );
  } else {
    facilitator = new HTTPFacilitatorClient({ url: env.facilitatorUrl ?? "https://x402.org/facilitator" });
  }

  const network = toCaip2(env.network);
  const resourceServer = new x402ResourceServer(facilitator);
  resourceServer.register(network, new ExactEvmScheme());
  await resourceServer.initialize();

  return {
    resourceServer,
    network,
    payTo: env.payTo,
    acceptsFor: (priceUsd: number) =>
      resourceServer.buildPaymentRequirements({
        scheme: "exact",
        network,
        payTo: env.payTo,
        price: `$${priceUsd}`,
      }),
  };
}
