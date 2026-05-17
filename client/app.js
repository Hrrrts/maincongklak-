const SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myRoom = "";
let myName = ""; // Untuk menampung nama player
let myRole = null;
let myChannel = null;
let isAnimating = false;
let pregameCountdownInterval = null;

// FIX: Ganti localStorage jadi sessionStorage biar bisa ngetes di banyak tab browser yang sama
let myClientId = sessionStorage.getItem('congklak_client_id') || (() => {
    let id = Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('congklak_client_id', id);
    return id;
})();

let gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null, p1_name: "", p2_name: "" };

window.onload = () => {
    // Generate kode room acak
    document.getElementById('room-input').value = Math.random().toString(36).substring(2, 6).toUpperCase();
};

async function joinRoom() {
    const roomInput = document.getElementById('room-input').value.trim().toUpperCase();
    const nameInput = document.getElementById('name-input').value.trim();
    if (!roomInput) return alert("Isi kode room dulu bor!");
    if (!nameInput) return alert("Isi nama kamu dulu bor!");
    
    document.querySelector("#lobby button").innerText = "Loading...";
    myRoom = roomInput;
    myName = nameInput; // Simpan nama secara lokal

    let { data: room, error: fetchError } = await db.from('rooms').select('*').eq('id', myRoom).single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        alert("Error Database: " + fetchError.message);
        document.querySelector("#lobby button").innerText = "Gabung Game";
        return;
    }

    const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

    if (!room) {
        // Room baru, user jadi Player 1
        myRole = 1;
        await db.from('rooms').insert([{
            id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId, p1_name: myName, p2_id: null, p2_name: ""
        }]);
    } else {
        // Room ada, user login kembali atau jadi Player 2
        if (room.p1_id === myClientId) {
            myRole = 1;
            // Update nama kalau berubah
            if (room.p1_name !== myName) await db.from('rooms').update({p1_name: myName}).eq('id', myRoom);
        } else if (room.p2_id === myClientId) {
            myRole = 2;
            // Update nama kalau berubah
            if (room.p2_name !== myName) await db.from('rooms').update({p2_name: myName}).eq('id', myRoom);
        } else if (!room.p2_id) {
            // User jadi Player 2
            myRole = 2;
            // Update db dngan ID dan nama P2, sekalian reset data pregame biar fresh
            await db.from('rooms').update({ p2_id: myClientId, p2_name: myName, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom);
        } else {
            document.querySelector("#lobby button").innerText = "Gabung Game";
            return alert("Waduh, room ini sudah penuh bor!");
        }
    }

    // Tampilkan Area Game & Chat, Sembunyikan Lobby
    document.getElementById('chat-room-id').innerText = `ROOM: ${myRoom}`;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-area').classList.remove('hidden');

    // Ambil state terbaru setelah join
    let { data: currentRoom } = await db.from('rooms').select('*').eq('id', myRoom).single();
    if (currentRoom) { gameState = currentRoom; renderBoard(); }

    // Inisialisasi Koneksi Realtime (Gerakan DB + Chat Broadcast)
    if (myChannel) db.removeChannel(myChannel);
    myChannel = db.channel('room_' + myRoom);
    
    myChannel
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (payload) => {
        if (!isAnimating) {
            gameState = payload.new;
            // Tangani pregame countdown secara realtime
            if (gameState.p1_ready && gameState.p2_ready && gameState.p1_suit === null && gameState.p2_suit === null && pregameCountdownInterval === null) {
                 startPregameCountdown();
            } else if (gameState.p1_suit && gameState.p2_suit && !gameState.suit_winner && pregameCountdownInterval === null) {
                 calculateSuitWinner();
            } else {
                 renderBoard();
            }
        }
    })
    .on('broadcast', { event: 'chat' }, (payload) => {
        // Nerima chat dari musuh dngan nama pengirim asli
        appendChatMessage(payload.payload.senderName, payload.payload.text, false);
    })
    .subscribe();
}

