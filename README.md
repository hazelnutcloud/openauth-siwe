# @openauthjs/openauth-siwe

Sign-In with Ethereum (SIWE) provider for OpenAuth.

## Features

- Easy integration with OpenAuth
- Built-in UI with wallet connection support
- Support for injected wallets, Coinbase Wallet and WalletConnect
- Customizable SIWE message parameters
- Type-safe implementation using TypeScript

## Installation

```bash
npm install @hazelnutcloud/openauth-siwe
```

## Usage

```typescript
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { SiweUi, SiweProvider } from "@openauthjs/openauth-siwe";
import { issuer } from "@openauthjs/openauth";

// Create a Viem public client
const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

// Use with OpenAuth
const app = issuer({
  providers: {
    siwe: SiweProvider(
      SiweUi({
        client,
        chainId: 1,
        statement: "Sign in to My dApp",
        walletConnectProjectId: "your-project-id", // Optional
      })
    ),
  },
});
```

## Configuration Options

### SiweUiOptions

| Option                   | Type           | Description                                               |
| ------------------------ | -------------- | --------------------------------------------------------- |
| `chainId`                | `number`       | Chain ID of the target Ethereum network                   |
| `client`                 | `PublicClient` | Viem public client instance                               |
| `statement`              | `string?`      | Optional statement to display in the SIWE message         |
| `resources`              | `string[]?`    | Optional list of resources to include in the SIWE message |
| `walletConnectProjectId` | `string?`      | Optional WalletConnect project ID                         |

## Custom UI Implementation

You can also implement your own UI by using the `SiweProvider` directly:

```typescript
const provider = SiweProvider({
  client,
  async signin(request, nonce) {
    // Return your custom signin page.
    return new Response("Custom signin page");
  },
});
```

## License

MIT
