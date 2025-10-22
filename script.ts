#!/usr/bin/env ts-node

import * as https from 'https';
import * as http from 'http';
import dotenv from 'dotenv';
import { URL } from 'url';

dotenv.config()

const TEST_ADDRESS =  process.env.FORDEFI_EVM_VAULT_ADDRESS || ""

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any[];
  id: number;
}

interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number;
}

interface RpcResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  responseTime: number;
  httpVersion: string;
  statusCode?: number;
  headers?: http.IncomingHttpHeaders;
}

interface BlockNumberResult {
  blockNumber: number;
  responseTime: number;
  httpVersion: string;
}

interface FeeHistoryResult {
  baseFeePerGas?: (string | number)[];
  gasUsedRatio: number[];
  oldestBlock: string;
  reward?: (string | number)[][];
}

interface TestResult {
  passed: number;
  failed: number;
  tests: Record<string, boolean>;
}

interface ChainInfo {
  [key: number]: string;
}

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
} as const;

class RPCTester {
  private rpcUrl: string;
  private expectedChainId: number | null;
  private parsedUrl: URL;
  private isHttps: boolean;
  private requestId: number = 0;
  private results: {
    chainId?: number;
    blockNumber?: number;
    eip1559?: boolean;
  } = {};

  constructor(rpcUrl: string, expectedChainId: number | null = null) {
    this.rpcUrl = rpcUrl;
    this.expectedChainId = expectedChainId;
    this.parsedUrl = new URL(rpcUrl);
    this.isHttps = this.parsedUrl.protocol === 'https:';
  }

