![gearbox](header.png)

# Safe watcher

This repository contains simple app that watches safe multisig and notifies about new transactions.

## Usage

Create config.yaml file with settings. See [config.example.yaml](config.example.yaml) and [schema.yaml](src/config/schema.ts) for reference. 

Run docker container with config.yaml file mounted to /app/config.yaml

```bash
docker run -v $(pwd)/config.yaml:/app/config.yaml ghcr.io/gearbox-protocol/safe-watcher:latest
```
