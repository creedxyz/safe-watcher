import fs from "fs";
import path from "path";
import * as yaml from "yaml";
import { z } from "zod";

import { Schema } from "./schema.js";

/**
 * Try to load configuration from environment variables
 * Returns null if required variables are missing
 */
function tryLoadFromEnv(): Record<string, any> | null {
  console.log("Trying to load config from environment variables...");

  // Initialize the config object with defaults
  const config: Record<string, any> = {
    safeURL: "https://app.safe.global",
    pollInterval: 20,
    api: "fallback",
    signers: {},
  };

  // Check for required parameters
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.log("Missing TELEGRAM_BOT_TOKEN in environment");
    return null;
  }

  if (!process.env.TELEGRAM_CHANNEL_ID) {
    console.log("Missing TELEGRAM_CHANNEL_ID in environment");
    return null;
  }

  if (!process.env.SAFE_ADDRESSES) {
    console.log("Missing SAFE_ADDRESSES in environment");
    return null;
  }

  // All required variables exist, process them

  // Telegram setup
  config.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  config.telegramChannelId = process.env.TELEGRAM_CHANNEL_ID;
  console.log("Found Telegram credentials in environment");

  // Safe addresses
  const addresses = process.env.SAFE_ADDRESSES.split(",").map(addr =>
    addr.trim(),
  );
  if (addresses.length === 0) {
    console.log("SAFE_ADDRESSES is empty");
    return null;
  }
  config.safeAddresses = addresses;
  console.log(`Found ${addresses.length} Safe addresses in environment`);

  // Optional parameters
  if (process.env.SIGNERS) {
    const signersMap: Record<string, string> = {};
    process.env.SIGNERS.split(",").forEach(pair => {
      const [address, name] = pair.split(":").map(part => part.trim());
      if (address && name) {
        signersMap[address] = name;
      }
    });
    config.signers = signersMap;
    console.log(
      `Found ${Object.keys(signersMap).length} signers in environment`,
    );
  }

  if (process.env.SLACK_WEBHOOK_URL) {
    config.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    console.log("Found SLACK_WEBHOOK_URL in environment");
  }

  if (process.env.SAFE_URL) {
    config.safeURL = process.env.SAFE_URL;
    console.log(`Using SAFE_URL from environment: ${config.safeURL}`);
  }

  if (process.env.POLL_INTERVAL) {
    const interval = parseInt(process.env.POLL_INTERVAL, 10);
    if (!isNaN(interval) && interval > 0) {
      config.pollInterval = interval;
      console.log(
        `Using POLL_INTERVAL from environment: ${config.pollInterval}`,
      );
    } else {
      console.warn(
        `Invalid POLL_INTERVAL in environment: ${process.env.POLL_INTERVAL}, using default: ${config.pollInterval}`,
      );
    }
  }

  if (process.env.API) {
    if (["classic", "alt", "fallback"].includes(process.env.API)) {
      config.api = process.env.API;
      console.log(`Using API mode from environment: ${config.api}`);
    } else {
      console.warn(
        `Invalid API mode in environment: ${process.env.API}, using default: ${config.api}`,
      );
    }
  }

  return config;
}

/**
 * Try to load configuration from a YAML file
 */
function tryLoadFromYaml(filePath: string): Record<string, any> | null {
  try {
    console.log(`Trying to load config from ${filePath}...`);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      console.log(`Config file ${filePath} not found`);
      return null;
    }

    // Read and parse the YAML file
    const fileContent = fs.readFileSync(filePath, "utf8");
    const config = yaml.parse(fileContent);

    // Check for required fields
    if (!config.telegramBotToken) {
      console.log("Missing telegramBotToken in YAML config");
      return null;
    }

    if (!config.telegramChannelId) {
      console.log("Missing telegramChannelId in YAML config");
      return null;
    }

    if (
      !config.safeAddresses ||
      !Array.isArray(config.safeAddresses) ||
      config.safeAddresses.length === 0
    ) {
      console.log("Missing or invalid safeAddresses in YAML config");
      return null;
    }

    console.log(`Successfully loaded config from ${filePath}`);
    return config;
  } catch (error) {
    console.error(`Error loading config from ${filePath}:`, error);
    return null;
  }
}

/**
 * Main configuration loading function
 * Priority:
 * 1. Environment variables
 * 2. config.yaml
 */
export async function loadConfig(): Promise<Schema> {
  console.log("Loading configuration...");

  // Try loading from environment variables first
  const envConfig = tryLoadFromEnv();
  if (envConfig) {
    try {
      const validatedConfig = Schema.parse(envConfig);
      console.log(
        "Successfully loaded and validated configuration from environment variables",
      );
      return validatedConfig;
    } catch (error) {
      console.error("Failed to validate environment config:", error);
      // Continue to try YAML if validation fails
    }
  }

  // Try loading from YAML if environment variables failed or are incomplete
  const yamlConfig = tryLoadFromYaml("config.yaml");
  if (yamlConfig) {
    try {
      const validatedConfig = Schema.parse(yamlConfig);
      console.log(
        "Successfully loaded and validated configuration from config.yaml",
      );
      return validatedConfig;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(
          "YAML config validation error:",
          JSON.stringify(error.format(), null, 2),
        );
      } else {
        console.error("Error processing YAML config:", error);
      }
    }
  }

  // If we get here, all configuration methods failed
  throw new Error(
    "Failed to load valid configuration. Please provide either:\n" +
      "1. Environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, and SAFE_ADDRESSES, or\n" +
      "2. A valid config.yaml file",
  );
}
