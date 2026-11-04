import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { applyAction, continueRound, createRound, publicState } from "./src/game.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const rooms = new Map();
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_request, response) => response.json({ status: "ok" }));

function createRoomCode() {
  let code;
  do {
    code = Array.from({ length: 5 }, () => roomAlphabet[crypto.randomInt(roomAlphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function playerFor(room, key) {
  return room.players.findIndex((player) => player.key === key);
}

function emitState(room) {
  room.players.forEach((player, seat) => {
    if (!player.socketId) return;
    const state = room.game
      ? { ...publicState(room.game, seat), roomCode: room.code, connected: room.players.map((entry) => Boolean(entry.socketId)) }
      : {
          roomCode: room.code,
          seat,
          players: room.players.map((entry) => ({ name: entry.name, seals: entry.seals, handSize: 0, camels: 0, coins: {} })),
          started: false,
          connected: room.players.map((entry) => Boolean(entry.socketId)),
        };
    io.to(player.socketId).emit("gameState", state);
  });
}

function attachPlayer(socket, room, seat) {
  const player = room.players[seat];
  player.socketId = socket.id;
  socket.data.roomCode = room.code;
  socket.data.playerKey = player.key;
  emitState(room);
}

function startRound(room) {
  room.players.forEach((player) => { player.seals = room.game?.players[room.players.indexOf(player)]?.seals ?? player.seals ?? 0; });
  room.game = createRound(room.players.map(({ name, key, seals }) => ({ name, key, seals })));
  emitState(room);
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name } = {}, acknowledge = () => {}) => {
    const cleanName = typeof name === "string" ? name.trim().slice(0, 18) : "";
    if (!cleanName) return acknowledge({ error: "Enter a name to create a room." });
    const room = {
      code: createRoomCode(),
      players: [{ name: cleanName, key: crypto.randomUUID(), socketId: null, seals: 0 }],
      game: null,
    };
    rooms.set(room.code, room);
    attachPlayer(socket, room, 0);
    acknowledge({ roomCode: room.code, playerKey: room.players[0].key, seat: 0 });
  });

  socket.on("joinRoom", ({ name, roomCode } = {}, acknowledge = () => {}) => {
    const cleanName = typeof name === "string" ? name.trim().slice(0, 18) : "";
    const code = typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
    const room = rooms.get(code);
    if (!cleanName) return acknowledge({ error: "Enter a name to join a room." });
    if (!room) return acknowledge({ error: "Room not found. Check the code and try again." });
    if (room.players.length >= 2 || room.game) return acknowledge({ error: "That room is already full." });
    room.players.push({ name: cleanName, key: crypto.randomUUID(), socketId: null, seals: 0 });
    attachPlayer(socket, room, 1);
    acknowledge({ roomCode: room.code, playerKey: room.players[1].key, seat: 1 });
    startRound(room);
  });

  socket.on("resumeGame", ({ roomCode, playerKey } = {}, acknowledge = () => {}) => {
    const code = typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
    const room = rooms.get(code);
    const seat = room ? playerFor(room, playerKey) : -1;
    if (!room || seat < 0) return acknowledge({ error: "That game could not be restored. Create or join a room." });
    attachPlayer(socket, room, seat);
    acknowledge({ roomCode: room.code, playerKey, seat });
  });

  socket.on("gameAction", ({ roomCode, playerKey, action } = {}, acknowledge = () => {}) => {
    const room = rooms.get(roomCode);
    const seat = room ? playerFor(room, playerKey) : -1;
    if (!room || !room.game || seat < 0) return acknowledge({ error: "You are not part of that game." });
    if (seat !== room.game.turn) return acknowledge({ error: "Wait for your turn." });
    try {
      applyAction(room.game, action);
      emitState(room);
      acknowledge({ ok: true });
    } catch (error) {
      acknowledge({ error: error.message });
    }
  });

  socket.on("readyNextRound", ({ roomCode, playerKey } = {}, acknowledge = () => {}) => {
    const room = rooms.get(roomCode);
    const seat = room ? playerFor(room, playerKey) : -1;
    if (!room || !room.game || seat < 0) return acknowledge({ error: "You are not part of that game." });
    if (!room.game.roundOver || room.game.players.some((player) => player.seals >= 2)) {
      return acknowledge({ error: "There is no next round to start." });
    }
    room.game.ready[seat] = true;
    if (room.game.ready.every(Boolean)) {
      room.game = continueRound(room.game, room.players);
    }
    emitState(room);
    acknowledge({ ok: true });
  });

  socket.on("disconnect", () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const seat = playerFor(room, socket.data.playerKey);
    if (seat >= 0 && room.players[seat].socketId === socket.id) {
      room.players[seat].socketId = null;
      emitState(room);
    }
  });
});

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Jaipur is ready at http://localhost:${port}`);
});
