const socket = io();
const root = document.querySelector("#app");
const GOOD_NAMES = { diamond: "Diamonds", gold: "Gold", silver: "Silver", cloth: "Cloth", spice: "Spice", leather: "Leather", camel: "Camels" };
const GOOD_ICONS = { diamond: "◆", gold: "●", silver: "◈", cloth: "▤", spice: "✦", leather: "⬟", camel: "🐪" };
const GOODS = ["diamond", "gold", "silver", "cloth", "spice", "leather"];
const savedRoom = sessionStorage.getItem("jaipurRoom");
let game = null;
let identity = savedRoom ? JSON.parse(savedRoom) : null;
let selectedHand = new Set();
let selectedMarket = new Set();
let selectionMode = "take";
let errorMessage = "";
let toastTimer;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function score(player) {
  return GOODS.reduce((sum, good) => sum + (player.coins[good] || []).reduce((value, coin) => value + coin, 0), 0)
    + (player.camelBonus || 0);
}

function emitWithAck(event, data) {
  return new Promise((resolve) => socket.emit(event, data, resolve));
}

function showToast(message) {
  clearTimeout(toastTimer);
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "alert");
  toast.textContent = message;
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 3500);
}

function renderLanding() {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand"><div class="brand-mark">J</div><div><p class="brand-title">Jaipur</p><p class="brand-caption">The trading game</p></div></div>
        <div class="online-pill"><span class="online-dot"></span> Online multiplayer</div>
      </header>
      <section class="landing">
        <div class="hero">
          <div class="hero-ornament" aria-hidden="true">♞</div>
          <span class="eyebrow">A game for two merchants</span>
          <h1>Trade well.<br>Earn your seal.</h1>
          <p>Build your herd, bargain for precious goods, and outscore one other player to become Jaipur's most successful trader.</p>
        </div>
        <form class="lobby-card" id="lobby-form">
          <h2>Enter the market</h2>
          <p class="subtle">Play online with a friend. One player creates a room; the other joins with its code.</p>
          <label class="field-label" for="player-name">Your name</label>
          <input class="text-input" id="player-name" name="name" maxlength="18" placeholder="How should we call you?" required autocomplete="nickname">
          <button class="button form-button" type="button" id="create-room">Create a room</button>
          <div class="divider">or join a friend</div>
          <label class="field-label" for="room-code">Room code</label>
          <input class="text-input" id="room-code" name="room" maxlength="5" placeholder="e.g. JA4P2" autocomplete="off" style="text-transform:uppercase;letter-spacing:.14em">
          <button class="button button-secondary form-button" type="button" id="join-room">Join room</button>
          <p class="error-message" role="status">${escapeHtml(errorMessage)}</p>
        </form>
      </section>
      <section class="rules" aria-label="How to play">
        <div class="rule"><strong>Trade</strong><span>Take a good, collect camels, or exchange cards with the market.</span></div>
        <div class="rule"><strong>Sell</strong><span>Sell matching goods for tokens. Bigger bundles earn a bonus.</span></div>
        <div class="rule"><strong>Win</strong><span>Score the most points in a round to claim a seal. First to two wins.</span></div>
      </section>
    </div>`;
  document.querySelector("#create-room").addEventListener("click", createRoom);
  document.querySelector("#join-room").addEventListener("click", joinRoom);
  document.querySelector("#lobby-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (document.querySelector("#room-code").value.trim()) joinRoom();
    else createRoom();
  });
  document.querySelector("#room-code").addEventListener("input", (event) => {
    event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  });
}

async function createRoom() {
  const name = document.querySelector("#player-name").value.trim();
  if (!name) return showLandingError("Enter your name first.");
  const result = await emitWithAck("createRoom", { name });
  if (result.error) return showLandingError(result.error);
  saveIdentity(result);
}

async function joinRoom() {
  const name = document.querySelector("#player-name").value.trim();
  const roomCode = document.querySelector("#room-code").value.trim().toUpperCase();
  if (!name) return showLandingError("Enter your name first.");
  if (!roomCode) return showLandingError("Enter the room code from your friend.");
  const result = await emitWithAck("joinRoom", { name, roomCode });
  if (result.error) return showLandingError(result.error);
  saveIdentity(result);
}

function showLandingError(message) {
  errorMessage = message;
  const target = document.querySelector(".error-message");
  if (target) target.textContent = message;
}

function saveIdentity(result) {
  identity = { roomCode: result.roomCode, playerKey: result.playerKey };
  sessionStorage.setItem("jaipurRoom", JSON.stringify(identity));
  errorMessage = "";
}

function cardTile(card, index, area) {
  const selected = area === "hand" ? selectedHand.has(index) : selectedMarket.has(index);
  const enabled = game?.turn === game?.seat && !game?.roundOver;
  const canSelect = area === "hand" ? enabled : enabled && (selectionMode === "exchange" || (selectionMode === "take" && card !== "camel"));
  const label = card === "camel" ? "Camel" : GOOD_NAMES[card];
  return `<button type="button" class="card-tile ${card}${selected ? " selected" : ""}" data-area="${area}" data-index="${index}" aria-label="${area === "hand" ? "Your" : "Market"} ${label} card${selected ? ", selected" : ""}" aria-pressed="${selected}" ${canSelect ? "" : "disabled"}>
    <span class="card-icon" aria-hidden="true">${GOOD_ICONS[card]}</span><span class="card-name">${label}</span>
  </button>`;
}

function tokenRows() {
  return GOODS.map((good) => {
    const left = game.tokensRemaining[good];
    const topValues = game.tokenTops[good];
    return `<div class="token-row"><span class="token-symbol" style="color:var(--${good}-color)">${GOOD_ICONS[good]}</span><strong>${GOOD_NAMES[good]}</strong><span class="token-stack">${topValues.map((value) => `<span class="token-dot">${value}</span>`).join("")}${left === 0 ? '<span class="token-dot empty">0</span>' : ""}</span></div>`;
  }).join("");
}

function playerCard(player, index) {
  const isCurrent = game.turn === index;
  const active = isCurrent && !game.roundOver;
  return `<div class="player-card${active ? " active" : ""}">
    <div class="player-avatar">${escapeHtml(player.name.charAt(0).toUpperCase())}</div>
    <div class="player-meta"><strong>${escapeHtml(player.name)}${index === game.seat ? " (you)" : ""}</strong><span>${player.handSize} cards · ${player.camels} camels · ${"★".repeat(player.seals)}${"☆".repeat(2 - player.seals)}</span></div>
    <div class="player-points"><strong>${score(player)}</strong><span>points</span></div>
  </div>`;
}

function renderWaiting() {
  const player = game.players[game.seat];
  const opponentConnected = game.connected[1 - game.seat];
  root.innerHTML = `
    <div class="shell">
      <header class="topbar"><div class="brand"><div class="brand-mark">J</div><div><p class="brand-title">Jaipur</p><p class="brand-caption">The trading game</p></div></div><div class="online-pill"><span class="online-dot"></span> Room open</div></header>
      <section class="panel waiting-panel">
        <div class="brand-mark">J</div><span class="eyebrow">Welcome, ${escapeHtml(player.name)}</span>
        <h2>Invite your trading partner</h2>
        <p class="subtle">Share this room code with one friend. The game starts as soon as they join.</p>
        <div class="room-code">${game.roomCode}</div>
        <button class="button button-secondary copy-button" id="copy-code">Copy invite code</button>
        <p class="ready-note">${opponentConnected ? "Your friend is here!" : "Waiting for the second player…"}${game.connected[game.seat] ? "" : " Reconnect to continue."}</p>
      </section>
    </div>`;
  document.querySelector("#copy-code").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(game.roomCode);
      showToast("Room code copied.");
    } catch {
      showToast(`Share room code ${game.roomCode} with your friend.`);
    }
  });
}

function renderGame() {
  if (!game) return renderLanding();
  if (!game.started) return renderWaiting();
  const ownTurn = game.turn === game.seat && !game.roundOver;
  const ownPlayer = game.players[game.seat];
  const marketLabel = selectionMode === "exchange" ? "Choose goods to take" : "Jaipur's market";
  const instruction = !ownTurn
    ? `Waiting for ${escapeHtml(game.players[game.turn].name)} to trade…`
    : selectionMode === "sell"
      ? "Select matching goods from your hand, then confirm the sale."
      : selectionMode === "exchange"
        ? "Select 2 or more cards in your hand and the same number of market goods."
        : "Take one good, gather all camels, or trade cards with the market.";
  root.innerHTML = `
    <div class="shell game-shell">
      <header class="game-heading">
        <div><h1>Jaipur <span class="small-label">Round ${game.roundNumber}</span></h1><p class="game-subheading">Trade goods, collect tokens, and earn the Maharaja's seal.</p></div>
        <div class="room-pill">ROOM <strong>${game.roomCode}</strong></div>
      </header>
      <section class="score-strip">${playerCard(game.players[0], 0)}<span class="vs">VS</span>${playerCard(game.players[1], 1)}</section>
      <div class="game-grid">
        <div class="table-column">
          <section class="market-card">
            <div class="section-heading"><h2>${marketLabel}</h2><span class="market-meta">${game.deckCount} cards in draw deck</span></div>
            <div class="market-row">${game.market.map((card, index) => cardTile(card, index, "market")).join("")}</div>
          </section>
          <section class="hand-area">
            <div class="section-heading"><h2>Your hand</h2><span class="market-meta">${ownPlayer.hand.length}/7 cards · ${ownPlayer.camels} camels in herd</span></div>
            <div class="hand-cards">${ownPlayer.hand.map((card, index) => cardTile(card, index, "hand")).join("")}</div>
            <div class="action-row">${renderActions()}</div>
            <p class="instructions">${instruction}</p>
          </section>
        </div>
        <aside class="sidebar">
          <div class="turn-banner${ownTurn ? "" : " waiting"}">${game.roundOver ? "Round complete" : ownTurn ? "Your turn — make a move" : `${escapeHtml(game.players[game.turn].name)} is trading`}</div>
          <section class="panel side-panel"><h3>Goods tokens</h3><div class="token-list">${tokenRows()}</div><div class="herd-line"><span>Largest herd bonus</span><strong>5 points</strong></div></section>
          <section class="panel side-panel"><h3>At the table</h3><div class="log-list">${game.log.map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join("")}</div></section>
          ${game.connected[0] && game.connected[1] ? "" : `<div class="connection-note">The other player disconnected. The game will resume when they reconnect.</div>`}
        </aside>
      </div>
      ${game.roundOver ? renderRoundResult() : ""}
    </div>`;
  attachGameHandlers();
}

function renderActions() {
  const ownTurn = game.turn === game.seat && !game.roundOver;
  const selectedHandCards = [...selectedHand].map((index) => game.players[game.seat].hand[index]);
  const uniformHand = selectedHandCards.length > 0 && selectedHandCards.every((card) => card === selectedHandCards[0]);
  const sellable = uniformHand && selectedHandCards[0] !== "camel"
    && (!["diamond", "gold", "silver"].includes(selectedHandCards[0]) || selectedHandCards.length >= 2)
    && selectedHandCards.length <= game.tokensRemaining[selectedHandCards[0]];
  if (selectionMode === "sell") {
    return `<button class="button" id="confirm-sell" ${!ownTurn || !sellable ? "disabled" : ""}>Sell ${selectedHand.size || ""} goods</button>
      <button class="button button-secondary" id="cancel-mode">Cancel</button>`;
  }
  if (selectionMode === "exchange") {
    const exchangeValid = selectedHand.size >= 2 && selectedHand.size === selectedMarket.size && [...selectedMarket].every((index) => game.market[index] !== "camel");
    return `<button class="button" id="confirm-exchange" ${!ownTurn || !exchangeValid ? "disabled" : ""}>Exchange ${selectedHand.size || ""} cards</button>
      <button class="button button-secondary" id="cancel-mode">Cancel</button>`;
  }
  const selectedGood = selectedMarket.size === 1 ? [...selectedMarket][0] : null;
  const takeValid = selectedGood !== null && game.market[selectedGood] !== "camel" && game.players[game.seat].hand.length < 7;
  const camelCount = game.market.filter((card) => card === "camel").length;
  return `<button class="button" id="take-one" ${!ownTurn || !takeValid ? "disabled" : ""}>Take selected good</button>
    <button class="button button-secondary" id="take-camels" ${!ownTurn || camelCount === 0 || game.players[game.seat].hand.length > 7 ? "disabled" : ""}>Gather ${camelCount || ""} camels</button>
    <button class="button button-secondary" id="start-exchange" ${!ownTurn || game.players[game.seat].hand.length < 2 ? "disabled" : ""}>Exchange cards</button>
    <button class="button button-secondary" id="start-sell" ${!ownTurn || game.players[game.seat].hand.length === 0 ? "disabled" : ""}>Sell goods</button>`;
}

function renderRoundResult() {
  const result = game.roundResult;
  const winner = result.winner === null ? null : game.players[result.winner];
  const matchWinner = game.matchWinner === -1 ? null : game.players[game.matchWinner];
  const title = matchWinner ? `${escapeHtml(matchWinner.name)} wins Jaipur!` : winner ? `${escapeHtml(winner.name)} takes the seal!` : "A hard-fought tie";
  const description = matchWinner
    ? "Two seals secured — the market belongs to you."
    : `${escapeHtml(result.reason)}. ${winner ? "Ready for another round?" : "No seal this time; the match continues."}`;
  if (matchWinner) return `<div class="modal-backdrop"><section class="result-card"><div class="brand-mark">J</div><span class="eyebrow">Match complete</span><h2>${title}</h2><p>${description}</p>${resultScores()}<button class="button button-secondary" id="leave-game">Return to lobby</button></section></div>`;
  const ready = game.ready[game.seat];
  return `<div class="modal-backdrop"><section class="result-card"><div class="brand-mark">J</div><span class="eyebrow">Round complete</span><h2>${title}</h2><p>${description}</p>${resultScores()}
    <button class="button" id="ready-next" ${ready ? "disabled" : ""}>${ready ? "Waiting for your friend…" : "Play next round"}</button>
    <p class="ready-note">${game.ready[1 - game.seat] ? "Your friend is ready." : "Both players must be ready to continue."}</p>
    </section></div>`;
}

function resultScores() {
  return `<div class="result-scores">${game.players.map((player, index) => `<div class="result-score"><strong>${game.roundResult.scores[index]}</strong><span>${escapeHtml(player.name)} · ${player.seals} seal${player.seals === 1 ? "" : "s"}</span></div>`).join("")}</div>`;
}

function attachGameHandlers() {
  root.querySelectorAll(".card-tile").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index);
    const selection = button.dataset.area === "hand" ? selectedHand : selectedMarket;
    if (selection.has(index)) selection.delete(index);
    else selection.add(index);
    renderGame();
  }));
  root.querySelector("#take-one")?.addEventListener("click", () => {
    if (selectedMarket.size === 1) submitAction({ type: "takeOne", marketIndex: [...selectedMarket][0] });
  });
  root.querySelector("#take-camels")?.addEventListener("click", () => submitAction({ type: "takeCamels" }));
  root.querySelector("#start-exchange")?.addEventListener("click", () => { selectionMode = "exchange"; selectedHand.clear(); selectedMarket.clear(); renderGame(); });
  root.querySelector("#start-sell")?.addEventListener("click", () => { selectionMode = "sell"; selectedHand.clear(); selectedMarket.clear(); renderGame(); });
  root.querySelector("#cancel-mode")?.addEventListener("click", () => { selectionMode = "take"; selectedHand.clear(); selectedMarket.clear(); renderGame(); });
  root.querySelector("#confirm-sell")?.addEventListener("click", () => submitAction({ type: "sell", indices: [...selectedHand] }));
  root.querySelector("#confirm-exchange")?.addEventListener("click", () => submitAction({ type: "exchange", handIndices: [...selectedHand], marketIndices: [...selectedMarket] }));
  root.querySelector("#ready-next")?.addEventListener("click", async () => {
    const result = await emitWithAck("readyNextRound", identity);
    if (result.error) showToast(result.error);
  });
  root.querySelector("#leave-game")?.addEventListener("click", () => {
    sessionStorage.removeItem("jaipurRoom");
    identity = null;
    game = null;
    errorMessage = "";
    renderLanding();
  });
}

async function submitAction(action) {
  const result = await emitWithAck("gameAction", { ...identity, action });
  if (result.error) {
    showToast(result.error);
    return;
  }
  selectedHand.clear();
  selectedMarket.clear();
  selectionMode = "take";
}

socket.on("connect", async () => {
  if (!identity) return;
  const result = await emitWithAck("resumeGame", identity);
  if (result.error) {
    sessionStorage.removeItem("jaipurRoom");
    identity = null;
    game = null;
    errorMessage = result.error;
    renderLanding();
  }
});
socket.on("disconnect", () => {
  if (game?.started) showToast("Connection lost. Reconnecting…");
});
socket.on("connect_error", () => showToast("Unable to connect to the game server."));
socket.on("gameState", (state) => {
  game = state;
  game.started = state.players.length === 2 && typeof state.turn === "number";
  selectedHand.clear();
  selectedMarket.clear();
  selectionMode = "take";
  renderGame();
});
renderLanding();
