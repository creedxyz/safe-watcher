import type { Address, Hash } from "viem";

import { BaseApi } from "./BaseApi.js";
import type { ISafeAPI, ListedSafeTx, SafeTx } from "./types.js";

// export interface SafeMultisigTransactionResponse {
interface SafeMultisigTransaction {
  // safe: string;
  to: Address;
  // value: string;
  // data: string;
  operation: number;
  // gasToken: string;
  // safeTxGas: number;
  // baseGas: number;
  // gasPrice: string;
  // refundReceiver: string;
  nonce: number;
  executionDate?: string;
  submissionDate: string;
  // modified: Date;
  // blockNumber?: number;
  transactionHash: Hash;
  safeTxHash: Hash;
  // executor: string;
  isExecuted: boolean;
  // isSuccessful?: boolean;
  // ethGasPrice: string;
  // maxFeePerGas: string;
  // maxPriorityFeePerGas: string;
  // gasUsed?: number;
  // fee: string;
  // origin: string;
  // dataDecoded: DataDecoded;
  proposer: Address;
  confirmationsRequired: number;
  confirmations: SafeMultisigConfirmationResponse[];
  // trusted: boolean;
  // signatures: string;
}

interface SafeMultisigConfirmationResponse {
  owner: Address;
  submissionDate: string;
  transactionHash?: Hash;
  signature: Hash;
  signatureType: string;
}

interface SafeMultisigTransactionData {
  /**
   * Total number of transactions
   */
  count: number;
  /**
   * URL to fetch next page
   */
  next?: string | null;
  /**
   * URL to fetch previos page
   */
  previous?: string | null;
  /**
   * Array of results, max 100 results
   */
  results?: SafeMultisigTransaction[];
  countUniqueNonce: number;
}

function normalizeListed(tx: SafeMultisigTransaction): ListedSafeTx {
  return {
    safeTxHash: tx.safeTxHash,
    nonce: tx.nonce,
    confirmations: tx.confirmations?.length ?? 0,
    confirmationsRequired: tx.confirmationsRequired,
    isExecuted: tx.isExecuted,
  };
}

function normalizeDetailed(tx: SafeMultisigTransaction): SafeTx<Address> {
  return {
    safeTxHash: tx.safeTxHash,
    nonce: tx.nonce,
    to: tx.to,
    operation: tx.operation,
    proposer: tx.proposer,
    confirmations: tx.confirmations.map(c => c.owner),
    confirmationsRequired: tx.confirmationsRequired,
    isExecuted: tx.isExecuted,
  };
}

const APIS: Record<string, string> = {
  // Testnets
  gor: "https://safe-transaction-goerli.safe.global",
  "gnosis-chiado": "https://safe-transaction-chiado.safe.global",
  sep: "https://safe-transaction-sepolia.safe.global",
  "base-sepolia": "https://safe-transaction-base-sepolia.safe.global",
  // Mainnets
  eth: "https://safe-transaction-mainnet.safe.global",
  matic: "https://safe-transaction-polygon.safe.global",
  polygon: "https://safe-transaction-polygon.safe.global",
  gno: "https://safe-transaction-gnosis-chain.safe.global",
  base: "https://safe-transaction-base.safe.global",
  arb: "https://safe-transaction-arbitrum.safe.global",
  avalanche: "https://safe-transaction-avalanche.safe.global",
  oeth: "https://safe-transaction-optimism.safe.global",
  zkevm: "https://safe-transaction-zkevm.safe.global",
  bsc: "https://safe-transaction-bsc.safe.global",
  aurora: "https://safe-transaction-aurora.safe.global",
  blast: "https://safe-transaction-blast.safe.global",
  celo: "https://safe-transaction-celo.safe.global",
  linea: "https://safe-transaction-linea.safe.global",
  mantle: "https://safe-transaction-mantle.safe.global",
  scroll: "https://safe-transaction-scroll.safe.global",
  worldchain: "https://safe-transaction-worldchain.safe.global",
  xlayer: "https://safe-transaction-xlayer.safe.global",
  zksync: "https://safe-transaction-zksync.safe.global",
};

export class ClassicAPI extends BaseApi implements ISafeAPI {
  readonly #txs = new Map<Hash, SafeMultisigTransaction>();

  public async fetchAll(): Promise<{
    txs: ListedSafeTx[];
    countUniqueNonce?: number;
  }> {
    let url: string | null | undefined;
    const results: SafeMultisigTransaction[] = [];
    let countUniqueNonce: number | undefined;

    // Get the first batch and extract countUniqueNonce
    const initialData = await this.#fetchMany();
    countUniqueNonce = initialData.countUniqueNonce;
    results.push(...(initialData.results ?? []));
    url = initialData.next;

    // Get any remaining pages if necessary
    while (url) {
      const data = await this.#fetchMany(url);
      results.push(...(data.results ?? []));
      url = data.next;
    }

    for (const result of results) {
      this.#txs.set(result.safeTxHash, result);
    }

    return {
      txs: results.map(normalizeListed),
      countUniqueNonce,
    };
  }

  public async fetchLatest(): Promise<ListedSafeTx[]> {
    const data = await this.#fetchMany();
    const txs = data.results ?? [];
    for (const tx of txs) {
      this.#txs.set(tx.safeTxHash, tx);
    }
    return txs.map(normalizeListed);
  }

  public async fetchDetailed(safeTxHash: Hash): Promise<SafeTx<Address>> {
    const cached = this.#txs.get(safeTxHash);
    if (cached) {
      return normalizeDetailed(cached);
    }
    const data = await this.#fetchOne(safeTxHash);
    this.#txs.set(data.safeTxHash, data);
    return normalizeDetailed(data);
  }

  async #fetchMany(url?: string | null): Promise<SafeMultisigTransactionData> {
    const u =
      url ??
      `${this.apiURL}/api/v1/safes/${this.address}/multisig-transactions/`;
    const data = await this.fetch(u);
    return data;
  }

  async #fetchOne(safeTxHash: Hash): Promise<SafeMultisigTransaction> {
    const url = `${this.apiURL}/api/v1/safes/${this.address}/multisig-transactions/${safeTxHash}`;
    const data = await this.fetch(url);
    return data;
  }

  private get apiURL(): string {
    let api = APIS[this.prefix];
    if (!api) {
      throw new Error(`no API URL for chain '${this.prefix}'`);
    }
    return api;
  }
}
