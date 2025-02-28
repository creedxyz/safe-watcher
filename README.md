![gearbox](header.png)

# Safe watcher

This repository contains simple app that watches safe multisig and notifies about various events:

- New transaction has been proposed (with some checks about suspicious transactions)
- Transaction has been signed by one of the signers
- Transaction has been executed

## Usage

Create config.yaml file with settings. See [config.example.yaml](config.example.yaml) and [schema.ts](src/config/schema.ts) for the reference. 

Run docker container with config.yaml file mounted to /app/config.yaml

```bash
docker run -v $(pwd)/config.local.yaml:/app/config.yaml ghcr.io/gearbox-protocol/safe-watcher:latest
```
