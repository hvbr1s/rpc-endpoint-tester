# Ethereum RPC Endpoint Tester

A comprehensive testing tool for validating Ethereum-compatible RPC endpoints.

## Features

- **Chain Identification**: Verifies chain ID and network name
- **Block Number Testing**: Tests block retrieval with performance metrics
- **Balance Queries**: Validates account balance lookups
- **EIP-1559 Support Detection**: Tests fee history and gas pricing models
- **Smart Parameter Detection**: Auto-detects whether nodes expect hex strings or numbers
- **Reward Field Detection**: Flags whether nodes return priority fee percentiles

## Quick Start

```bash
npm install
npm run <network>
```

## Available Networks

```bash
npm run eth         # Ethereum Mainnet
npm run bsc         # BSC Mainnet
npm run og          # 0G-Aristotle
npm run sei         # SEI Mainnet
npm run sapphire    # Oasis Sapphire
npm run tac         # TAC Mainnet
npm run etherlink   # Etherlink
npm run router      # RouterChain
```

## Custom RPC Testing

```bash
npx ts-node script.ts <RPC_URL> [expected_chain_id]
```

### Examples

```bash
npx ts-node script.ts https://eth.llamarpc.com
npx ts-node script.ts http://localhost:8545 1
npx ts-node script.ts https://rpc.ankr.com/eth 1
```

## Output

The script tests and reports:

- ✅ Chain ID and network name
- ✅ Latest block number with response times
- ✅ Account balance lookups
- ✅ EIP-1559 support (base fees, priority fees)
- ✅ Parameter format (hex string vs number)
- ✅ Reward field support (priority fee percentiles)
- ✅ Legacy gas price

## Network Compatibility

| Network | Chain ID | Parameter Format | Reward Field |
|---------|----------|------------------|--------------|
| Ethereum | 1 | Hex string | ✓ |
| BSC | 56 | Hex string | ✓ |
| 0G | 16661 | Hex string | ✓ |
| SEI | 1329 | Hex string | ✓ |
| Sapphire | 23294 | Hex string | ✓ |
| TAC | 239 | Number | ✓ |
| Etherlink | 42793 | Hex string | ✗ |

## Environment Variables

Create a `.env` file:

```bash
FORDEFI_EVM_VAULT_ADDRESS=0x...
```

This address will be tested for balance queries alongside the zero address.

## Key Features

### Dual Parameter Format Support
The script automatically tries hex format first (`'0xa'`) and falls back to number format (`10`) if needed, ensuring compatibility with all RPC implementations.

### Reward Field Detection
Identifies whether the RPC endpoint returns priority fee percentiles in the `eth_feeHistory` response, which is critical for accurate gas estimation.

## Exit Codes

- `0`: All tests passed
- `1`: Some or all tests failed
