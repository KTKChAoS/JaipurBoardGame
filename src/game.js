export const GOODS = ["diamond", "gold", "silver", "cloth", "spice", "leather"];
export const GOOD_NAMES = {
  diamond: "Diamonds",
  gold: "Gold",
  silver: "Silver",
  cloth: "Cloth",
  spice: "Spice",
  leather: "Leather",
  camel: "Camels",
};
export const GOOD_ICONS = {
  diamond: "◆",
  gold: "●",
  silver: "◈",
  cloth: "▤",
  spice: "✦",
  leather: "⬟",
  camel: "🐪",
};

const TOKEN_VALUES = {
  diamond: [5, 5, 5, 7, 7, 9],
  gold: [5, 5, 5, 6, 6, 7],
  silver: [5, 5, 5, 5, 5],
  cloth: [1, 1, 2, 2, 3, 3, 5],
  spice: [1, 1, 2, 2, 3, 3, 5],
  leather: [1, 1, 1, 1, 2, 2, 2, 3, 3, 4],
};
const BONUS_VALUES = {
  3: [3, 3, 3, 3, 3, 3, 3],
  4: [4, 4, 4, 4, 4, 4],
  5: [5, 5, 5, 5, 5],
};
const CARD_COUNTS = {
  diamond: 6,
  gold: 6,
  silver: 6,
  cloth: 8,
  spice: 8,
  leather: 10,
  camel: 11,
};

function shuffle(items, random = Math.random) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createDeck() {
  return Object.entries(CARD_COUNTS).flatMap(([card, count]) => Array(count).fill(card));
}

function createPlayer(name, key, seals = 0) {
  return { name, key, seals, hand: [], camels: 0, coins: Object.fromEntries(GOODS.map((good) => [good, []])) };
}

export function createRound(players, random = Math.random) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error("A Jaipur round needs exactly two players.");
  }

  const deck = shuffle(createDeck(), random);
  const roundPlayers = players.map((player) => createPlayer(player.name, player.key, player.seals ?? 0));
  for (const player of roundPlayers) {
    while (player.hand.length < 5) {
      const card = deck.pop();
      if (card === "camel") player.camels += 1;
      else player.hand.push(card);
    }
  }
  const market = [];
  for (let count = 0; count < 3; count += 1) {
    const camelIndex = deck.indexOf("camel");
    if (camelIndex < 0) throw new Error("The deck does not contain enough camels to start a round.");
    deck.splice(camelIndex, 1);
    market.push("camel");
  }
  while (market.length < 5) market.push(deck.pop());

  const tokens = Object.fromEntries(
    GOODS.map((good) => [good, [...TOKEN_VALUES[good]].sort((a, b) => a - b)]),
  );
  const bonuses = Object.fromEntries(
    Object.entries(BONUS_VALUES).map(([count, values]) => [count, shuffle([...values], random)]),
  );
  const firstPlayer = roundPlayers[0].camels === roundPlayers[1].camels
    ? (random() < 0.5 ? 0 : 1)
    : roundPlayers[0].camels > roundPlayers[1].camels ? 0 : 1;

  return {
    players: roundPlayers,
    market,
    deck,
    tokens,
    bonuses,
    turn: firstPlayer,
    roundNumber: 1,
    roundOver: false,
    roundResult: null,
    ready: [false, false],
    log: ["The market is open. Let the trading begin!"],
  };
}

function playerScore(player) {
  const goodsPoints = GOODS.reduce((score, good) => score + player.coins[good].reduce((sum, value) => sum + value, 0), 0);
  const camelPoints = player.coins.camels?.reduce((sum, value) => sum + value, 0) ?? 0;
  return goodsPoints + camelPoints;
}

function finishRound(game, reason) {
  if (game.roundOver) return;
  const [first, second] = game.players;
  if (first.camels !== second.camels) {
    const herdWinner = first.camels > second.camels ? first : second;
    herdWinner.coins.camels = [5];
  }

  const scores = game.players.map(playerScore);
  let winner = null;
  if (scores[0] !== scores[1]) winner = scores[0] > scores[1] ? 0 : 1;
  else if (first.camels !== second.camels) winner = first.camels > second.camels ? 0 : 1;

  if (winner !== null) game.players[winner].seals += 1;
  game.roundOver = true;
  game.roundResult = { reason, scores, winner };
  game.log.unshift(
    winner === null
      ? "The round is tied. No seal is awarded."
      : `${game.players[winner].name} wins the round and claims a seal!`,
  );
}

function replenishMarket(game, count) {
  for (let i = 0; i < count && game.deck.length > 0; i += 1) {
    game.market.push(game.deck.pop());
  }
}

function checkRoundEnd(game) {
  const emptyPiles = GOODS.filter((good) => game.tokens[good].length === 0).length;
  if (emptyPiles >= 3) finishRound(game, "Three goods piles are empty");
  else if (game.deck.length === 0) finishRound(game, "The draw deck is empty");
}

function takeOne(game, action) {
  const index = action.marketIndex;
  if (!Number.isInteger(index) || index < 0 || index >= game.market.length) {
    throw new Error("Choose a card that is still in the market.");
  }
  if (game.players[game.turn].hand.length >= 7) {
    throw new Error("You cannot finish a turn with more than seven cards.");
  }
  const card = game.market[index];
  if (card === "camel") throw new Error("Camels must be taken as a herd.");
  game.market.splice(index, 1);
  game.players[game.turn].hand.push(card);
  replenishMarket(game, 1);
  game.log.unshift(`${game.players[game.turn].name} took one ${GOOD_NAMES[card].toLowerCase()} card.`);
}

