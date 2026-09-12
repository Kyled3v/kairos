# KAIROS VS Code Extension

Integrates the KAIROS autonomous agent platform into VS Code.

## Setup

1. Start the KAIROS server: \
px tsx src/server.ts\`n2. Install this extension (F5 to launch dev host)
3. Set \kairos.serverUrl\ and \kairos.apiToken\ in settings

## Commands

| Command | Description |
|---|---|
| \KAIROS: Run Goal\ | Run a goal through KAIROS |
| \KAIROS: Show Experience\ | View last 20 experience records |
| \KAIROS: Show Memory\ | Search memory store |
| \KAIROS: Analyse Experience\ | Show success rate summary |

## Build

```
cd packages/vscode
npm install
npm run compile
```
