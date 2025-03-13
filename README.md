# Safe Watcher

This repository contains a bot that monitors one or more Safe addresses for critical activities throughout the entire transaction lifecycle:

- **Adding Transactions:** Detects when new transactions are created in the Safe.
- **Signing Transactions:** Monitors who signs the transactions and how many signatures have been collected.
- **Executing Transactions:** Sends alerts when a transaction is executed.

Additionally, the bot watches for any suspicious `delegateCall`. If a `delegateCall` is directed to an address other than the trusted `MultiSend` contract, the bot immediately flags it, helping to prevent attacks similar to the Bybit hack.

Real-time alerts are sent to a configured Telegram channel for immediate notification.

## Usage

The Safe Watcher can be deployed in multiple ways:

### Quick Start with Docker Compose (Recommended)

1. Clone this repository
2. Create your environment file:

```bash
# Copy the example file and edit it with your values
cp stack.env.example stack.env
nano stack.env
```

3. Run with Docker Compose:

```bash
docker-compose up -d
```

### Alternative: Direct Docker Run with YAML Config

If you prefer using a YAML configuration file:

```bash
# Create a config.yaml file based on the example
cp config.example.yaml config.yaml
nano config.yaml  # Edit with your settings

# Run with Docker
docker run -v $(pwd)/config.yaml:/app/config.yaml ghcr.io/creedxyz/safe-watcher:latest
```

## Configuration

The Safe Watcher can be configured in two ways:

### Option 1: Configuration File (YAML)

If you prefer to use a YAML file for configuration (suitable for direct Docker runs):

1. Create a `config.yaml` file in your local directory based on [config.example.yaml](config.example.yaml):

   ```yaml
   telegramBotToken: "xxxx"
   telegramChannelId: "-1111"
   safeAddresses:
     - "eth:0x11111"
   signers:
     "0x22222": "alice"
     "0x33333": "bob"
   ```

2. Mount this file when running the container (see "Running via Docker" section below).

### Option 2: Environment Variables (Recommended for Docker Compose & Portainer)

For Docker Compose and Portainer deployments, copy and edit the provided `stack.env.example` file:

