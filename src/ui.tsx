/** @jsxImportSource hono/jsx */
import { PublicClient } from "viem";
import { SiweConfig } from "./provider.js";
import { Layout } from "@openauthjs/openauth/ui/base";
import { getTheme } from "@openauthjs/openauth/ui/theme";

/**
 * Configuration options for the SIWE UI component
 */
export interface SiweUiOptions {
  /** Viem public client instance */
  client: PublicClient;
  /** Optional statement to display in the SIWE message */
  statement?: string;
  /** Optional list of resources to include in the SIWE message */
  resources?: string[];
  /** Optional WalletConnect project ID for WalletConnect integration */
  walletConnectProjectId?: string;
}

/**
 * Creates a SIWE UI configuration with wallet connection options
 * @param options - UI configuration options
 * @returns SIWE provider configuration with UI implementation
 * @example
 * ```typescript
 * import { createPublicClient, http } from 'viem'
 * import { mainnet } from 'viem/chains'
 * import { SiweUi } from '@openauthjs/openauth-siwe'
 *
 * const client = createPublicClient({
 *   chain: mainnet,
 *   transport: http()
 * })
 *
 * const provider = SiweProvider(SiweUi({
 *   client,
 *   statement: "Sign in to My dApp",
 *   walletConnectProjectId: "your-project-id"
 * }))
 * ```
 */
export function SiweUi({
  client,
  statement,
  resources,
  walletConnectProjectId,
}: SiweUiOptions): SiweConfig {
  return {
    client,
    async signin(request, nonce) {
      const theme = getTheme();
      const _url = new URL(request.url);
      const host = request.headers.get("x-forwarded-host") || _url.host;
      const url = new URL(_url.pathname, `${_url.protocol}//${host}`);
      const chainId = await client.getChainId();
      const jsx = (
        <Layout>
          <div
            data-component="connectors-list"
            style={{
              display: "flex",
              "flex-direction": "column-reverse",
              gap: "1rem",
              "justify-content": "center",
            }}
          ></div>
          <script
            type="importmap"
            dangerouslySetInnerHTML={{
              __html: `
            {
              "imports": {
                "@wagmi/core": "https://esm.sh/@wagmi/core@^2.16.3",
                "@wagmi/connectors": "https://esm.sh/@wagmi/connectors@^5.7.3?standalone&exports=coinbaseWallet,walletConnect",
                "viem/": "https://esm.sh/viem@^2.22.8/"
              }  
            }
            `,
            }}
          ></script>
          <script
            type="module"
            dangerouslySetInnerHTML={{
              __html: `
            import { createConfig, watchConnectors, http, signMessage, getConnectors } from "@wagmi/core"
            import { coinbaseWallet, walletConnect } from "@wagmi/connectors"
            import { mainnet } from "viem/chains"
            import { createSiweMessage } from "viem/siwe"

            const darkMode = window.matchMedia("(prefers-color-scheme: dark)").matches
            const appName = "${theme.title}"
            const appLogoUrl = darkMode ? "${theme.logo.dark}" : "${
                theme.logo.light
              }" 

            const config = createConfig({
              chains: [mainnet],
              transports: {
                [mainnet.id]: http()
              },
              connectors: [
                coinbaseWallet({
                  appName,
                  appLogoUrl,
                }),
                ${
                  walletConnectProjectId
                    ? `walletConnect({
                  projectId: "${walletConnectProjectId}",
                  metadata: {
                    name: appName,
                    url: window.location.origin,
                    description: appName,
                    icons: [appLogoUrl]
                  }
                })`
                    : ""
                }
              ]
            })

            const connectors = getConnectors(config)
            populateConnectors(connectors)
            
            async function populateConnectors(connectors) {
              const list = document.querySelector("[data-component=connectors-list]")
              list.innerHTML = ""

              if (connectors.length === 0) {
                list.textContent = "No connectors available"
              } else {
                for (const connector of connectors) {
                  const button = document.createElement("button")
                  button.dataset.component = "button"
                  button.type = "button"
                  if (connector.icon) {
                    const icon = document.createElement("img")
                    icon.src = connector.icon
                    icon.width = 24
                    icon.alt = connector.name
                    button.appendChild(icon)
                  }
                  button.appendChild(document.createTextNode(connector.name))

                  button.addEventListener("click", async () => {
                    const { accounts: [account] } = await connector.connect({ chainId: ${chainId} })
                    const message = createSiweMessage({
                      chainId: ${chainId},
                      address: account,
                      domain: "${url.host}",
                      nonce: "${nonce}",
                      uri: "${url.href}",
                      version: "1",
                      resources: ${JSON.stringify(resources)},
                      ${statement ? `statement: "${statement}",` : ""}
                    })

                    const signature = await signMessage(config, { message, account, connector })

                    window.location.href = "${new URL("./verify", url).href}?message=" + encodeURIComponent(message) + "&signature=" + encodeURIComponent(signature)
                  })

                  list.appendChild(button)
                }
              }
            }
            `,
            }}
          ></script>
        </Layout>
      );
      return new Response(jsx.toString(), {
        headers: {
          "Content-Type": "text/html",
        },
      });
    },
  };
}
