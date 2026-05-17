const SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myRoom = "";
let myName = ""; 
let myRole = null;
let myChannel = null;
let isAnimating = false;
let pregameCountdownInterval = null;
window.gameStarted = false; // Flag untuk transisi dari suit ke permainan
window.suitResultTimer = null;

let myClientId = sessionStorage.getItem('congklak_client_id') || (() => {
    let id = Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('congklak_client_id', id);
    return id;
})();

let gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null, p1_name: "", p2_name: "" };

window.onload = () => {
    document.getElementById('room-input').value = Math.random().toString(36).substring(2, 6).toUpperCase();
};

async function joinRoom() {
    const roomInput = document.getElementById('room-input').value.trim().toUpperCase();
    const nameInput = document.getElementById('name-input').value.trim();
    if (!roomInput) return alert("Silakan masukkan kode ruangan.");
    if (!nameInput) return alert("Silakan masukkan nama Anda.");
    
    document.querySelector("#lobby button").innerText = "Memuat...";
    myRoom = roomInput;
    myName = nameInput; 

    let { data: room, error: fetchError } = await db.from('rooms').select('*').eq('id', myRoom).single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        alert("Error Database: " + fetchError.message);
        document.querySelector("#lobby button").innerText = "Masuk Ruangan";
        return;
    }

    const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

    if (!room) {
        myRole = 1;
        await db.from('rooms').insert([{ id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId, p1_name: myName, p2_id: null, p2_name: "" }]);
    } else {
        if (room.p1_id === myClientId) {
            myRole = 1;
            if (room.p1_name !== myName) await db.from('rooms').update({p1_name: myName}).eq('id', myRoom);
        } else if (room.p2_id === myClientId) {
            myRole = 2;
            if (room.p2_name !== myName) await db.from('rooms').update({p2_name: myName}).eq('id', myRoom);
        } else if (!room.p2_id) {
            myRole = 2;
            await db.from('rooms').update({ p2_id: myClientId, p2_name: myName, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom);
        } else {
            document.querySelector("#lobby button").innerText = "Masuk Ruangan";
            return alert("Maaf, ruangan ini sudah penuh.");
        }
    }

    document.getElementById('chat-room-id').innerText = `KODE: ${myRoom}`;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-area').classList.remove('hidden');

    let { data: currentRoom } = await db.from('rooms').select('*').eq('id', myRoom).single();
    if (currentRoom) { 
        gameState = currentRoom; 
        if (gameState.suit_winner && gameState.suit_winner !== 'SERI') window.gameStarted = true;
        renderBoard(); 
    }

    if (myChannel) db.removeChannel(myChannel);
    myChannel = db.channel('room_' + myRoom);
    
    myChannel
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (payload) => {
        if (!isAnimating) {
            gameState = payload.new;
            if (gameState.p1_ready && gameState.p2_ready && !gameState.p1_suit && !gameState.p2_suit && !pregameCountdownInterval && !gameState.suit_winner) {
                 startPregameCountdown();
            }
            if (gameState.p1_suit && gameState.p2_suit && !gameState.suit_winner && myRole === 1) {
                 calculateSuitWinner();
            }
            renderBoard();
        }
    })
    .on('broadcast', { event: 'chat' }, (payload) => {
        appendChatMessage(payload.payload.senderName || `Lawan`, payload.payload.text, false);
    })
    .subscribe();
}

function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    appendChatMessage("Anda", text, true);
    myChannel.send({ type: 'broadcast', event: 'chat', payload: { senderName: myName, text: text } });
    input.value = '';
}

