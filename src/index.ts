import { setTimeout } from "node:timers/promises";

import { loadConfig } from "./config/index.js";
import Healthcheck from "./Healthcheck.js";
import logger from "./logger.js";
import { NotificationSender, Slack, Telegram } from "./notifications/index.js";
import SafeWatcher from "./SafeWatcher.js";

async function run() {
  const config = await loadConfig();

  const sender = new NotificationSender();
  const telegramNotifier = new Telegram(config);
  await sender.addNotifier(telegramNotifier);

  // add Slack notifier if configured
  if (config.slackWebhookUrl) {
    await sender.addNotifier(
      new Slack({
        webhookUrl: config.slackWebhookUrl,
        safeURL: config.safeURL,
      }),
    );
    console.log("Added notifier");
  }

  // Log that we're about to start watching
  logger.info(
    {
      addressCount: config.safeAddresses.length,
      addresses: config.safeAddresses,
    },
    "Preparing to watch Safe addresses",
  );

  // Create watchers but don't start them yet
  const watchers = config.safeAddresses.map(
    safe =>
      new SafeWatcher({
        safe,
        signers: config.signers,
        notifier: sender,
      }),
  );

  // Start watchers with delay and collect stats
  const safeStats = await Promise.all(
    watchers.map(async (watcher, i) => {
      await setTimeout(1000 * i);
      return watcher.start(config.pollInterval * 1000);
    }),
  );

  // Collect countUniqueNonce data for Telegram startup message
  const safeStatsMap = new Map<string, number>();
  config.safeAddresses.forEach((address, i) => {
    const countUniqueNonce = safeStats[i].countUniqueNonce;
    if (countUniqueNonce !== undefined) {
      safeStatsMap.set(address, countUniqueNonce);
    }
  });

  // Send a detailed startup message with countUniqueNonce information
  try {
    await telegramNotifier.sendStartupMessage(
      config.safeAddresses,
      safeStatsMap,
    );
    logger.info("Detailed startup notification sent successfully");
  } catch (error) {
    logger.error({ error }, "Failed to send detailed startup notification");
  }

  const healthcheck = new Healthcheck();
  await healthcheck.run();
}

run().catch(e => {
  logger.error(e);
  process.exit(1);
});
