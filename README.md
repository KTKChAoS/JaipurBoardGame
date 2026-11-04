# Jaipur Online

A two-player, real-time Jaipur trading game. Start a room, share the five-character code with a friend, and play in a browser. There are no computer opponents.

## Run locally

Requires Node.js 20 or newer.

```powershell
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000). For online play outside your local network, host the server on a publicly reachable Node.js service and share its URL with both players.

## Play

One player creates a room and shares the code; the other joins it. Each turn, take a good, collect all camels in the market, or exchange two or more cards for the same number of market goods. Sell matching goods for their top tokens; selling three or more goods earns a bundle bonus. Jewel cards (diamonds, gold, and silver) must be sold in groups of at least two.

Players start with five goods cards; any camels dealt during setup join their face-up herd. A player may not finish a turn with more than seven cards. The round ends when three goods token piles are empty or the draw deck is exhausted. The player with the most points wins a seal; the largest camel herd earns five points (no bonus for a tie). The first player to two seals wins the match. Both players must be ready before the next round starts.

The server keeps active rooms in memory. A player can reconnect to the same room in the same browser session; restarting the server ends all rooms.

## Verify

```powershell
npm test
```
