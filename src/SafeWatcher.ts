import type { Logger } from "pino";
import type { Address, Hash } from "viem";

import type { PrefixedAddress } from "./config/index.js";
import { parsePrefixedAddress } from "./config/index.js";
import logger from "./logger.js";
import type {
  ISafeAPI,
  ListedSafeTx,
  SafeAPIMode,
  SafeTx,
  Signer,
} from "./safe/index.js";
import { MULTISEND_CALL_ONLY, SafeApiWrapper } from "./safe/index.js";
import type { INotificationSender } from "./types.js";

interface SafeWatcherOptions {
  safe: PrefixedAddress;
  signers?: Partial<Record<Address, string>>;
  notifier?: INotificationSender;
  api?: SafeAPIMode;
}

class SafeWatcher {
  readonly #prefix: string;
  readonly #safe: Address;
  readonly #notificationSender?: INotificationSender;
  readonly #logger: Logger;
  readonly #api: ISafeAPI;
  readonly #txs: Map<Hash, ListedSafeTx> = new Map();
  readonly #signers: Partial<Record<Address, string>>;

  #interval?: NodeJS.Timeout;

  constructor(opts: SafeWatcherOptions) {
    const [prefix, address] = parsePrefixedAddress(opts.safe);
    this.#logger = logger.child({ chain: prefix, address });
    this.#prefix = prefix;
    this.#safe = address;
    this.#notificationSender = opts.notifier;
    this.#signers = opts.signers ?? {};
    this.#api = new SafeApiWrapper(opts.safe, opts.api);
  }

  public async start(pollInterval: number): Promise<void> {
    const txs = await this.#api.fetchAll();
    for (const tx of txs) {
      this.#txs.set(tx.safeTxHash, tx);
    }
    if (pollInterval > 0) {
      this.#interval = setInterval(() => {
        this.poll().catch(e => {
          this.#logger.error(e);
        });
      }, pollInterval);
    }
    this.#logger.info({ txs: txs.length }, "started watcher");
  }

  public stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
    }
  }

  private async poll(): Promise<void> {
    // assume that all updates fit into one page
    const txs = await this.#api.fetchLatest();
    const pendingTxs = txs
      .filter(tx => tx.isExecuted === false)
      .sort((a, b) => a.nonce - b.nonce);

    for (const tx of txs) {
      try {
        const old = this.#txs.get(tx.safeTxHash);
        if (old) {
          await this.#processTxUpdate(tx, old, pendingTxs);
        } else {
          await this.#processNewTx(tx, pendingTxs);
        }
      } catch (e) {
        this.#logger.error(e);
      }
    }
  }

  async #processNewTx(
    tx: ListedSafeTx,
    pending: ListedSafeTx[],
  ): Promise<void> {
    this.#logger?.info(
      { tx: tx.safeTxHash, nonce: tx.nonce },
      "detected new tx",
    );
    this.#txs.set(tx.safeTxHash, tx);
    const detailed = await this.#fetchDetailed(tx.safeTxHash);

    const isMalicious =
      !MULTISEND_CALL_ONLY.has(detailed.to.toLowerCase() as Address) &&
      detailed.operation !== 0;

    try {
      await this.#notificationSender?.notify({
        type: isMalicious ? "malicious" : "created",
        chainPrefix: this.#prefix,
        safe: this.#safe,
        tx: detailed,
        pending,
      });
    } catch (error) {
      this.#logger?.error(
        { txHash: tx.safeTxHash, error },
        "failed to send notification",
      );
    }
  }

  async #processTxUpdate(
    tx: ListedSafeTx,
    old: ListedSafeTx,
    pending: ListedSafeTx[],
  ): Promise<void> {
    this.#txs.set(tx.safeTxHash, tx);
    if (
      old.isExecuted === tx.isExecuted &&
      old.confirmations === tx.confirmations
    ) {
      return;
    }
    this.#logger?.info(
      { tx: tx.safeTxHash, nonce: tx.nonce, isExecuted: tx.isExecuted },
      "detected updated tx",
    );

    const detailed = await this.#fetchDetailed(tx.safeTxHash);

    await this.#notificationSender?.notify({
      type: tx.isExecuted ? "executed" : "updated",
      chainPrefix: this.#prefix,
      safe: this.#safe,
      tx: detailed,
      pending,
    });
  }

  async #fetchDetailed(safeTxHash: Hash): Promise<SafeTx<Signer>> {
    const tx = await this.#api.fetchDetailed(safeTxHash);
    return {
      ...tx,
      proposer: { address: tx.proposer, name: this.#signers[tx.proposer] },
      confirmations: tx.confirmations.map(c => ({
        address: c,
        name: this.#signers[c],
      })),
    };
  }
}

export default SafeWatcher;
