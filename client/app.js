const SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myRoom = "";
let myRole = null;
let myClientId = localStorage.getItem('congklak_client_id') || (() => {
    let id = Math.random().toString(36).substring(2, 11);
    localStorage.setItem('congklak_client_id', id);
    return id;
})();

let gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null };

window.onload = () => {
    document.getElementById('room-input').value = Math.random().toString(36).substring(2, 6).toUpperCase();
};

async function joinRoom() {
    const roomInput = document.getElementById('room-input').value.trim().toUpperCase();
    if (!roomInput) return alert("Isi kode room dulu bor!");
    
    document.querySelector("button").innerText = "Loading...";
    myRoom = roomInput;

    let { data: room, error: fetchError } = await db.from('rooms').select('*').eq('id', myRoom).single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        alert("Error Database: " + fetchError.message);
        document.querySelector("button").innerText = "Gabung Game";
        return;
    }

    const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

    if (!room) {
        myRole = 1;
        let { data: newRoom, error: insertError } = await db.from('rooms').insert([{
            id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId
        }]).select().single();

        if (insertError) {
            alert("Gagal bikin room: " + insertError.message);
            document.querySelector("button").innerText = "Gabung Game";
            return;
        }
        room = newRoom;
    } else {
        if (room.p1_id === myClientId) {
            myRole = 1;
        } else if (room.p2_id === myClientId || !room.p2_id) {
            myRole = 2;
            if (!room.p2_id) {
                let { data: updatedRoom, error: updateError } = await db.from('rooms').update({ p2_id: myClientId }).eq('id', myRoom).select().single();
                if (updateError) {
                    alert("Gagal join room: " + updateError.message);
                    document.querySelector("button").innerText = "Gabung Game";
                    return;
                }
                room = updatedRoom;
            }
        } else {
            document.querySelector("button").innerText = "Gabung Game";
            return alert("Waduh, room ini sudah penuh bor!");
        }
    }

    document.getElementById('role-indicator').innerText = `Kamu adalah: Player ${myRole} (Room: ${myRoom})`;
    document.getElementById('lobby').classList.add('hidden');
    document.getElementById('game-info').classList.remove('hidden');
    document.getElementById('game-board').classList.remove('hidden');

    gameState = room;
    renderBoard();

    db.channel('any')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (payload) => {
        gameState = payload.new;
        renderBoard();
    })
    .subscribe();
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
    
    if (gameState.game_over) {
        if (gameState.winner === "SERI") statusText.innerText = "GAME OVER: Hasil SERI!";
        else if (parseInt(gameState.winner) === myRole) statusText.innerText = "GAME OVER: KAMU MENANG! 🏆";
        else statusText.innerText = `GAME OVER: Player ${gameState.winner} Menang!`;
        statusText.className = "text-xl font-bold text-rose-900 bg-rose-100 px-6 py-1.5 rounded-full shadow-sm";
        return;
    }

    if (gameState.current_player === myRole) {
        statusText.innerText = "Giliran KAMU! Gilas!";
        statusText.className = "text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-1.5 rounded-full shadow-sm";
    } else {
        statusText.innerText = `Giliran Player ${gameState.current_player}...`;
        statusText.className = "text-xl font-bold text-amber-900 bg-amber-100 px-6 py-1.5 rounded-full shadow-sm";
    }
}

function createHoleHTML(index, count) {
    const isMyTurn = gameState.current_player === myRole;
    const isMyZone = (myRole === 1 && index >= 0 && index <= 6) || (myRole === 2 && index >= 8 && index <= 14);
    const canClick = isMyTurn && isMyZone && count > 0 && !gameState.game_over;
    return `
        <button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="w-full aspect-square bg-amber-100 disabled:opacity-80 disabled:cursor-not-allowed rounded-full flex items-center justify-center font-black text-amber-950 shadow-[inset_0_2px_4px_rgba(0,0,0,0.3)] hover:bg-amber-200 active:scale-95 transition-all text-base md:text-xl border-2 border-amber-900/20">
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

async function clickHole(holeIndex) {
    let board = [...gameState.board];
    let p = gameState.current_player;
    let seeds = board[holeIndex];
    board[holeIndex] = 0;
    let currentIndex = holeIndex;

    while (seeds > 0) {
        currentIndex = (currentIndex + 1) % 16;
        if (p === 1 && currentIndex === 15) continue;
        if (p === 2 && currentIndex === 7) continue;
        board[currentIndex]++;
        seeds--;
    }

    let nextPlayer = p === 1 ? 2 : 1;
    let isGameOver = false;
    let winner = null;

    if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) {
        nextPlayer = p;
    } else if (board[currentIndex] === 1) {
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
        for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; }
        for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; }
        isGameOver = true;
        winner = board[7] > board[15] ? "1" : (board[15] > board[7] ? "2" : "SERI");
    }

    await db.from('rooms').update({
        board: board,
        current_player: nextPlayer,
        game_over: isGameOver,
        winner: winner
    }).eq('id', myRoom);
}