function takeCamels(game) {
  const player = game.players[game.turn];
  const herdSize = game.market.filter((card) => card === "camel").length;
  if (herdSize === 0) throw new Error("There are no camels in the market.");
  player.camels += herdSize;
  game.market = game.market.filter((card) => card !== "camel");
  replenishMarket(game, herdSize);
  game.log.unshift(`${player.name} gathered ${herdSize} camel${herdSize === 1 ? "" : "s"}.`);
}

function exchange(game, action) {
  const handIndices = action.handIndices;
  const marketIndices = action.marketIndices;
  if (!Array.isArray(handIndices) || !Array.isArray(marketIndices) || handIndices.length < 2) {
    throw new Error("An exchange needs at least two cards from your hand.");
  }
  if (handIndices.length !== marketIndices.length) {
    throw new Error("Trade the same number of cards in and out.");
  }
  if (
    new Set(handIndices).size !== handIndices.length ||
    handIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= game.players[game.turn].hand.length)
  ) {
    throw new Error("Your hand selection is not valid.");
  }
  if (
    new Set(marketIndices).size !== marketIndices.length ||
    marketIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= game.market.length)
  ) {
    throw new Error("Your market selection is not valid.");
  }
  if (marketIndices.some((index) => game.market[index] === "camel")) {
    throw new Error("You can only exchange for goods, not camels.");
  }

  const player = game.players[game.turn];
  const incoming = marketIndices.map((index) => game.market[index]);
  const outgoing = handIndices.map((index) => player.hand[index]);
  for (const index of [...handIndices].sort((a, b) => b - a)) player.hand.splice(index, 1);
  for (const index of [...marketIndices].sort((a, b) => b - a)) game.market.splice(index, 1);
  player.hand.push(...incoming);
  game.market.push(...outgoing.filter((card) => card !== "camel"));
  const camelsReturned = outgoing.filter((card) => card === "camel").length;
  player.camels += camelsReturned;
  replenishMarket(game, 5 - game.market.length);
  game.log.unshift(`${player.name} exchanged ${handIndices.length} cards with the market.`);
}

function sell(game, action) {
  const { indices } = action;
  const player = game.players[game.turn];
  if (!Array.isArray(indices) || indices.length === 0) throw new Error("Choose goods from your hand to sell.");
  if (
    new Set(indices).size !== indices.length ||
    indices.some((index) => !Number.isInteger(index) || index < 0 || index >= player.hand.length)
  ) {
    throw new Error("Your hand selection is not valid.");
  }
  const goods = indices.map((index) => player.hand[index]);
  const good = goods[0];
  if (!GOODS.includes(good) || goods.some((card) => card !== good)) {
    throw new Error("You can only sell one type of good at a time.");
  }
  if (["diamond", "gold", "silver"].includes(good) && indices.length < 2) {
    throw new Error("Diamonds, gold, and silver must be sold in groups of at least two.");
  }
  if (indices.length > game.tokens[good].length) {
    throw new Error("There are not enough tokens left for that sale.");
  }

  for (const index of [...indices].sort((a, b) => b - a)) player.hand.splice(index, 1);
  for (let count = 0; count < indices.length; count += 1) {
    player.coins[good].push(game.tokens[good].pop());
  }
  if (indices.length >= 3) {
    const bonusKey = String(Math.min(indices.length, 5));
    if (game.bonuses[bonusKey].length > 0) player.coins[good].push(game.bonuses[bonusKey].pop());
  }
  game.log.unshift(`${player.name} sold ${indices.length} ${GOOD_NAMES[good].toLowerCase()} card${indices.length === 1 ? "" : "s"}.`);
}

export function applyAction(game, action) {
  if (game.roundOver) throw new Error("This round has ended.");
  const player = game.players[game.turn];
  if (!player) throw new Error("The current player is unavailable.");

  switch (action?.type) {
    case "takeOne":
      takeOne(game, action);
      break;
    case "takeCamels":
      takeCamels(game);
      break;
    case "exchange":
      exchange(game, action);
      break;
    case "sell":
      sell(game, action);
      break;
    default:
      throw new Error("That move is not recognized.");
  }

  if (player.hand.length > 7) throw new Error("You cannot finish a turn with more than seven cards.");
  game.turn = 1 - game.turn;
  checkRoundEnd(game);
  return game;
}

export function continueRound(game, players) {
  if (!game.roundOver) throw new Error("The current round has not ended.");
  if (game.players.some((player) => player.seals >= 2)) throw new Error("The match has already been won.");
  const next = createRound(players.map((player, index) => ({
    ...player,
    seals: game.players[index].seals,
  })));
  next.roundNumber = game.roundNumber + 1;
  if (game.roundResult.winner !== null) next.turn = game.roundResult.winner;
  return next;
}

export function publicState(game, seat) {
  const own = game.players[seat];
  return {
    seat,
    players: game.players.map((player, index) => ({
      name: player.name,
      seals: player.seals,
      handSize: player.hand.length,
      hand: index === seat ? [...player.hand] : null,
      camels: player.camels,
      coins: Object.fromEntries(GOODS.map((good) => [good, [...player.coins[good]]])),
      camelBonus: player.coins.camels?.reduce((sum, value) => sum + value, 0) ?? 0,
    })),
    market: [...game.market],
    deckCount: game.deck.length,
    tokensRemaining: Object.fromEntries(GOODS.map((good) => [good, game.tokens[good].length])),
    tokenTops: Object.fromEntries(GOODS.map((good) => [good, game.tokens[good].slice(-5).reverse()])),
    turn: game.turn,
    roundNumber: game.roundNumber,
    roundOver: game.roundOver,
    roundResult: game.roundResult,
    matchWinner: game.players.findIndex((player) => player.seals >= 2),
    ready: [...game.ready],
    log: game.log.slice(0, 6),
    ownHandSize: own.hand.length,
  };
}
