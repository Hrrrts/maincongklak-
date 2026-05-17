const SERVER_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'GANTI_DENGAN_URL_BACKEND_MU_NANTI';
let socket;
let myRoom = "";
let myRole = null;
let gameState = { board: new Array(16).fill(0), currentPlayer: 1, gameOver: false, winner: null };

function joinRoom() {
    const roomInput = document.getElementById('room-input').value.trim().toUpperCase();
    if (!roomInput) return alert("Isi kode room dulu bor!");
    myRoom = roomInput;
    socket = io(SERVER_URL);
    socket.on('connect', () => { socket.emit('joinRoom', myRoom); });
    socket.on('initRole', (role) => {
        myRole = role;
        document.getElementById('role-indicator').innerText = `Kamu adalah: Player ${myRole}`;
        document.getElementById('lobby').classList.add('hidden');
        document.getElementById('game-info').classList.remove('hidden');
        document.getElementById('game-board').classList.remove('hidden');
    });
    socket.on('updateGame', (state) => { gameState = state; renderBoard(); });
    socket.on('roomFull', () => { alert("Waduh, room ini udah penuh!"); socket.disconnect(); });
}

function renderBoard() {
    const p1Container = document.getElementById('p1-holes');
    const p2Container = document.getElementById('p2-holes');
    p1Container.innerHTML = '';
    p2Container.innerHTML = '';
    for (let i = 0; i < 7; i++) { p1Container.innerHTML += createHoleHTML(i, gameState.board[i]); }
    for (let i = 14; i >= 8; i--) { p2Container.innerHTML += createHoleHTML(i, gameState.board[i]); }
    document.getElementById('hole-7').innerText = gameState.board[7];
    document.getElementById('hole-15').innerText = gameState.board[15];
    const statusText = document.getElementById('status-panel');
    
    if (gameState.gameOver) {
        if (gameState.winner === "SERI") {
            statusText.innerText = "GAME OVER: Hasil SERI!";
            statusText.className = "text-xl font-bold text-blue-900 bg-blue-100 px-6 py-1.5 rounded-full shadow-sm";
        } else if (gameState.winner === myRole) {
            statusText.innerText = "GAME OVER: KAMU MENANG! 🏆";
            statusText.className = "text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-1.5 rounded-full shadow-sm";
        } else {
            statusText.innerText = `GAME OVER: Player ${gameState.winner} Menang!`;
            statusText.className = "text-xl font-bold text-rose-900 bg-rose-100 px-6 py-1.5 rounded-full shadow-sm";
        }
        return;
    }

    if (gameState.currentPlayer === myRole) {
        statusText.innerText = "Giliran KAMU! Gilas!";
        statusText.className = "text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-1.5 rounded-full shadow-sm";
    } else {
        statusText.innerText = `Giliran Player ${gameState.currentPlayer}...`;
        statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-1.5 rounded-full shadow-sm";
    }
}

function createHoleHTML(index, count) {
    const isMyTurn = gameState.currentPlayer === myRole;
    const isMyZone = (myRole === 1 && index >= 0 && index <= 6) || (myRole === 2 && index >= 8 && index <= 14);
    const canClick = isMyTurn && isMyZone && count > 0 && !gameState.gameOver;
    return `
        <button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="w-full aspect-square bg-amber-100 disabled:opacity-80 disabled:cursor-not-allowed rounded-full flex items-center justify-center font-black text-amber-950 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] hover:bg-amber-200 active:scale-95 transition-all text-base md:text-xl border-2 border-amber-900/20">
            ${count}
        </button>
    `;
}

function clickHole(index) { socket.emit('makeMove', { room: myRoom, holeIndex: index }); }
