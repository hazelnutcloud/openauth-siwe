import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { Provider } from "@openauthjs/openauth/provider/provider";
import { PublicClient } from "viem";
import { isDomainMatch } from "@openauthjs/openauth/util";

/**
 * Configuration options for SIWE (Sign-In with Ethereum) provider
 */
export interface SiweConfig {
  /** Function to handle the signin request and return the signin page */
  signin(request: Request, nonce: string): Promise<Response>;
  /** Viem public client instance for Ethereum interactions */
  client: PublicClient;
}

/**
 * Structure of the SIWE message body received during authentication
 */
export interface SiweBody {
  /** Ethereum signature of the SIWE message */
  signature?: `0x${string}`;
  /** The SIWE message content */
  message?: string;
  /** Optional nonce value for verification */
  nonce?: number;
}

/**
 * Creates a SIWE (Sign-In with Ethereum) provider for OpenAuth
 * @param config - Provider configuration options
 * @returns Provider implementation that handles SIWE authentication
 * @example
 * ```typescript
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { SiweProvider } from '@openauthjs/openauth-siwe'
 * 
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * })
 * 
 * const provider = SiweProvider({
 *   client,
 *   async signin(request, nonce) {
 *     return new Response("Sign in with your wallet")
 *   }
 * })
 * ```
 */
export function SiweProvider(
  config: SiweConfig
): Provider<{ address: `0x${string}` }> {
  return {
    type: "siwe",
    init(routes, ctx) {
      routes.get("/authorize", async (c) => {
        const nonce = generateSiweNonce();
        await ctx.set(c, "nonce", 60 * 10, nonce);
        return ctx.forward(c, await config.signin(c.req.raw, nonce));
      });

      routes.post("/authorize", async (c) => {
        const body = (await c.req.json()) as SiweBody | undefined;
        if (!body || !body.signature || !body.message) {
          throw new Error("Invalid body");
        }
        let nonce = (await ctx.get(c, "nonce")) as string | undefined;
        if (!nonce) {
          if (!body.nonce) {
            throw new Error("Missing nonce");
          }
          if (body.nonce < Date.now() - 60 * 10 * 1000) {
            throw new Error("Expired nonce");
          }
          nonce = body.nonce.toString();
        }
        const {
          domain,
          nonce: messageNonce,
          address,
          uri,
        } = parseSiweMessage(body.message);
        if (messageNonce !== nonce) {
          throw new Error("Invalid nonce");
        }
        if (!domain || !uri || !address) {
          throw new Error("Invalid message");
        }
        const url = new URL(c.req.url);
        const host = c.req.header("x-forwarded-host") || url.host;
        if (!isDomainMatch(domain, host)) {
          throw new Error("Invalid domain");
        }
        if (!url.href.startsWith(uri)) {
          throw new Error("Invalid uri");
        }
        const valid = await config.client.verifySiweMessage({
          message: body.message,
          signature: body.signature,
        });
        if (!valid) {
          throw new Error("Invalid signature");
        }
        return await ctx.success(c, { address });
      });
    },
  };
}
