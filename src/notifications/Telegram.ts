import type { Markdown } from "@vlad-yakovlev/telegram-md";
import { md } from "@vlad-yakovlev/telegram-md";

import logger from "../logger.js";
import type { Signer } from "../safe/index.js";
import type { Event, EventType, INotifier } from "../types.js";

const ACTIONS: Record<EventType, string> = {
  created: "created",
  updated: "updated",
  executed: "executed",
  malicious: "ALERT! ACTION REQUIRED: MALICIOUS TRANSACTION DETECTED!",
};

const NETWORKS: Record<string, string> = {
  // Testnets
  gor: "Goerli Testnet",
  "gnosis-chiado": "Gnosis Chiado Testnet",
  sep: "Sepolia Testnet",
  "base-sepolia": "Base Sepolia Testnet",
  // Mainnets
  eth: "Eth Mainnet",
  matic: "Polygon",
  polygon: "Polygon",
  gno: "Gnosis Chain",
  base: "Base",
  arb: "Arbitrum",
  avalanche: "Avalanche",
  oeth: "Optimism",
  zkevm: "zkEVM",
  bsc: "Binance",
  aurora: "Aurora",
  blast: "Blast",
  celo: "Celo",
  linea: "Linea",
  mantle: "Mantle",
  scroll: "Scroll",
  worldchain: "Worldchain",
  xlayer: "XLayer",
  zksync: "zkSync",
};

export interface TelegramOptions {
  safeURL: string;
  telegramBotToken: string;
  telegramChannelId: string;
}

export class Telegram implements INotifier {
  readonly #botToken: string;
  readonly #channelId: string;
  readonly #safeURL: string;

  constructor(opts: TelegramOptions) {
    this.#botToken = opts.telegramBotToken;
    this.#channelId = opts.telegramChannelId;
    this.#safeURL = opts.safeURL;
  }

  public async send(event: Event): Promise<void> {
    logger.info(
      {
        eventType: event.type,
        chain: event.chainPrefix,
        tx: event.tx.safeTxHash.substring(0, 10) + "...",
        pending: event.pending.length,
      },
      "Processing notification event",
    );

    const msg = this.#getMessage(event);
    await this.#sendToTelegram(msg.toString());
  }

  public async sendStartupMessage(
    safeAddresses: string[],
    nonceStats?: Map<string, number>,
  ): Promise<void> {
    if (!this.#botToken || !this.#channelId) {
      logger.warn(
        "Cannot send startup message - Telegram is not properly configured",
      );
      return;
    }

    try {
      const watchedAddresses = safeAddresses.map(addr => {
        const [prefix, address] = addr.split(":");
        const network = NETWORKS[prefix] || prefix;

        // Add countUniqueNonce if available
        let addressInfo;
        if (nonceStats && nonceStats.has(addr)) {
          const uniqueNonceCount = nonceStats.get(addr);
          // Use string concatenation for the parentheses part to avoid any potential escaping issues
          addressInfo =
            md`${network}: ${address} ` + `(Nonce: ${uniqueNonceCount})`;
        } else {
          addressInfo = md`${network}: ${address}`;
        }

        return addressInfo;
      });

      const components = [
        "🚀 *Safe Watcher Started*",
        `Watching ${safeAddresses.length} Safe address${safeAddresses.length > 1 ? "es" : ""}:`,
        md.join(watchedAddresses, "\n\n"),
      ];

      const msg = md.join(components, "\n\n");
      logger.info("Sending detailed startup message to Telegram");
      await this.#sendToTelegram(msg.toString());
    } catch (error) {
      logger.error({ error }, "Failed to send startup message to Telegram");
    }
  }

  #getMessage(event: Event): Markdown {
    const { type, chainPrefix, safe, tx } = event;

    const link = md.link(
      "🔗 transaction",
      `${this.#safeURL}/${chainPrefix}:${safe}/transactions/queue`,
    );
    const proposer = md`Proposed by: ${printSigner(tx.proposer)}`;
    let confirmations = md.join(tx.confirmations.map(printSigner), ", ");
    confirmations = md`Signed by: ${confirmations}`;

    const msg = md`${ACTIONS[type]} ${NETWORKS[chainPrefix]} multisig [${tx.confirmations.length}/${tx.confirmationsRequired}] with safeTxHash ${md.inlineCode(tx.safeTxHash)} and nonce ${md.inlineCode(tx.nonce)}`;

    const components = [msg, proposer, confirmations];
    const links = [link];
    components.push(md.join(links, " ‖ "));

    return md.join(components, "\n\n");
  }

  async #sendToTelegram(text: string): Promise<void> {
    if (!this.#botToken || !this.#channelId) {
      logger.warn(
        "telegram messages not configured - botToken or channelId missing",
      );
      logger.debug(
        {
          hasBotToken: !!this.#botToken,
          hasChannelId: !!this.#channelId,
        },
        "telegram configuration status",
      );
      return;
    }

    // Always use HTML mode - it's more forgiving than MarkdownV2
    logger.info("Attempting to send message to Telegram");
    const url = `https://api.telegram.org/bot${this.#botToken}/sendMessage`;

    // Convert to HTML and remove any escaping backslashes
    let messageTxt = text
      // First remove any accidental Markdown escape characters
      .replace(/\\([()[\]{}#*_~>+=|!.,-])/g, "$1")
      // Then convert to HTML
      .replace(/\*([^*]+)\*/g, "<b>$1</b>") // Bold
      .replace(/_([^_]+)_/g, "<i>$1</i>") // Italic
      .replace(/`([^`]+)`/g, "<code>$1</code>") // Code
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>'); // Links

    const parseMode = "HTML";

    const requestBody = {
      chat_id: this.#channelId,
      parse_mode: parseMode,
      text: messageTxt,
    };

    try {
      logger.debug(
        { url, chatId: this.#channelId },
        "Sending telegram message",
      );

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const responseData = await response.json();
        logger.info({ responseData }, "telegram message sent successfully");
      } else {
        const err = await response.text();
        logger.error(
          {
            status: response.status,
            statusText: response.statusText,
            error: err,
            text: text.substring(0, 100) + (text.length > 100 ? "..." : ""), // Log truncated message for debugging
          },
          "telegram API error response",
        );
        throw new Error(`${response.statusText}: ${err}`);
      }
    } catch (err) {
      logger.error(
        {
          err,
          text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        },
        "cannot send to telegram",
      );
    }
  }
}

function printSigner({ address, name }: Signer): Markdown {
  return name ? md.bold(name) : md.inlineCode(address);
}
