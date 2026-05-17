const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const rooms = {};

function createInitialState() {
    let board = new Array(16).fill(0);
    for (let i = 0; i < 7; i++) { 
        board[i] = 7;      
        board[i + 8] = 7;  
    }
    return { board, currentPlayer: 1, gameOver: false, winner: null };
}

function checkGameOver(board) {
    let p1Empty = true;
    let p2Empty = true;
    for (let i = 0; i < 7; i++) { if (board[i] > 0) p1Empty = false; }
    for (let i = 8; i < 15; i++) { if (board[i] > 0) p2Empty = false; }
    return p1Empty || p2Empty;
}

function raupSisaBiji(board) {
    for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; }
    for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; }
}

io.on('connection', (socket) => {
    console.log(`User tersambung: ${socket.id}`);
    socket.on('joinRoom', (room) => {
        if (!rooms[room]) {
            rooms[room] = { state: createInitialState(), p1: socket.id, p2: null };
            socket.join(room);
            socket.emit('initRole', 1);
            socket.emit('updateGame', rooms[room].state);
        } else if (!rooms[room].p2) {
            rooms[room].p2 = socket.id;
            socket.join(room);
            socket.emit('initRole', 2);
            io.to(room).emit('updateGame', rooms[room].state);
        } else {
            socket.emit('roomFull');
        }
    });
    socket.on('makeMove', ({ room, holeIndex }) => {
        const game = rooms[room];
        if (!game || game.state.gameOver) return;
        let state = game.state;
        let board = state.board;
        let p = state.currentPlayer;
        if (p === 1 && socket.id !== game.p1) return;
        if (p === 2 && socket.id !== game.p2) return;
        let seeds = board[holeIndex];
        if (seeds === 0) return;
        board[holeIndex] = 0;
        let currentIndex = holeIndex;
        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            if (p === 1 && currentIndex === 15) continue;
            if (p === 2 && currentIndex === 7) continue;
            board[currentIndex]++;
            seeds--;
        }
        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) {
            if (checkGameOver(board)) {
                raupSisaBiji(board);
                state.gameOver = true;
                state.winner = board[7] > board[15] ? 1 : (board[15] > board[7] ? 2 : "SERI");
            }
            io.to(room).emit('updateGame', state);
            return;
        }
        if (board[currentIndex] === 1) {
            const isP1Zone = currentIndex >= 0 && currentIndex <= 6;
            const isP2Zone = currentIndex >= 8 && currentIndex <= 14;
            if ((p === 1 && isP1Zone) || (p === 2 && isP2Zone)) {
                const oppositeIndex = 14 - currentIndex;
                if (board[oppositeIndex] > 0) {
                    let RumahKita = (p === 1) ? 7 : 15;
                    board[RumahKita] += board[oppositeIndex] + 1;
                    board[oppositeIndex] = 0;
                    board[currentIndex] = 0;
                }
            }
        }
        if (checkGameOver(board)) {
            raupSisaBiji(board);
            state.gameOver = true;
            state.winner = board[7] > board[15] ? 1 : (board[15] > board[7] ? 2 : "SERI");
        } else {
            state.currentPlayer = p === 1 ? 2 : 1;
        }
        io.to(room).emit('updateGame', state);
    });
    socket.on('disconnect', () => { console.log(`User terputus: ${socket.id}`); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server jalan di port ${PORT}`));