  private async makeRequest<T = any>(method: string, params: any[] = []): Promise<RpcResponse<T>> {
    return new Promise((resolve, reject) => {
      const requestData: JsonRpcRequest = {
        jsonrpc: '2.0',
        method: method,
        params: params,
        id: ++this.requestId
      };

      const data = JSON.stringify(requestData);

      const options: http.RequestOptions = {
        hostname: this.parsedUrl.hostname,
        port: this.parsedUrl.port || (this.isHttps ? 443 : 80),
        path: this.parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      };

      const startTime = Date.now();
      const client = this.isHttps ? https : http;
      
      const req = client.request(options, (res: http.IncomingMessage) => {
        let responseData = '';
        const responseTime = Date.now() - startTime;
        
        res.on('data', (chunk: Buffer) => {
          responseData += chunk.toString();
        });

        res.on('end', () => {
          try {
            const parsed: JsonRpcResponse<T> = JSON.parse(responseData);
            resolve({
              result: parsed.result,
              error: parsed.error,
              responseTime: responseTime,
              httpVersion: res.httpVersion,
              statusCode: res.statusCode,
              headers: res.headers
            });
          } catch (e) {
            reject(new Error(`Failed to parse response: ${(e as Error).message}`));
          }
        });
      });

      req.on('error', (e: Error) => {
        reject(new Error(`Request failed: ${e.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(10000);
      req.write(data);
      req.end();
    });
  }

  public async testChainId(): Promise<boolean> {
    console.log(`\n${colors.bright}Testing eth_chainId...${colors.reset}`);
    
    try {
      const response = await this.makeRequest<string>('eth_chainId');
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (!response.result) {
        throw new Error('No result returned');
      }

      const chainId = parseInt(response.result, 16);
      this.results.chainId = chainId;
      
      const chainNames: ChainInfo = {
        1: 'Ethereum Mainnet',
        5: 'Goerli Testnet',
        11155111: 'Sepolia Testnet',
        137: 'Polygon Mainnet',
        80001: 'Polygon Mumbai',
        56: 'BSC Mainnet',
        97: 'BSC Testnet',
        43114: 'Avalanche C-Chain',
        43113: 'Avalanche Fuji',
        42161: 'Arbitrum One',
        421613: 'Arbitrum Goerli',
        10: 'Optimism',
        420: 'Optimism Goerli',
        8453: 'Base Mainnet',
        84531: 'Base Goerli',
        1329: 'SEI Mainnet',
        16661: '0G-Aristotle',
        9600: 'RouterChain',
        23294: 'Oasis Sapphire',
        239: 'TAC Mainnet',
        42793: 'Etherlink'
      };
      
      console.log(`${colors.green}✓${colors.reset} Chain ID: ${chainId} ${chainNames[chainId] ? `(${chainNames[chainId]})` : '(Unknown chain)'}`);
      console.log(`  Response time: ${response.responseTime}ms`);
      
      if (this.expectedChainId && chainId !== this.expectedChainId) {
        console.log(`${colors.yellow}⚠ Warning: Expected chain ID ${this.expectedChainId}, got ${chainId}${colors.reset}`);
      }
      
      return true;
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${(error as Error).message}${colors.reset}`);
      return false;
    }
  }

  public async testBlockNumber(): Promise<boolean> {
    console.log(`\n${colors.bright}Testing eth_blockNumber (multiple calls)...${colors.reset}`);
    
    const numCalls = 5;
    const results: BlockNumberResult[] = [];
    let http2Detected = false;
    
    try {
      for (let i = 0; i < numCalls; i++) {
        const response = await this.makeRequest<string>('eth_blockNumber');
        
        if (response.error) {
          throw new Error(response.error.message);
        }
        
        if (!response.result) {
          throw new Error('No result returned');
        }

        const blockNumber = parseInt(response.result, 16);
        results.push({
          blockNumber,
          responseTime: response.responseTime,
          httpVersion: response.httpVersion
        });
        
        if (response.httpVersion === '2.0') {
          http2Detected = true;
        }
      }
      if (results.length === 0) {
        throw new Error('No successful block number responses');
      }
      
      this.results.blockNumber = results[results.length - 1]!.blockNumber;
      
      // stats
      const responseTimes = results.map(r => r.responseTime);
      const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const minResponseTime = Math.min(...responseTimes);
      const maxResponseTime = Math.max(...responseTimes);
      
      console.log(`${colors.green}✓${colors.reset} Latest block: ${results[results.length - 1]!.blockNumber}`);
      console.log(`  HTTP Version: ${http2Detected ? 'HTTP/2' : results[0]!.httpVersion}`);
      console.log(`  Response times (${numCalls} calls):`);
      console.log(`    Average: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`    Min: ${minResponseTime}ms`);
      console.log(`    Max: ${maxResponseTime}ms`);
      
      // Check if blocks are incrementing (network is active)
      const blockNumbers = results.map(r => r.blockNumber);
      const isIncrementing = blockNumbers.some((block, i) => 
        i > 0 && block > blockNumbers[i - 1]!
      );
      
      if (isIncrementing) {
        console.log(`  ${colors.cyan}Network appears active (blocks incrementing)${colors.reset}`);
      }
      
      return true;
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${(error as Error).message}${colors.reset}`);
      return false;
    }
  }

  public async testGetBalance(): Promise<boolean> {
    console.log(`\n${colors.bright}Testing eth_getBalance...${colors.reset}`);
    
    const testAddresses: string[] = [
      '0x0000000000000000000000000000000000000000', 
      TEST_ADDRESS, 
    ];
    
    try {
      for (const address of testAddresses) {
        const response = await this.makeRequest<string>('eth_getBalance', [address, 'latest']);
        
        if (response.error) {
          throw new Error(response.error.message);
        }
        
        if (!response.result) {
          throw new Error('No result returned');
        }

        const balanceWei = BigInt(response.result);
        const balanceEth = Number(balanceWei) / 1e18;
        
        console.log(`${colors.green}✓${colors.reset} Address: ${address.slice(0, 10)}...`);
        console.log(`  Balance: ${balanceEth.toFixed(6)} ETH/SEI/BNB/0G (${balanceWei} wei)`);
        console.log(`  Response time: ${response.responseTime}ms`);
      }
      
      return true;
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${(error as Error).message}${colors.reset}`);
      return false;
    }
  }

  public async testFeeHistory(): Promise<boolean> {
    console.log(`\n${colors.bright}Testing eth_feeHistory (EIP-1559 support)...${colors.reset}`);

    try {
      // Try hex format first (more common in JSON-RPC spec)
      let response = await this.makeRequest<FeeHistoryResult>('eth_feeHistory', [
        '0xa', // 10 blocks in hex
        'latest',
        [25, 50, 75] // percentiles
      ]);

      let parameterFormat: 'hex' | 'number' | null = null;

      // If hex format fails, try number format
      if (response.error) {
        const hexError = response.error.message;

        // Try number format if hex failed (common error patterns)
        if (hexError.includes('unmarshal') || hexError.includes('destruct') ||
            hexError.includes('parse') || hexError.includes('invalid') ||
            hexError.includes('type') || hexError.includes('expected')) {

          console.log(`  ${colors.yellow}Hex format failed, trying number format...${colors.reset}`);

          response = await this.makeRequest<FeeHistoryResult>('eth_feeHistory', [
            10, // 10 blocks as number
            'latest',
            [25, 50, 75] // percentiles
          ]);

          if (!response.error) {
            parameterFormat = 'number';
          }
        }

        // If still erroring, check if it's lack of EIP-1559 support
        if (response.error) {
          if (response.error.message.includes('not found') ||
              response.error.message.includes('not supported')) {
            console.log(`${colors.yellow}⚠ EIP-1559 not supported (Legacy gas pricing)${colors.reset}`);
            this.results.eip1559 = false;
            return true;
          }
          throw new Error(response.error.message);
        }
      } else {
        parameterFormat = 'hex';
      }
      
      if (!response.result) {
        throw new Error('No result returned');
      }

      const feeHistory = response.result;
      this.results.eip1559 = true;
      
      // Check if baseFeePerGas exists (EIP-1559 indicator)
      if (feeHistory.baseFeePerGas && feeHistory.baseFeePerGas.length > 0) {
        const latestBaseFeeRaw = feeHistory.baseFeePerGas[feeHistory.baseFeePerGas.length - 1]!;
        const latestBaseFee = BigInt(typeof latestBaseFeeRaw === 'number' ? `0x${latestBaseFeeRaw.toString(16)}` : latestBaseFeeRaw);
        const latestBaseFeeGwei = Number(latestBaseFee) / 1e9;

        console.log(`${colors.green}✓ EIP-1559 Supported${colors.reset}`);
        if (parameterFormat) {
          console.log(`  ${colors.cyan}Parameter format: ${parameterFormat === 'hex' ? 'Hex string (0xa)' : 'Number (10)'}${colors.reset}`);
        }

        // Check if reward field is present
        const hasRewardField = feeHistory.reward && feeHistory.reward.length > 0;
        if (hasRewardField) {
          console.log(`  ${colors.cyan}Reward field: ✓ Supported (returns priority fee percentiles)${colors.reset}`);
        } else {
          console.log(`  ${colors.yellow}Reward field: ✗ Not supported (no priority fee data)${colors.reset}`);
        }

        console.log(`  Latest base fee: ${latestBaseFeeGwei.toFixed(2)} Gwei`);

        // Calculate average base fee
        const avgBaseFee = feeHistory.baseFeePerGas.reduce((sum: number, fee) => {
          const feeValue = typeof fee === 'number' ? `0x${fee.toString(16)}` : fee;
          return sum + Number(BigInt(feeValue)) / 1e9;
        }, 0) / feeHistory.baseFeePerGas.length;
        
        console.log(`  Average base fee (last 10 blocks): ${avgBaseFee.toFixed(2)} Gwei`);
        
        // Show reward percentiles if available
        if (feeHistory.reward && feeHistory.reward.length > 0) {
          const latestRewards = feeHistory.reward[feeHistory.reward.length - 1];
          if (latestRewards && latestRewards.length > 0) {
            console.log(`  Priority fee percentiles (latest block):`);
            const reward25 = typeof latestRewards[0] === 'number' ? `0x${latestRewards[0].toString(16)}` : latestRewards[0]!;
            const reward50 = typeof latestRewards[1] === 'number' ? `0x${latestRewards[1].toString(16)}` : latestRewards[1]!;
            const reward75 = typeof latestRewards[2] === 'number' ? `0x${latestRewards[2].toString(16)}` : latestRewards[2]!;
            console.log(`    25th: ${(Number(BigInt(reward25)) / 1e9).toFixed(2)} Gwei`);
            console.log(`    50th: ${(Number(BigInt(reward50)) / 1e9).toFixed(2)} Gwei`);
            console.log(`    75th: ${(Number(BigInt(reward75)) / 1e9).toFixed(2)} Gwei`);
          }
        }
      } else {
        console.log(`${colors.yellow}⚠ Legacy gas pricing (No EIP-1559)${colors.reset}`);
        this.results.eip1559 = false;
      }
      
      console.log(`  Response time: ${response.responseTime}ms`);
      return true;
      
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${(error as Error).message}${colors.reset}`);
      return false;
    }
  }

  // Additional test for gas price (legacy)
  public async testGasPrice(): Promise<boolean> {
    console.log(`\n${colors.bright}Testing eth_gasPrice (Legacy gas)...${colors.reset}`);
    
    try {
      const response = await this.makeRequest<string>('eth_gasPrice');
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (!response.result) {
        throw new Error('No result returned');
      }

      const gasPriceWei = BigInt(response.result);
      const gasPriceGwei = Number(gasPriceWei) / 1e9;
      
      console.log(`${colors.green}✓${colors.reset} Current gas price: ${gasPriceGwei.toFixed(2)} Gwei`);
      console.log(`  Response time: ${response.responseTime}ms`);
      
      return true;
    } catch (error) {
      console.log(`${colors.red}✗ Failed: ${(error as Error).message}${colors.reset}`);
      return false;
    }
  }

  public async runAllTests(): Promise<TestResult> {
    console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}         Ethereum RPC Endpoint Tester${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.cyan}RPC URL: ${this.rpcUrl}${colors.reset}`);
    console.log(`${colors.cyan}Protocol: ${this.isHttps ? 'HTTPS' : 'HTTP'}${colors.reset}`);
    
    interface Test {
      name: string;
      fn: () => Promise<boolean>;
    }

    const tests: Test[] = [
      { name: 'eth_chainId', fn: () => this.testChainId() },
      { name: 'eth_blockNumber', fn: () => this.testBlockNumber() },
      { name: 'eth_getBalance', fn: () => this.testGetBalance() },
      { name: 'eth_feeHistory', fn: () => this.testFeeHistory() },
      { name: 'eth_gasPrice', fn: () => this.testGasPrice() }
    ];
    
    const results: TestResult = {
      passed: 0,
      failed: 0,
      tests: {}
    };
    
    for (const test of tests) {
      try {
        const passed = await test.fn();
        results.tests[test.name] = passed;
        if (passed) {
          results.passed++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.log(`${colors.red}✗ Test ${test.name} crashed: ${(error as Error).message}${colors.reset}`);
        results.tests[test.name] = false;
        results.failed++;
      }
    }
    
    console.log(`\n${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bright}                    SUMMARY${colors.reset}`);
    console.log(`${colors.bright}${colors.blue}═══════════════════════════════════════════════════════${colors.reset}`);
    
    console.log(`${colors.green}Passed: ${results.passed}${colors.reset} | ${colors.red}Failed: ${results.failed}${colors.reset}`);
    
    if (this.results.chainId) {
      console.log(`\n${colors.cyan}Chain ID:${colors.reset} ${this.results.chainId}`);
    }
    
    if (this.results.blockNumber) {
      console.log(`${colors.cyan}Current Block:${colors.reset} ${this.results.blockNumber}`);
    }
    
    if (this.results.eip1559 !== undefined) {
      console.log(`${colors.cyan}Gas Model:${colors.reset} ${this.results.eip1559 ? 'EIP-1559 (Dynamic fees)' : 'Legacy (Fixed gas price)'}`);
    }
    
    if (results.passed === tests.length) {
      console.log(`\n${colors.green}${colors.bright}✓ All tests passed! RPC endpoint is fully functional.${colors.reset}`);
    } else if (results.passed > 0) {
      console.log(`\n${colors.yellow}${colors.bright}⚠ Some tests failed. RPC endpoint is partially functional.${colors.reset}`);
    } else {
      console.log(`\n${colors.red}${colors.bright}✗ All tests failed. RPC endpoint may be down or misconfigured.${colors.reset}`);
    }
    
    return results;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`${colors.bright}Usage:${colors.reset}`);
    console.log(`  ts-node rpc-tester.ts <RPC_URL> [expected_chain_id]`);
    console.log(`\n${colors.bright}Examples:${colors.reset}`);
    console.log(`  ts-node rpc-tester.ts https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY`);
    console.log(`  ts-node rpc-tester.ts http://localhost:8545 1`);
    console.log(`  ts-node rpc-tester.ts https://rpc.ankr.com/eth 1`);
    console.log(`\n${colors.bright}Or compile and run:${colors.reset}`);
    console.log(`  tsc rpc-tester.ts && node rpc-tester.js <RPC_URL>`);
    process.exit(1);
  }
  
  const rpcUrl = args[0];
  const expectedChainId = args[1] ? parseInt(args[1]) : null;
  
  // Validate URL
  try {
    new URL(rpcUrl!);
  } catch (error) {
    console.error(`${colors.red}Invalid URL: ${rpcUrl}${colors.reset}`);
    process.exit(1);
  }
  
  const tester = new RPCTester(rpcUrl!, expectedChainId);
  
  try {
    const results = await tester.runAllTests();
    process.exit(results.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error(`${colors.red}Fatal error: ${(error as Error).message}${colors.reset}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}