import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, continueRound, createRound, publicState } from "../src/game.js";

function round() {
  return createRound([{ name: "A", key: "a" }, { name: "B", key: "b" }], () => 0.5);
}

test("sets up a two-player round with five cards each and a five-card market", () => {
  const game = round();
  assert.equal(game.players.length, 2);
  assert.deepEqual(game.players.map((player) => player.hand.length), [5, 5]);
  assert.ok(game.players.every((player) => !player.hand.includes("camel")));
  assert.equal(game.market.length, 5);
  assert.ok(game.market.filter((card) => card === "camel").length >= 3);
  assert.equal(game.deck.length + game.players.reduce((sum, player) => sum + player.camels, 0), 40);
});

test("takes a market good, refills the market, and changes turn", () => {
  const game = round();
  const marketIndex = game.market.findIndex((card) => card !== "camel");
  const oldCardCount = game.players[0].hand.length;
  applyAction(game, { type: "takeOne", marketIndex });
  assert.equal(game.players[0].hand.length, oldCardCount + 1);
  assert.equal(game.market.length, 5);
  assert.equal(game.turn, 1);
});

test("collects all market camels into the herd without adding hand cards", () => {
  const game = round();
  const startingHerd = game.players[0].camels;
  const camelCount = game.market.filter((card) => card === "camel").length;
  applyAction(game, { type: "takeCamels" });
  assert.equal(game.players[0].camels, startingHerd + camelCount);
  assert.equal(game.players[0].hand.length, 5);
  assert.equal(game.market.length, 5);
});

test("rejects an illegal exchange without changing state", () => {
  const game = round();
  const before = structuredClone(game);
  assert.throws(() => applyAction(game, { type: "exchange", handIndices: [0], marketIndices: [0] }), /at least two/);
  assert.deepEqual(game, before);
});

test("rejects taking a camel as a single good without changing state", () => {
  const game = round();
  const before = structuredClone(game);
  const camelIndex = game.market.findIndex((card) => card === "camel");
  assert.throws(() => applyAction(game, { type: "takeOne", marketIndex: camelIndex }), /herd/);
  assert.deepEqual(game, before);
});

test("an exchange that returns a camel adds it to the herd and keeps the market at five", () => {
  const game = round();
  game.players[0].hand = ["camel", "cloth"];
  game.market = ["camel", "camel", "cloth", "spice", "gold"];
  const marketIndices = game.market.map((card, index) => card === "camel" ? -1 : index).filter((index) => index >= 0).slice(0, 2);
  const startingHerd = game.players[0].camels;
  applyAction(game, { type: "exchange", handIndices: [0, 1], marketIndices });
  assert.equal(game.players[0].camels, startingHerd + 1);
  assert.equal(game.market.length, 5);
});

test("sells a valid group for tokens and a bundle bonus", () => {
  const game = round();
  game.players[0].hand = ["leather", "leather", "leather", "gold", "cloth"];
  const before = game.tokens.leather.reduce((sum, token) => sum + token, 0);
  applyAction(game, { type: "sell", indices: [0, 1, 2] });
  assert.equal(game.players[0].coins.leather.length, 4);
  assert.equal(game.tokens.leather.reduce((sum, token) => sum + token, 0), before - game.players[0].coins.leather.slice(0, 3).reduce((sum, token) => sum + token, 0));
  assert.equal(game.players[0].hand.length, 2);
});

test("requires jewel sales in pairs and awards the highest remaining token values first", () => {
  const game = round();
  game.players[0].hand = ["diamond", "diamond", "cloth"];
  assert.throws(() => applyAction(game, { type: "sell", indices: [0] }), /groups of at least two/);
  applyAction(game, { type: "sell", indices: [0, 1] });
  assert.deepEqual(game.players[0].coins.diamond, [9, 7]);
});

test("hides the opponent hand from a player's public state", () => {
  const game = round();
  const state = publicState(game, 0);
  assert.ok(Array.isArray(state.players[0].hand));
  assert.equal(state.players[1].hand, null);
  assert.equal(state.tokenTops.diamond[0], 9);
});

test("enforces the seven-card hand limit before accepting a move", () => {
  const game = round();
  game.players[0].hand = Array(7).fill("cloth");
  const marketIndex = game.market.findIndex((card) => card !== "camel");
  assert.throws(() => applyAction(game, { type: "takeOne", marketIndex }), /more than seven/);
  assert.equal(game.players[0].hand.length, 7);
});

test("ends a round when the third goods pile empties and awards the winner a seal", () => {
  const game = round();
  game.turn = 0;
  game.players[0].hand = ["leather"];
  game.tokens.diamond = [];
  game.tokens.gold = [];
  game.tokens.leather = [1];
  applyAction(game, { type: "sell", indices: [0] });
  assert.equal(game.roundOver, true);
  assert.equal(game.roundResult.winner, 0);
  assert.equal(game.players[0].seals, 1);
});

test("includes the five-point camel bonus when awarding the round seal", () => {
  const game = round();
  game.turn = 0;
  game.players[0].hand = ["leather"];
  game.players[0].camels = 5;
  game.players[1].coins.gold = [5];
  game.tokens.diamond = [];
  game.tokens.gold = [];
  game.tokens.leather = [1];
  applyAction(game, { type: "sell", indices: [0] });
  assert.deepEqual(game.roundResult.scores, [6, 5]);
  assert.equal(game.roundResult.winner, 0);
});

test("continues the match with seals preserved and the previous winner starting", () => {
  const game = round();
  game.roundOver = true;
  game.roundResult = { winner: 1, scores: [10, 12], reason: "Three goods piles are empty" };
  game.players[1].seals = 1;
  const next = continueRound(game, game.players);
  assert.equal(next.players[1].seals, 1);
  assert.equal(next.roundNumber, game.roundNumber + 1);
  assert.equal(next.turn, 1);
});