// === SISTEM LIVE CHAT (Menggunakan Nama) ===
function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // Munculin di layar sendiri pake "Kamu"
    appendChatMessage("Kamu", text, true);
    
    // Siarkan ke musuh via Supabase Broadcast dngan nama asli kita
    myChannel.send({
        type: 'broadcast',
        event: 'chat',
        payload: { senderName: myName, text: text }
    });
    
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

// === LOGIKA PRE-GAME (READY & SUIT) ===
async function clickReady() {
    // Sembunyikan tombol ready setelah diklik
    document.getElementById('pregame-ready-btn').classList.add('hidden');
    let RumahKita = `p${myRole}_ready`;
    await db.from('rooms').update({ [RumahKita]: true }).eq('id', myRoom);
}

function startPregameCountdown() {
    isAnimating = true;
    document.getElementById('pregame-panel').classList.add('hidden');
    document.getElementById('pregame-suit-countdown').classList.remove('hidden');
    let secondsLeft = 5;
    const counterDisplay = document.getElementById('pregame-suit-seconds');
    counterDisplay.innerText = secondsLeft;

    pregameCountdownInterval = setInterval(() => {
        secondsLeft--;
        counterDisplay.innerText = secondsLeft;
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
    isAnimating = false; // Player harus bisa milih suit
}

async function clickSuit(choice) {
    // Sembunyikan pilihan setelah milih
    document.getElementById('pregame-suit-choices').classList.add('hidden');
    let RumahKita = `p${myRole}_suit`;
    await db.from('rooms').update({ [RumahKita]: choice }).eq('id', myRoom);
}

function calculateSuitWinner() {
    const p1 = gameState.p1_suit;
    const p2 = gameState.p2_suit;
    let winnerId = null;

    if (p1 === p2) {
        winnerId = "SERI";
    } else if (
        (p1 === 'batu' && p2 === 'gunting') ||
        (p1 === 'gunting' && p2 === 'kertas') ||
        (p1 === 'kertas' && p2 === 'batu')
    ) {
        winnerId = "1"; // Player 1 menang suit
    } else {
        winnerId = "2"; // Player 2 menang suit
    }
    
    // Kirim hasil pemenang suit ke DB dan set current_player pertama kali
    updateSuitWinnerOnDB(winnerId);
}

async function updateSuitWinnerOnDB(winnerId) {
    isAnimating = true; // Kunci biar gak ada move pas lagi kalkulasi winner

    if (winnerId === "SERI") {
        // Kalau seri, reset suit data, suruh suit ulang
        await db.from('rooms').update({ p1_suit: null, p2_suit: null }).eq('id', myRoom);
    } else {
        // Kalau ada yang menang, set winner suit dan set giliran pertama ke pemenang
        const firstPlayerNumber = parseInt(winnerId);
        await db.from('rooms').update({ suit_winner: winnerId, current_player: firstPlayerNumber }).eq('id', myRoom);
    }
    
    isAnimating = false;
    renderBoard();
}

// === SISTEM PAPAN CONGKLAK (Ditingkatkan) ===
function renderBoard() {
    const p1Container = document.getElementById('p1-holes');
    const p2Container = document.getElementById('p2-holes');
    const pregamePanel = document.getElementById('pregame-panel');
    const mainBoardContainer = document.getElementById('main-board-container');
    p1Container.innerHTML = '';
    p2Container.innerHTML = '';

    const p1NameTag = gameState.p1_name || "Menunggu Player 1...";
    const p2NameTag = gameState.p2_name || "Menunggu Player 2...";
    document.getElementById('hole-7-name').innerText = p1NameTag;
    document.getElementById('hole-15-name').innerText = p2NameTag;

    // Menangani UI berdasarkan fase game (Lobby->PreGame->Playing->GameOver)
    // 1. Fase Game Over
    if (gameState.game_over) {
        pregamePanel.classList.add('hidden');
        mainBoardContainer.classList.remove('hidden');
        renderGameHoles(); // Tetap render holes biar keliatan 0 semua

        document.getElementById('hole-7').innerText = gameState.board[7];
        document.getElementById('hole-15').innerText = gameState.board[15];
        const statusText = document.getElementById('status-panel');
        if (gameState.winner === "SERI") statusText.innerText = "GAME OVER: Hasil SERI!";
        else if (parseInt(gameState.winner) === myRole) statusText.innerText = "GAME OVER: KAMU MENANG! 🎉";
        else {
             const winnerName = (gameState.winner === "1") ? gameState.p1_name : gameState.p2_name;
             statusText.innerText = `${winnerName} Menang!`;
        }
        statusText.className = "text-xl font-bold text-rose-900 bg-rose-100 px-6 py-2 rounded-full shadow-sm";
        return;
    }

    // 2. Fase Playing (Udah ada pemenang suit)
    if (gameState.suit_winner) {
        pregamePanel.classList.add('hidden');
        document.getElementById('pregame-ready-section').classList.add('hidden');
        mainBoardContainer.classList.remove('hidden');
        renderGameHoles();

        document.getElementById('hole-7').innerText = gameState.board[7];
        document.getElementById('hole-15').innerText = gameState.board[15];
        const statusText = document.getElementById('status-panel');

        if (isAnimating) {
            statusText.innerText = "Biji lagi jalan...";
            statusText.className = "text-xl font-bold text-blue-900 bg-blue-100 px-6 py-2 rounded-full shadow-sm animate-pulse";
        } else if (gameState.current_player === myRole) {
            statusText.innerText = "Giliran KAMU! Gilas!";
            statusText.className = "text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-2 rounded-full shadow-sm";
        } else {
            const currentPlayerName = (gameState.current_player === 1) ? gameState.p1_name : gameState.p2_name;
            statusText.innerText = `Menunggu ${currentPlayerName}...`;
            statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
        }
    } 
    // 3. Fase Pre-Game (Lagi Ready/Suit)
    else {
        mainBoardContainer.classList.add('hidden');
        pregamePanel.classList.remove('hidden');
        
        // Atur UI Ready Section
        if (gameState.p1_ready && gameState.p2_ready) {
             document.getElementById('pregame-ready-status').innerText = "Keduanya Ready! Gila gila gila...";
             document.getElementById('pregame-ready-btn').classList.add('hidden');
        } else {
             document.getElementById('pregame-ready-btn').classList.remove('hidden');
             const RumahKita = `p${myRole}_ready`;
             if (gameState[RumahKita]) {
                 document.getElementById('pregame-ready-btn').innerText = "Menunggu Musuh Ready...";
                 document.getElementById('pregame-ready-btn').disabled = true;
             } else {
                 document.getElementById('pregame-ready-btn').innerText = "Saya Ready Bor!";
                 document.getElementById('pregame-ready-btn').disabled = false;
             }
             document.getElementById('pregame-ready-status').innerText = "Pencet tombol kalau siap:";
        }
        
        // Status Pre-Game
        const statusText = document.getElementById('status-panel');
        if (gameState.p1_suit && gameState.p2_suit) {
             statusText.innerText = "Mengkalkulasi Suit...";
        } else if (pregameCountdownInterval) {
             statusText.innerText = "Bersiap Suit!";
        } else if (gameState.p1_ready && gameState.p2_ready) {
             statusText.innerText = "Giliran Suit!";
        } else {
             statusText.innerText = "Pre-Game: Menunggu Ready";
        }
        statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
    }
}

function renderGameHoles() {
    const p1Container = document.getElementById('p1-holes');
    const p2Container = document.getElementById('p2-holes');
    for (let i = 0; i < 7; i++) { p1Container.innerHTML += createHoleHTML(i, gameState.board[i]); }
    for (let i = 14; i >= 8; i--) { p2Container.innerHTML += createHoleHTML(i, gameState.board[i]); }
}

function createHoleHTML(index, count) {
    const isMyTurn = gameState.current_player === myRole;
    const isMyZone = (myRole === 1 && index >= 0 && index <= 6) || (myRole === 2 && index >= 8 && index <= 14);
    // Kunci tombol kalau bukan giliran, udah game over, atau lagi animasi jalan biji
    const canClick = isMyTurn && isMyZone && count > 0 && !gameState.game_over && !isAnimating && gameState.suit_winner;
    
    return `
        <button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="w-12 h-12 md:w-16 md:h-16 bg-amber-100 disabled:opacity-90 disabled:cursor-not-allowed rounded-full flex items-center justify-center font-black text-amber-950 shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)] hover:bg-amber-200 active:scale-90 transition-all text-lg md:text-2xl border-[3px] border-amber-900/10 shrink-0">
            ${count}
        </button>
    `;
}

// === LOGIKA INTI CONGKLAK (Estafet Clockwise + Delay) ===
const delay = ms => new Promise(res => setTimeout(res, ms));

async function clickHole(holeIndex) {
    if (!gameState.suit_winner) return; // Belum waktunya main
    isAnimating = true; 
    renderBoard();

    let board = [...gameState.board];
    let p = gameState.current_player;
    let seeds = board[holeIndex];
    board[holeIndex] = 0; // Ambil semua biji dari lubang yang diklik
    let currentIndex = holeIndex;

    // LOOP BESAR: Terus jalan keliling papan selama jatuh di lubang yang ada isinya (estafet)
    while (isSowing) {
        gameState.board = [...board];
        renderBoard();
        await delay(300); // Jeda visual saat ngambil biji

        // LOOP KECIL: Membagikan biji satu per satu searah jarum jam (clockwise)
        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            
            // Lewati rumah musuh
            if (p === 1 && currentIndex === 15) continue;
            if (p === 2 && currentIndex === 7) continue;

            board[currentIndex]++;
            seeds--;

            gameState.board = [...board];
            renderBoard();
            await delay(400); // Kecepatan jalan biji satu-satu (400ms)
        }

        // EVALUASI: Biji terakhir jatuh di mana?
        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) {
            // 1. Jatuh di rumah sendiri -> Giliran dapat bonus main lagi, animasi putaran berhenti
            isSowing = false;
            nextPlayer = p;
        } else if (board[currentIndex] === 1) {
            // 2. Jatuh di lubang KOSONG sisi sendiri (sekarang isinya 1 karena barusan ditaruh) -> Mati / Nembak
            isSowing = false;
            nextPlayer = p === 1 ? 2 : 1; // Giliran ganti ke musuh

            const isP1Zone = currentIndex >= 0 && currentIndex <= 6;
            const isP2Zone = currentIndex >= 8 && currentIndex <= 14;
            
            if ((p === 1 && isP1Zone) || (p === 2 && isP2Zone)) {
                const oppositeIndex = 14 - currentIndex;
                if (board[oppositeIndex] > 0) {
                    await delay(600); // Jeda dramatis sebelum nembak
                    let RumahKita = (p === 1) ? 7 : 15;
                    board[RumahKita] += board[oppositeIndex] + 1; // Ambil biji terakhir itu + semua biji di lubang lawan yang berhadapan
                    board[oppositeIndex] = 0;
                    board[currentIndex] = 0;
                    
                    gameState.board = [...board];
                    renderBoard();
                    await delay(500); // Jeda visual nembak
                }
            }
        } else {
            // 3. Jatuh di lubang kecil yang ADA isinya -> Ambil lagi semua isinya, LANJUT JALAN (Estafet)!
            await delay(500); // Jeda visual estafet sebelum LOOP KECIL mulai lagi
            
            seeds = board[currentIndex];
            board[currentIndex] = 0; 
        }
    }

    let isGameOver = false;
    let winner = null;

    if (checkGameOver(board)) {
        // Raup sisa biji ke rumah masing-masing
        for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; }
        for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; }
        isGameOver = true;
        winner = board[7] > board[15] ? "1" : (board[15] > board[7] ? "2" : "SERI");
    }

    isAnimating = false; // Buka kunci papan

    // Tembak hasil akhirnya ke DB biar layar musuh ikut ke-update
    await db.from('rooms').update({
        board: board,
        current_player: nextPlayer,
        game_over: isGameOver,
        winner: winner
    }).eq('id', myRoom);
}