function appendChatMessage(displayName, text, isMe) {
    const container = document.getElementById('chat-messages');
    const msgDiv = document.createElement('div');
    const alignClass = isMe ? 'self-end bg-amber-500 text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl' : 'self-start bg-white border border-amber-200 text-amber-900 rounded-tl-xl rounded-tr-xl rounded-br-xl shadow-sm';
    const nameColor = isMe ? 'text-amber-100' : 'text-amber-500';

    msgDiv.className = `max-w-[80%] px-4 py-2 text-sm ${alignClass}`;
    msgDiv.innerHTML = `<div class="text-[10px] font-bold ${nameColor} mb-0.5 uppercase tracking-wide">${displayName}</div><div>${text}</div>`;
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

async function clickReady() {
    document.getElementById('pregame-ready-btn').classList.add('hidden');
    let RumahKita = `p${myRole}_ready`;
    await db.from('rooms').update({ [RumahKita]: true }).eq('id', myRoom);
}

function startPregameCountdown() {
    isAnimating = true;
    document.getElementById('pregame-ready-section').classList.add('hidden');
    document.getElementById('pregame-suit-result').classList.add('hidden');
    const countdownDiv = document.getElementById('pregame-suit-countdown');
    countdownDiv.classList.remove('hidden');
    countdownDiv.innerHTML = `
        <div class="text-xs uppercase font-bold text-amber-600 tracking-wider">Bersiap Memilih Dalam...</div>
        <div id="pregame-suit-seconds" class="text-7xl font-black">5</div>
    `;
    
    let secondsLeft = 5;
    pregameCountdownInterval = setInterval(() => {
        secondsLeft--;
        const counterDisplay = document.getElementById('pregame-suit-seconds');
        if (counterDisplay) counterDisplay.innerText = secondsLeft;
        if (secondsLeft <= 0) {
            clearInterval(pregameCountdownInterval);
            pregameCountdownInterval = null;
            showSuitChoices();
        }
    }, 1000);
}

function showSuitChoices() {
    document.getElementById('pregame-suit-countdown').classList.add('hidden');
    document.getElementById('pregame-suit-choices').classList.remove('hidden');
    isAnimating = false; 
}

async function clickSuit(choice) {
    document.getElementById('pregame-suit-choices').classList.add('hidden');
    const countdownDiv = document.getElementById('pregame-suit-countdown');
    countdownDiv.classList.remove('hidden');
    countdownDiv.innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan Memilih...</div>`;
    
    let RumahKita = `p${myRole}_suit`;
    await db.from('rooms').update({ [RumahKita]: choice }).eq('id', myRoom);
}

async function calculateSuitWinner() {
    if (myRole !== 1) return; // Mencegah update ganda, P1 yang jadi wasit
    const p1 = gameState.p1_suit;
    const p2 = gameState.p2_suit;
    let winnerId = "SERI";

    if ((p1 === 'batu' && p2 === 'gunting') || (p1 === 'gunting' && p2 === 'kertas') || (p1 === 'kertas' && p2 === 'batu')) winnerId = "1"; 
    else if (p1 !== p2) winnerId = "2"; 
    
    const updateData = { suit_winner: winnerId };
    if (winnerId !== "SERI") updateData.current_player = parseInt(winnerId);
    await db.from('rooms').update(updateData).eq('id', myRoom);
}

function renderBoard() {
    const pregamePanel = document.getElementById('pregame-panel');
    const mainBoardContainer = document.getElementById('main-board-container');
    const statusText = document.getElementById('status-panel');

    // 1. Tampilkan Hasil Suit jika keduanya sudah memilih
    if (gameState.p1_suit && gameState.p2_suit && !window.gameStarted) {
        document.getElementById('pregame-suit-countdown').classList.add('hidden');
        document.getElementById('pregame-suit-choices').classList.add('hidden');
        document.getElementById('pregame-ready-section').classList.add('hidden');
        
        const resultDiv = document.getElementById('pregame-suit-result');
        resultDiv.classList.remove('hidden');

        const icons = { batu: '✊', kertas: '✋', gunting: '✌️' };
        let winText = "Menghitung hasil...";
        let textStyle = "text-amber-600";
        
        if (gameState.suit_winner) {
            if (gameState.suit_winner === 'SERI') { winText = "HASIL SERI! Mengulang suit..."; textStyle = "text-blue-600"; }
            else if (gameState.suit_winner === myRole.toString()) { winText = "ANDA MENANG! Jalan pertama."; textStyle = "text-emerald-600"; }
            else { winText = "LAWAN MENANG. Harap tunggu."; textStyle = "text-rose-600"; }
        }

        resultDiv.innerHTML = `
            <div class="text-sm font-bold text-amber-600 mb-2 uppercase tracking-widest">Hasil Pilihan</div>
            <div class="flex justify-center gap-8 items-center mb-4 text-4xl">
                <div class="text-center"><div class="text-xs text-amber-800 mb-2">${gameState.p1_name || 'Player 1'}</div>${icons[gameState.p1_suit]}</div>
                <div class="text-2xl font-black text-amber-400">VS</div>
                <div class="text-center"><div class="text-xs text-amber-800 mb-2">${gameState.p2_name || 'Player 2'}</div>${icons[gameState.p2_suit]}</div>
            </div>
            <div class="text-xl font-black ${textStyle}">${winText}</div>
        `;

        if (gameState.suit_winner && !window.suitResultTimer) {
            window.suitResultTimer = setTimeout(async () => {
                window.suitResultTimer = null;
                resultDiv.classList.add('hidden'); 
                if (gameState.suit_winner === 'SERI') {
                    if (myRole === 1) await db.from('rooms').update({ p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom);
                } else {
                    window.gameStarted = true;
                    renderBoard();
                }
            }, 3500);
        }
        
        statusText.innerText = "Fase Penentuan";
        statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
        return; 
    }

    // 2. Fase Permainan
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && window.gameStarted) {
        pregamePanel.classList.add('hidden');
        mainBoardContainer.classList.remove('hidden');
        renderGameHoles();

        if (gameState.game_over) {
            if (gameState.winner === "SERI") statusText.innerText = "PERMAINAN SELESAI: HASIL SERI!";
            else if (parseInt(gameState.winner) === myRole) statusText.innerText = "ANDA MENANG! 🎉";
            else {
                 const winnerName = (gameState.winner === "1") ? gameState.p1_name : gameState.p2_name;
                 statusText.innerText = `${winnerName} Memenangkan Permainan.`;
            }
            statusText.className = "text-xl font-bold text-rose-900 bg-rose-100 px-6 py-2 rounded-full shadow-sm";
        } else if (isAnimating) {
            statusText.innerText = "Sedang membagikan biji...";
            statusText.className = "text-xl font-bold text-blue-900 bg-blue-100 px-6 py-2 rounded-full shadow-sm animate-pulse";
        } else if (gameState.current_player === myRole) {
            statusText.innerText = "Giliran Anda.";
            statusText.className = "text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-2 rounded-full shadow-sm";
        } else {
            const currentPlayerName = (gameState.current_player === 1) ? gameState.p1_name : gameState.p2_name;
            statusText.innerText = `Menunggu ${currentPlayerName}...`;
            statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
        }
    } 
    // 3. Fase Menunggu (Ready)
    else {
        mainBoardContainer.classList.add('hidden');
        pregamePanel.classList.remove('hidden'); 
        
        if (!gameState.p1_ready || !gameState.p2_ready) {
             document.getElementById('pregame-suit-countdown').classList.add('hidden');
             document.getElementById('pregame-suit-choices').classList.add('hidden');
             document.getElementById('pregame-suit-result').classList.add('hidden');
             document.getElementById('pregame-ready-section').classList.remove('hidden');
             
             const RumahKita = `p${myRole}_ready`;
             if (gameState[RumahKita]) {
                 document.getElementById('pregame-ready-btn').innerText = "Menunggu Lawan Siap...";
                 document.getElementById('pregame-ready-btn').disabled = true;
             } else {
                 document.getElementById('pregame-ready-btn').innerText = "Siap Bermain";
                 document.getElementById('pregame-ready-btn').disabled = false;
             }
        }
        statusText.innerText = "Persiapan Permainan";
        statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
    }
}

function renderGameHoles() {
    const topContainer = document.getElementById('holes-top');
    const bottomContainer = document.getElementById('holes-bottom');
    topContainer.innerHTML = '';
    bottomContainer.innerHTML = '';

    let bottomIndices, topIndices, leftStoreIndex, rightStoreIndex;
    let leftName, rightName;

    // Logika Perspektif: Rumah sendiri SELALU di kiri, baris sendiri SELALU di bawah.
    if (myRole === 1 || myRole === null) {
        bottomIndices = [6, 5, 4, 3, 2, 1, 0]; // 0 paling kanan, bergerak ke kiri
        topIndices    = [8, 9, 10, 11, 12, 13, 14]; // 8 paling kiri, bergerak ke kanan
        leftStoreIndex = 7;
        rightStoreIndex = 15;
        leftName = gameState.p1_name || "Player 1";
        rightName = gameState.p2_name || "Player 2";
    } else {
        bottomIndices = [14, 13, 12, 11, 10, 9, 8]; 
        topIndices    = [0, 1, 2, 3, 4, 5, 6]; 
        leftStoreIndex = 15;
        rightStoreIndex = 7;
        leftName = gameState.p2_name || "Player 2";
        rightName = gameState.p1_name || "Player 1";
    }

    document.getElementById('store-left-name').innerText = `RUMAH: ${leftName}`;
    document.getElementById('store-right-name').innerText = `RUMAH: ${rightName}`;
    document.getElementById('store-left').innerText = gameState.board[leftStoreIndex];
    document.getElementById('store-right').innerText = gameState.board[rightStoreIndex];

    bottomIndices.forEach(idx => { bottomContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); });
    topIndices.forEach(idx => { topContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); });
}

function createHoleHTML(index, count) {
    const isMyTurn = gameState.current_player === myRole;
    const isMyZone = (myRole === 1 && index >= 0 && index <= 6) || (myRole === 2 && index >= 8 && index <= 14);
    const canClick = isMyTurn && isMyZone && count > 0 && !gameState.game_over && !isAnimating && window.gameStarted;
    
    return `
        <button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="w-12 h-12 md:w-16 md:h-16 bg-amber-100 disabled:opacity-90 disabled:cursor-not-allowed rounded-full flex items-center justify-center font-black text-amber-950 shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)] hover:bg-amber-200 active:scale-90 transition-all text-lg md:text-2xl border-[3px] border-amber-900/10 shrink-0">
            ${count}
        </button>
    `;
}

function checkGameOver(board) {
    let p1Empty = true, p2Empty = true;
    for (let i = 0; i < 7; i++) { if (board[i] > 0) p1Empty = false; }
    for (let i = 8; i < 15; i++) { if (board[i] > 0) p2Empty = false; }
    return p1Empty || p2Empty;
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function clickHole(holeIndex) {
    if (!window.gameStarted) return; 
    isAnimating = true; 
    renderBoard();

    let board = [...gameState.board];
    let p = gameState.current_player;
    let seeds = board[holeIndex];
    board[holeIndex] = 0; 
    let currentIndex = holeIndex;
    let isSowing = true;
    let nextPlayer = p;

    while (isSowing) {
        gameState.board = [...board];
        renderBoard();
        await delay(300); 

        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            if (p === 1 && currentIndex === 15) continue;
            if (p === 2 && currentIndex === 7) continue;

            board[currentIndex]++;
            seeds--;

            gameState.board = [...board];
            renderBoard();
            await delay(400); 
        }

        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) {
            isSowing = false;
            nextPlayer = p;
        } else if (board[currentIndex] === 1) {
            isSowing = false;
            nextPlayer = p === 1 ? 2 : 1; 

            const isP1Zone = currentIndex >= 0 && currentIndex <= 6;
            const isP2Zone = currentIndex >= 8 && currentIndex <= 14;
            
            if ((p === 1 && isP1Zone) || (p === 2 && isP2Zone)) {
                const oppositeIndex = 14 - currentIndex;
                if (board[oppositeIndex] > 0) {
                    await delay(600); 
                    let RumahKita = (p === 1) ? 7 : 15;
                    board[RumahKita] += board[oppositeIndex] + 1; 
                    board[oppositeIndex] = 0;
                    board[currentIndex] = 0;
                    
                    gameState.board = [...board];
                    renderBoard();
                    await delay(500); 
                }
            }
        } else {
            await delay(500); 
            seeds = board[currentIndex];
            board[currentIndex] = 0; 
        }
    }

    let isGameOver = false;
    let winner = null;

    if (checkGameOver(board)) {
        for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; }
        for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; }
        isGameOver = true;
        winner = board[7] > board[15] ? "1" : (board[15] > board[7] ? "2" : "SERI");
    }

    isAnimating = false; 

    await db.from('rooms').update({
        board: board,
        current_player: nextPlayer,
        game_over: isGameOver,
        winner: winner
    }).eq('id', myRoom);
}
