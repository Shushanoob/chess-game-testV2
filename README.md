# Chess School — working test build

## GitHub Pages
Upload the contents of this folder to the root of a GitHub Pages repository. `index.html` is in the root and no Yandex SDK is required for the test build.

The online client connects to:
`wss://chess-game-server-yca1.onrender.com`

## Render server
The `server/` folder contains the matching WebSocket server. Deploy it as a Render Web Service with:
- Build: `npm install`
- Start: `npm start`

## Current online features
- quick match / rooms
- reconnect grace period (60s)
- agreed pause (30/60/120s)
- chat
- moves and match info panels
- mobile portrait/landscape layout
- in-match settings for pieces/board/coordinates
- captured-material display
- safe new-game navigation dialog