```
# Telegram Bot Settings
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHANNEL_ID=your_telegram_channel_id

# Safe Addresses (comma-separated list with chain prefix)
# Example: eth:0x123...,arb:0x456...,matic:0x789...
SAFE_ADDRESSES=eth:0x1234567890abcdef1234567890abcdef12345678,matic:0x1234567890abcdef1234567890abcdef12345678

# Signers (comma-separated list of address:name pairs)
# Example: 0x123:Alice,0x456:Bob
SIGNERS=0x1234567890abcdef1234567890abcdef12345678:Alice,0x1234567890abcdef1234567890abcdef12345678:Bob

# Polling Interval in seconds (how often to check for new transactions)
POLL_INTERVAL=20

# Safe URL (for generating links in notifications)
SAFE_URL=https://app.safe.global

# API Mode (classic, alt, or fallback)
API=fallback

# Optional Slack Webhook URL
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

This method is more suitable for containerized deployments and doesn't require mounting a configuration file.

### Configuration Parameters

- **telegramBotToken / TELEGRAM_BOT_TOKEN:** Your Telegram Bot API token (instructions below).
- **telegramChannelId / TELEGRAM_CHANNEL_ID:** The ID of the channel or group where alerts will be posted.
- **slackWebhookUrl / SLACK_WEBHOOK_URL:** (Optional) The URL of the Slack webhook.
- **safeAddresses / SAFE_ADDRESSES:** One or more Safe addresses to monitor, prefixed by the network identifier (e.g., `eth:` for Ethereum mainnet).
- **signers / SIGNERS:** A mapping of addresses to descriptive names (useful for labeling owners in alerts).
- **pollInterval / POLL_INTERVAL:** How often to check for new transactions (in seconds).
- **safeURL / SAFE_URL:** The URL of the Safe web app for generating links.

### Getting a Telegram Bot Token

1. Open the Telegram app and start a chat with `@BotFather`.
2. Type `/start` if you haven't used BotFather before.
3. Send the command `/newbot` and follow the prompts:
   - Provide a name for your bot (display name).
   - Provide a username for your bot (it must end in "bot", e.g., `MySafeNotifierBot`).
4. Once the bot is created, BotFather will provide you with an HTTP API token (e.g., `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`).
5. Copy this token and use it as the value for `telegramBotToken` in your `config.yaml`.

### Getting a Telegram Channel ID

1. Create a new channel or group in Telegram.
2. Invite your bot to the channel.
3. Send a message to the channel.
4. Use getUpdates (Testing Locally or Anywhere You Can Send HTTP Requests)

- Make a call to the [getUpdates](https://core.telegram.org/bots/api#getupdates) endpoint of the Bot API using your bot token. For example: https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates

The response is a JSON that contains “messages,” “channel_posts,” “callback_query,” or similar objects, depending on how your bot receives interactions.

5. Parse the JSON

- Look for the `"chat"` object inside each message (e.g., `"message"` or `"edited_message"`).
- The `"chat": { "id": ... }` field is the chat ID. For example, a response might look like:

```json
{
  "ok": true,
  "result": [
    {
      "update_id": 123456789,
      "message": {
        "message_id": 12,
        "from": {
          ...
        },
        "chat": {
          "id": 987654321,
          "first_name": "John",
          "type": "private"
        },
        "date": 1643212345,
        "text": "Hello"
      }
    }
  ]
}
```

In this snippet, 987654321 is the telegramChannelId.
.

### Running via Docker

You can run the Docker container with your config file mounted using the following command:

```bash
docker run -v $(pwd)/config.yaml:/app/config.yaml ghcr.io/creedxyz/safe-watcher:latest
```

The bot will start and immediately begin monitoring the specified Safe addresses. Any relevant changes or suspicious `delegateCall` attempts will be sent to your Telegram channel.

### Deploying with Docker Compose

1. First, customize the `stack.env` file with your specific configuration:

```bash
# Edit the stack.env file with your values
nano stack.env
```

2. Run the application using Docker Compose:

```bash
docker-compose up -d
```

This will use the environment variables from `stack.env` to configure the application.

To check the logs:

```bash
docker-compose logs -f
```

To update the configuration:

```bash
# Edit the stack.env file with your changes
nano stack.env

# Restart the container to apply changes
docker-compose restart
```

### Deploying with Portainer (GitOps)

The repository includes configuration files for automated deployments using Portainer's GitOps feature:

1. **stack.env**: Contains all environment variables needed by the application
2. **docker-compose.yml**: Defines the service with the correct environment setup

To deploy with Portainer:

1. Ensure your repository contains the `docker-compose.yml` file
2. In Portainer, navigate to "Stacks" and click "Add stack"
3. Select "Repository" as the build method
4. Enter your Git repository URL (e.g., `https://github.com/creedxyz/creed-safe-watcher.git`)
5. Specify the branch (e.g., `main`)
6. Set the required environment variables in Portainer's "Environment variables" section:
   - TELEGRAM_BOT_TOKEN
   - TELEGRAM_CHANNEL_ID
   - SAFE_ADDRESSES
7. Click "Deploy the stack"

When you update your configuration:

1. In Portainer, go to your stack
2. Update the environment variables as needed
3. Click "Pull and redeploy" if you also want to pull the latest code

This GitOps approach enables version-controlled configuration and simplified deployment updates.

## License

This project is distributed under the MIT License.

## Disclaimer

This software is provided "as is," without warranties or guarantees of any kind. Use it at your own risk. The maintainers and contributors are not liable for any damages or losses arising from its use. Always exercise caution and follow best security practices when managing crypto assets.
