import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { Provider } from "@openauthjs/openauth/provider/provider";
import { PublicClient } from "viem";
import { isDomainMatch } from "@openauthjs/openauth/util";
import { Context } from "hono";

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

interface SiweVerificationError extends Error {
  code: string;
}

class InvalidSiweVerification extends Error implements SiweVerificationError {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

const REQUIRED_QUERY_PARAMS = ["message", "signature"] as const;

function validateQueryParams(c: Context): {
  message: string;
  signature: string;
} {
  const message = c.req.query("message");
  const signature = c.req.query("signature");

  if (!message || !signature) {
    throw new InvalidSiweVerification(
      "Missing required query parameters",
      "INVALID_PARAMS"
    );
  }

  return {
    message: decodeURIComponent(message),
    signature: decodeURIComponent(signature),
  };
}

async function validateSiweMessage(
  message: string,
  nonce: string | undefined,
  host: string,
  baseUrl: URL
): Promise<{ domain: string; address: `0x${string}` }> {
  if (!nonce) {
    throw new InvalidSiweVerification("Missing nonce", "MISSING_NONCE");
  }

  const parsed = parseSiweMessage(message);
  const { domain, nonce: messageNonce, address, uri } = parsed;

  if (messageNonce !== nonce) {
    throw new InvalidSiweVerification("Invalid nonce", "INVALID_NONCE");
  }

  if (!domain || !uri || !address) {
    throw new InvalidSiweVerification(
      "Invalid message format",
      "INVALID_MESSAGE"
    );
  }

  if (!isDomainMatch(domain, host)) {
    throw new InvalidSiweVerification("Domain mismatch", "INVALID_DOMAIN");
  }

  if (uri !== new URL("./authorize", baseUrl).href) {
    throw new InvalidSiweVerification("Invalid URI", "INVALID_URI");
  }

  return { domain, address };
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

      routes.get("/verify", async (c) => {
        const { message, signature } = validateQueryParams(c);
        const nonce = (await ctx.get(c, "nonce")) as string | undefined;

        const _url = new URL(c.req.url);
        const host = c.req.header("x-forwarded-host") || _url.host;
        const baseUrl = new URL(_url.pathname, `${_url.protocol}//${host}`);

        const { address } = await validateSiweMessage(
          message,
          nonce,
          host,
          baseUrl as URL
        );

        const valid = await config.client.verifySiweMessage({
          message,
          signature: signature as `0x${string}`,
        });

        if (!valid) {
          throw new InvalidSiweVerification(
            "Invalid signature",
            "INVALID_SIGNATURE"
          );
        }

        await ctx.unset(c, "nonce");
        return await ctx.success(c, { address });
      });
    },
  };
}
