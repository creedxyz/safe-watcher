import type { Address, Hash, Hex } from "viem";

import { BaseApi } from "./BaseApi.js";
import type { ISafeAPI, ListedSafeTx, SafeTx } from "./types.js";

type TxID = `multisig_${Address}_${Hash}`;

type TxStatus =
  | "AWAITING_CONFIRMATIONS"
  | "AWAITING_EXECUTION"
  | "SUCCESS"
  | "FAILED"
  | "CANCELLED";

interface Transaction {
  safeAddress: Address;
  txId: TxID;
  executedAt: null | number;
  txStatus: TxStatus;
  txInfo: TxInfo;
  txData: TxData;
  txHash: null | Hash;
  detailedExecutionInfo: DetailedExecutionInfo;
  // safeAppInfo: SafeAppInfo;
  note: null | string;
}

interface TxInfo {
  type: string;
  humanDescription: null | string;
  to: AddressInfo;
  dataSize: string;
  value: string;
  methodName: string;
  actionCount: number;
  isCancellation: boolean;
}

interface AddressInfo {
  value: Address;
  name: string;
  logoUri: string;
}

interface TxData {
  hexData: Hex;
  // dataDecoded: DataDecoded;
  to: AddressInfo;
  value: string;
  operation: number;
  trustedDelegateCallTarget: boolean;
  addressInfoIndex: Record<Address, AddressInfo>;
}

interface DetailedExecutionInfo {
  type: string;
  submittedAt: number;
  nonce: number;
  safeTxGas: string;
  baseGas: string;
  gasPrice: string;
  gasToken: string;
  refundReceiver: AddressInfo;
  safeTxHash: Hash;
  executor: null | string;
  signers: AddressInfo[];
  confirmationsRequired: number;
  confirmations: Confirmation[];
  rejectors: any[];
  gasTokenInfo: null | any;
  trusted: boolean;
  proposer: AddressInfo;
  proposedByDelegate: null | any;
}

interface Confirmation {
  signer: AddressInfo;
  signature: Hex;
  submittedAt: number;
}

interface ListTransactionsResp {
  next: string | null;
  previous: string | null;
  results: ListTransactionsResult[];
}

interface ListTransactionsResult {
  type: string;
  transaction: ListedTx;
  conflictType: string;
}

interface ListedTx {
  txInfo: TxInfo;
  id: TxID;
  timestamp: number;
  txStatus: TxStatus;
  executionInfo: ExecutionInfo;
  // safeAppInfo: SafeAppInfo;
  txHash: string | null;
}

interface ExecutionInfo {
  type: string;
  nonce: number;
  confirmationsRequired: number;
  confirmationsSubmitted: number;
  missingSigners: AddressInfo[] | null;
}

interface ParsedTxId {
  multisig: Address;
  safeTxHash: Hash;
}

function parseTxId(id: TxID): ParsedTxId {
  const [__, multisig, safeTxHash] = id.split("_");
  return { multisig: multisig as Address, safeTxHash: safeTxHash as Hash };
}

const CHAIN_IDS: Record<string, number> = {
  // Testnets
  gor: 5,
  gchi: 10200, // gnosis chiado
  sep: 11155111, // sepolia
  bsep: 84532, // base sepolia
  // Mainnets
  eth: 1, // ethereum
  matic: 137, // polygon
  poly: 137, // polygon alias
  gno: 100, // gnosis
  base: 8453,
  arb: 42161, // arbitrum
  avax: 43114, // avalanche
  oeth: 10, // optimism
  pzkv: 1101, // polygon zkevm
  bsc: 56,
  aur: 1313161554, // aurora
  blast: 81457,
  celo: 42220,
  line: 59144, // linea
  mant: 5000, // mantle
  scrl: 534352, // scroll
  wrld: 196, // worldchain
  xlay: 196, // xlayer
  zks: 324, // zksync
};

function normalizeListed(tx: ListedTx): ListedSafeTx {
  const { safeTxHash } = parseTxId(tx.id);
  return {
    safeTxHash,
    nonce: tx.executionInfo.nonce,
    confirmations: tx.executionInfo.confirmationsSubmitted,
    confirmationsRequired: tx.executionInfo.confirmationsRequired,
    isExecuted: tx.txStatus === "SUCCESS",
  };
}

function normalizeDetailed(tx: Transaction): SafeTx<Address> {
  const { safeTxHash } = parseTxId(tx.txId);
  return {
    safeTxHash,
    nonce: tx.detailedExecutionInfo.nonce,
    to: tx.txData.to.value,
    operation: tx.txData.operation,
    proposer: tx.detailedExecutionInfo.confirmations?.[0].signer.value ?? "0x0",
    confirmations:
      tx.detailedExecutionInfo.confirmations?.map(c => c.signer.value) ?? [],
    confirmationsRequired: tx.detailedExecutionInfo.confirmationsRequired,
    isExecuted: tx.txStatus === "SUCCESS",
  };
}

export class AltAPI extends BaseApi implements ISafeAPI {
  public async fetchAll(): Promise<{
    txs: ListedSafeTx[];
    countUniqueNonce?: number;
  }> {
    let url: string | null | undefined;
    const results: ListedTx[] = [];

    // The AltAPI doesn't provide countUniqueNonce directly
    // We'll calculate it based on the unique nonces in the transactions
    const uniqueNonces = new Set<number>();

    do {
      try {
        const data = await this.#fetchList(url);
        const transactions = data.results.map(tx => tx.transaction) ?? [];

        // Track unique nonces
        for (const tx of transactions) {
          uniqueNonces.add(tx.executionInfo.nonce);
        }

        results.push(...transactions);
        url = data.next;
      } catch (e) {
        this.logger.error(e);
        break;
      }
    } while (url);

    return {
      txs: results.map(normalizeListed),
      countUniqueNonce: uniqueNonces.size,
    };
  }

  public async fetchLatest(): Promise<ListedSafeTx[]> {
    const data = await this.#fetchList();
    return (data.results.map(tx => tx.transaction) ?? []).map(normalizeListed);
  }

  public async fetchDetailed(safeTxHash: Hash): Promise<SafeTx<Address>> {
    const tx = await this.#fetchOne(safeTxHash);
    return normalizeDetailed(tx);
  }

  async #fetchList(url?: string | null): Promise<ListTransactionsResp> {
    try {
      const u =
        url ?? `${this.apiURL}/safes/${this.address}/multisig-transactions`;
      const resp: ListTransactionsResp = await this.fetch(u);
      return resp;
    } catch (e) {
      this.logger.error(e);
      return { results: [], next: null, previous: null };
    }
  }

  async #fetchOne(safeTxHash: Hash): Promise<Transaction> {
    this.logger.debug(`loading tx ${safeTxHash}`);
    const data: Transaction = await this.fetch(
      `${this.apiURL}/transactions/${safeTxHash}`,
    );
    this.logger.debug(`loaded tx ${safeTxHash}`);
    return data;
  }

  private get chainId(): number {
    const chainId = CHAIN_IDS[this.prefix];
    if (!chainId) {
      throw new Error(`no chain id for prefix '${this.prefix}'`);
    }
    return chainId;
  }

  private get apiURL(): string {
    return `https://safe-client.safe.global/v1/chains/${this.chainId}`;
  }
}
