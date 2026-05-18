import { playDropSound, changeBGM } from './js/audio.js';

// Ekspos ke global window agar onclick HTML bisa jalan
window.changeBGM = changeBGM;

const SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";

let db = null;
try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch(e) {}

let myRoom = "", myName = "", myRole = null, myChannel = null;
let isAnimating = false, pregameCountdownInterval = null;
window.gameStarted = false; 
window.suitResultTimer = null;
window.activeHole = null; 
window.confettiFired = false;
window.isTutorialMode = false; 
let matchTimer = null, matchSeconds = 0;

let myClientId = "player_" + Math.random().toString(36).substr(2, 9);
try { myClientId = sessionStorage.getItem('congklak_client_id') || myClientId; sessionStorage.setItem('congklak_client_id', myClientId); } catch(e) {}

let gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null, p1_name: "", p2_name: "" };

function triggerVibrate() { try { if (navigator.vibrate) navigator.vibrate(30); } catch(e){} }

// ==== INJECT HTML TERPISAH (INCLUDE) ====
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [lobbyRes, chatRes] = await Promise.all([
            fetch('components/lobby.html'),
            fetch('components/chat.html')
        ]);
        document.getElementById('include-lobby').innerHTML = await lobbyRes.text();
        document.getElementById('include-chat').innerHTML = await chatRes.text();
    } catch(e) {
        console.error("Gagal memuat komponen UI terpisah", e);
    }
    initAppLobby(); // Lanjut jalankan logika utama
});

function initAppLobby() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    let savedName = "";
    try { savedName = localStorage.getItem('congklak_player_name') || ""; } catch(e){}

    if (savedName) {
        const nameInput = document.getElementById('name-input');
        if(nameInput) nameInput.value = savedName;
    }

    const roomInput = document.getElementById('room-input');
    if (roomFromUrl) {
        if(roomInput) roomInput.value = roomFromUrl.toUpperCase();
        if (savedName) {
            const btn = document.getElementById("btn-join");
            if (btn) btn.innerText = "Auto-Join...";
            setTimeout(joinRoom, 800); 
        }
    } else {
        if(roomInput) roomInput.value = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
}

window.toggleTutorial = function() {
    const content = document.getElementById('tutorial-content');
    const arrow = document.getElementById('tutorial-arrow');
    if (content && arrow) {
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden'); arrow.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('hidden'); arrow.style.transform = 'rotate(0deg)';
        }
    }
}

window.startTutorial = function() {
    window.isTutorialMode = true; window.gameStarted = true; myRole = 1; 
    gameState = { board: [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0], current_player: 1, game_over: false, winner: null, p1_name: "Anda", p2_name: "Latihan" };
    document.getElementById('include-lobby').classList.add('hidden');
    document.getElementById('game-area').classList.remove('hidden');
    document.getElementById('pregame-panel').classList.add('hidden');
    document.getElementById('main-board-container').classList.remove('hidden');
    document.getElementById('include-chat').classList.add('hidden'); 
    document.getElementById('action-buttons').classList.remove('hidden');
    document.getElementById('btn-exit-tutorial').classList.remove('hidden');
    document.getElementById('btn-surrender').classList.add('hidden');
    document.getElementById('status-panel').innerText = "Mode Latihan Berjalan";
    document.getElementById('role-indicator').innerText = "BEBAS MAIN DUA SISI";
    renderBoard();
}

window.exitTutorial = function() {
    if(!confirm("Keluar dari Latihan?")) return;
    window.isTutorialMode = false; window.gameStarted = false;
    document.getElementById('include-lobby').classList.remove('hidden');
    document.getElementById('game-area').classList.add('hidden');
    document.getElementById('btn-exit-tutorial').classList.add('hidden');
    document.getElementById('include-chat').classList.remove('hidden');
}

window.shareWhatsApp = function() {
    const appUrl = window.location.href.split('?')[0];
    let msg = `Ayo main Congklak Online!\n\nKlik tautan ini untuk masuk:\n${appUrl}?room=${myRoom}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

function updateTimerDisplay() {
    if (window.isTutorialMode) return; 
    const mins = Math.floor(matchSeconds / 60).toString().padStart(2, '0');
    const secs = (matchSeconds % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('game-timer');
    if(timerEl) timerEl.innerText = `⏱️ ${mins}:${secs}`;
}
function startTimer() {
    if (window.isTutorialMode) return;
    const timerEl = document.getElementById('game-timer');
    if(timerEl) timerEl.classList.remove('hidden');
    if (!matchTimer) { matchTimer = setInterval(() => { if (!gameState.game_over) { matchSeconds++; updateTimerDisplay(); } }, 1000); }
}
function resetTimerLocally() {
    clearInterval(matchTimer); matchTimer = null; matchSeconds = 0; updateTimerDisplay();
    const timerEl = document.getElementById('game-timer'); if(timerEl) timerEl.classList.add('hidden');
}

function checkGamePhase() {
    if (isAnimating || window.isTutorialMode) return;
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && window.gameStarted) { startTimer(); renderBoard(); return; }
    if (gameState.p1_suit && gameState.p2_suit && !gameState.suit_winner && myRole === 1) calculateSuitWinner();
    if (gameState.p1_ready && gameState.p2_ready && !gameState.p1_suit && !gameState.p2_suit && !gameState.suit_winner) {
        const choicesDiv = document.getElementById('pregame-suit-choices');
        if (!pregameCountdownInterval && choicesDiv && choicesDiv.classList.contains('hidden')) startPregameCountdown();
    }
    renderBoard();
}

window.joinRoom = async function() {
    if (!db) return alert("Database gagal.");
    try {
        const roomInput = document.getElementById('room-input'), nameInput = document.getElementById('name-input');
        if(!roomInput || !nameInput) return;
        const roomVal = roomInput.value.trim().toUpperCase(), nameVal = nameInput.value.trim();
        if (!roomVal || !nameVal) return alert("Lengkapi data!");
        
        const bgm = document.getElementById('bgm');
        if(bgm) { bgm.volume = 0.2; bgm.play().catch(e=>console.log(e)); }

        const lobbyBtn = document.getElementById("btn-join");
        if(lobbyBtn) lobbyBtn.innerText = "Memuat...";
        myRoom = roomVal; myName = nameVal; 
        try { localStorage.setItem('congklak_player_name', myName); } catch(e){}
        window.history.replaceState({}, '', `?room=${myRoom}`);

        let { data: room, error: fetchError } = await db.from('rooms').select('*').eq('id', myRoom).single();
        const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

        if (!room) {
            myRole = 1; await db.from('rooms').insert([{ id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId, p1_name: myName, p2_id: null, p2_name: "" }]);
        } else {
            if (room.p1_id === myClientId) { myRole = 1; if (room.p1_name !== myName) await db.from('rooms').update({p1_name: myName}).eq('id', myRoom); } 
            else if (room.p2_id === myClientId) { myRole = 2; if (room.p2_name !== myName) await db.from('rooms').update({p2_name: myName}).eq('id', myRoom); } 
            else if (!room.p2_id) { myRole = 2; await db.from('rooms').update({ p2_id: myClientId, p2_name: myName, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); } 
            else { if(lobbyBtn) lobbyBtn.innerText = "Masuk Ruangan"; return alert("Penuh."); }
        }

        const roomIdEl = document.getElementById('chat-room-id'), lobbyEl = document.getElementById('include-lobby'), gameAreaEl = document.getElementById('game-area');
        if(roomIdEl) roomIdEl.innerText = `KODE: ${myRoom}`;
        if(lobbyEl) lobbyEl.classList.add('hidden');
        if(gameAreaEl) gameAreaEl.classList.remove('hidden');

        let { data: currentRoom } = await db.from('rooms').select('*').eq('id', myRoom).single();
        if (currentRoom) { gameState = currentRoom; if (gameState.suit_winner && gameState.suit_winner !== 'SERI') window.gameStarted = true; checkGamePhase(); }

        if (myChannel) db.removeChannel(myChannel);
        myChannel = db.channel('room_' + myRoom);
        myChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (p) => { if (!isAnimating) { gameState = p.new; checkGamePhase(); } })
        .on('broadcast', { event: 'chat' }, (p) => appendChatMessage(p.payload.senderName, p.payload.text, false))
        .on('broadcast', { event: 'taunt' }, (p) => showFloatingTaunt(p.payload.emoji, false))
        .on('broadcast', { event: 'sowing' }, (p) => { gameState.board = p.payload.board; window.activeHole = p.payload.index; playDropSound(); triggerVibrate(); renderBoard(); })
        .on('broadcast', { event: 'sowing_end' }, () => { window.activeHole = null; renderBoard(); }).subscribe();
    } catch(err) { alert(err.message); }
}

window.insertEmote = function(emoji) { const input = document.getElementById('chat-input'); if(input) input.value += emoji; }
window.sendChat = function() {
    const input = document.getElementById('chat-input');
    if(!input) return; const text = input.value.trim(); if (!text) return;
    appendChatMessage("Anda", text, true);
    myChannel.send({ type: 'broadcast', event: 'chat', payload: { senderName: myName, text: text } }); input.value = '';
}
function appendChatMessage(displayName, text, isMe) {
    const container = document.getElementById('chat-messages'); if(!container) return;
    const msgDiv = document.createElement('div');
    const alignClass = isMe ? 'self-end bg-amber-500 text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl' : 'self-start bg-white border border-amber-200 text-amber-900 rounded-tl-xl rounded-tr-xl rounded-br-xl shadow-sm';
    msgDiv.className = `max-w-[80%] px-4 py-2 text-sm ${alignClass}`;
    msgDiv.innerHTML = `<div class="text-[10px] font-bold ${isMe?'text-amber-100':'text-amber-500'} mb-0.5 uppercase tracking-wide">${displayName}</div><div>${text}</div>`;
    container.appendChild(msgDiv); container.scrollTop = container.scrollHeight;
}
window.sendTaunt = function(emoji) { showFloatingTaunt(emoji, true); if(myChannel) myChannel.send({ type: 'broadcast', event: 'taunt', payload: { emoji: emoji } }); }
function showFloatingTaunt(emoji, isMe) {
    const container = document.getElementById('taunt-container'); if(!container) return;
    const el = document.createElement('div'); el.className = 'float-taunt'; el.innerText = emoji;
    el.style.left = isMe ? `${20 + Math.random()*10}%` : `${60 + Math.random()*10}%`;
    container.appendChild(el); setTimeout(() => el.remove(), 2000);
}
window.surrenderGame = async function() {
    if(confirm("Yakin mau menyerah?")) await db.from('rooms').update({ game_over: true, winner: myRole === 1 ? "2" : "1" }).eq('id', myRoom);
}
window.resetGame = async function() {
    if(confirm("Mulai ulang?")) {
        await db.from('rooms').update({ board: [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0], current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom);
        window.gameStarted = false; window.confettiFired = false; resetTimerLocally();
    }
}
window.takeScreenshotAndShare = function() {
    const btn = document.getElementById('btn-ss'), area = document.getElementById('capture-area');
    if(!btn || !area) return; btn.innerText = "Memproses...";
    html2canvas(area, { backgroundColor: '#fef3c7', scale: 2 }).then(canvas => {
        canvas.toBlob(blob => {
            const file = new File([blob], 'HasilCongklak.jpg', { type: 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({ files: [file], title: 'Hasil Congklak', text: `Main di sini: ${window.location.href.split('?')[0]}?room=${myRoom}` }).catch(console.error);
            } else {
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'HasilCongklak.jpg'; a.click(); alert("Tersimpan.");
            }
            btn.innerHTML = `📸 Pamer Status WA`;
        }, 'image/jpeg', 0.9);
    });
}
window.clickReady = async function() {
    const btn = document.getElementById('pregame-ready-btn'); if(btn) { btn.classList.add('hidden'); btn.disabled = true; }
    await db.from('rooms').update({ [`p${myRole}_ready`]: true }).eq('id', myRoom);
}
function startPregameCountdown() {
    isAnimating = true;
    document.getElementById('pregame-ready-section').classList.add('hidden');
    document.getElementById('pregame-suit-result').classList.add('hidden');
    document.getElementById('pregame-suit-countdown').classList.remove('hidden');
    document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-[10px] uppercase font-bold text-amber-600 tracking-wider mb-2">Mulai Memilih Dalam...</div><div id="pregame-suit-seconds" class="text-7xl font-black drop-shadow-sm">5</div>`;
    let secondsLeft = 5;
    pregameCountdownInterval = setInterval(() => {
        secondsLeft--; const c = document.getElementById('pregame-suit-seconds'); if (c) c.innerText = secondsLeft;
        if (secondsLeft <= 0) { clearInterval(pregameCountdownInterval); pregameCountdownInterval = null; document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.remove('hidden'); isAnimating = false; }
    }, 1000);
}
window.clickSuit = async function(choice) {
    document.getElementById('pregame-suit-choices').classList.add('hidden');
    document.getElementById('pregame-suit-countdown').classList.remove('hidden');
    document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan...</div>`;
    await db.from('rooms').update({ [`p${myRole}_suit`]: choice }).eq('id', myRoom);
}
async function calculateSuitWinner() {
    if (myRole !== 1) return; 
    const p1 = gameState.p1_suit, p2 = gameState.p2_suit; if (!p1 || !p2) return;
    let w = "SERI";
    if ((p1 === 'batu' && p2 === 'gunting') || (p1 === 'gunting' && p2 === 'kertas') || (p1 === 'kertas' && p2 === 'batu')) w = "1"; else if (p1 !== p2) w = "2"; 
    await db.from('rooms').update({ suit_winner: w, current_player: w !== "SERI" ? parseInt(w) : gameState.current_player }).eq('id', myRoom);
}
function renderBoard() {
    if (window.isTutorialMode) { document.getElementById('status-panel').innerText = (gameState.current_player === 1) ? "Giliran Bawah" : "Giliran Atas"; renderGameHoles(); return; }
    const s = document.getElementById('status-panel'), b = document.getElementById('action-buttons');
    if(document.getElementById('role-indicator')) document.getElementById('role-indicator').innerText = `ANDA PLAYER ${myRole}`;

    if (gameState.p1_suit && gameState.p2_suit && !window.gameStarted) {
        document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-ready-section').classList.add('hidden');
        document.getElementById('pregame-suit-result').classList.remove('hidden'); if(b) b.classList.add('hidden');
        const icons = { batu: '✊', kertas: '✋', gunting: '✌️' };
        let t = "Menghitung...", c = "text-amber-600";
        if (gameState.suit_winner) { if (gameState.suit_winner === 'SERI') { t = "SERI! Mengulang..."; c = "text-blue-600"; } else if (gameState.suit_winner === myRole.toString()) { t = "ANDA MENANG! Jalan pertama."; c = "text-emerald-600"; } else { t = "LAWAN MENANG."; c = "text-rose-600"; } }
        document.getElementById('pregame-suit-result').innerHTML = `<div class="flex gap-8 text-4xl mb-4 text-center"><div><div class="text-xs mb-2">${gameState.p1_name}</div>${icons[gameState.p1_suit]}</div><div class="text-2xl font-black text-amber-400">VS</div><div><div class="text-xs mb-2">${gameState.p2_name}</div>${icons[gameState.p2_suit]}</div></div><div class="text-xl font-black ${c}">${t}</div>`;
        if (gameState.suit_winner && !window.suitResultTimer) {
            window.suitResultTimer = setTimeout(async () => { window.suitResultTimer = null; document.getElementById('pregame-suit-result').classList.add('hidden'); 
                if (gameState.suit_winner === 'SERI') { if (myRole === 1) await db.from('rooms').update({ p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); } else { window.gameStarted = true; renderBoard(); }
            }, 3500);
        }
        if(s) { s.innerText = "Fase Penentuan"; s.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
        return; 
    }
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && window.gameStarted) {
        document.getElementById('pregame-panel').classList.add('hidden'); document.getElementById('main-board-container').classList.remove('hidden'); if(b) b.classList.remove('hidden'); renderGameHoles();
        if (gameState.game_over) {
            clearInterval(matchTimer); document.getElementById('btn-surrender').classList.add('hidden'); document.getElementById('btn-reset').classList.remove('hidden');
            if (gameState.winner === "SERI") { s.innerText = "HASIL SERI!"; document.getElementById('btn-ss').classList.add('hidden'); } else if (parseInt(gameState.winner) === myRole) { s.innerText = "ANDA MENANG! 🎉"; document.getElementById('btn-ss').classList.remove('hidden'); if (!window.confettiFired) { window.confettiFired = true; if(typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); } } else { s.innerText = `${gameState.winner==="1"?gameState.p1_name:gameState.p2_name} Menang.`; document.getElementById('btn-ss').classList.add('hidden'); }
            s.className = "text-lg md:text-xl font-bold text-rose-900 bg-rose-100 px-6 py-2 rounded-full shadow-sm";
        } else {
            document.getElementById('btn-surrender').classList.remove('hidden'); document.getElementById('btn-reset').classList.add('hidden'); document.getElementById('btn-ss').classList.add('hidden');
            if (isAnimating) { s.innerText = "Membagikan biji..."; s.className = "text-lg md:text-xl font-bold text-blue-900 bg-blue-100 px-6 py-2 rounded-full shadow-sm animate-pulse"; } else if (gameState.current_player === myRole) { s.innerText = "Giliran Anda."; s.className = "text-lg md:text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-2 rounded-full shadow-sm"; } else { s.innerText = `Menunggu ${gameState.current_player === 1 ? gameState.p1_name : gameState.p2_name}...`; s.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
        }
    } else {
        document.getElementById('main-board-container').classList.add('hidden'); document.getElementById('pregame-panel').classList.remove('hidden'); if(b) b.classList.add('hidden');
        if (!gameState.p1_ready || !gameState.p2_ready) {
             document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-suit-result').classList.add('hidden'); document.getElementById('pregame-ready-section').classList.remove('hidden');
             const btn = document.getElementById('pregame-ready-btn');
             if (gameState[`p${myRole}_ready`]) { if(btn) { btn.innerText = "Menunggu Lawan Siap..."; btn.disabled = true; btn.classList.remove('hidden'); } } else { if(btn) { btn.innerText = "Siap Bermain"; btn.disabled = false; btn.classList.remove('hidden'); } }
        } else {
             document.getElementById('pregame-ready-section').classList.add('hidden');
             if (gameState[`p${myRole}_suit`]) { document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-suit-countdown').classList.remove('hidden'); document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan Memilih...</div>`; }
        }
        if(s) { s.innerText = "Persiapan Permainan"; s.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
    }
}
function renderSeeds(c) { let html = ''; for (let i = 0; i < Math.min(c, 15); i++) html += `<div class="w-2 h-2 rounded-full bg-amber-800 shadow-sm"></div>`; if (c > 15) html += `<div class="text-[10px] font-bold text-amber-900 leading-none">+</div>`; return html; }
function renderGameHoles() {
    const topContainer = document.getElementById('holes-top'), bottomContainer = document.getElementById('holes-bottom'); if(!topContainer || !bottomContainer) return;
    topContainer.innerHTML = ''; bottomContainer.innerHTML = '';
    let bIdx, tIdx, lsIdx, rsIdx, lName, rName;
    if (myRole === 1 || myRole === null || window.isTutorialMode) { bIdx = [6,5,4,3,2,1,0]; tIdx = [8,9,10,11,12,13,14]; lsIdx = 7; rsIdx = 15; lName = gameState.p1_name || "Player 1"; rName = gameState.p2_name || "Player 2"; } else { bIdx = [14,13,12,11,10,9,8]; tIdx = [0,1,2,3,4,5,6]; lsIdx = 15; rsIdx = 7; lName = gameState.p2_name || "Player 2"; rName = gameState.p1_name || "Player 1"; }
    document.getElementById('store-left-name').innerText = `RUMAH: ${lName}`; document.getElementById('store-right-name').innerText = `RUMAH: ${rName}`;
    document.getElementById('store-left-text').innerText = gameState.board[lsIdx]; document.getElementById('store-left-seeds').innerHTML = renderSeeds(gameState.board[lsIdx]);
    document.getElementById('store-right-text').innerText = gameState.board[rsIdx]; document.getElementById('store-right-seeds').innerHTML = renderSeeds(gameState.board[rsIdx]);
    bIdx.forEach(idx => { bottomContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); }); tIdx.forEach(idx => { topContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); });
}
function createHoleHTML(index, count) {
    let canClick = false;
    if (window.isTutorialMode) { canClick = count > 0 && !gameState.game_over && !isAnimating && ((gameState.current_player===1 && index>=0 && index<=6) || (gameState.current_player===2 && index>=8 && index<=14)); } else { canClick = gameState.current_player === myRole && ((myRole===1 && index>=0 && index<=6) || (myRole===2 && index>=8 && index<=14)) && count > 0 && !gameState.game_over && !isAnimating && window.gameStarted; }
    const actCls = (index === window.activeHole) ? 'active-hole' : 'border-[3px] border-amber-900/10 hover:bg-amber-200';
    return `<button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="relative overflow-hidden w-12 h-12 md:w-16 md:h-16 bg-amber-100 disabled:opacity-90 disabled:cursor-not-allowed rounded-full flex flex-col items-center justify-end pb-1 shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)] active:scale-90 transition-all shrink-0 ${actCls}"><div class="absolute top-1 md:top-2 left-0 w-full px-2 flex flex-wrap justify-center gap-[2px] pointer-events-none">${renderSeeds(count)}</div><span class="z-10 bg-white/50 px-1.5 py-[1px] rounded text-xs font-black text-amber-950 shadow-sm">${count}</span></button>`;
}
function checkGameOver(b) { let p1E = true, p2E = true; for (let i = 0; i < 7; i++) { if (b[i] > 0) p1E = false; } for (let i = 8; i < 15; i++) { if (b[i] > 0) p2E = false; } return p1E || p2E; }
const delay = ms => new Promise(r => setTimeout(r, ms));
window.clickHole = async function(holeIndex) {
    if (!window.gameStarted && !window.isTutorialMode) return; 
    isAnimating = true; let board = [...gameState.board], p = gameState.current_player, seeds = board[holeIndex]; board[holeIndex] = 0; 
    let currentIndex = holeIndex, isSowing = true, nextPlayer = p;
    while (isSowing) {
        gameState.board = [...board]; renderBoard(); await delay(300); 
        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            if (p === 1 && currentIndex === 15) continue; if (p === 2 && currentIndex === 7) continue;
            board[currentIndex]++; seeds--; window.activeHole = currentIndex; gameState.board = [...board]; renderBoard(); playDropSound(); triggerVibrate();
            if (!window.isTutorialMode && myChannel) myChannel.send({ type: 'broadcast', event: 'sowing', payload: { board: board, index: currentIndex } });
            await delay(450); 
        }
        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) { isSowing = false; nextPlayer = p;
        } else if (board[currentIndex] === 1) {
            isSowing = false; nextPlayer = p === 1 ? 2 : 1; 
            if ((p === 1 && currentIndex >= 0 && currentIndex <= 6) || (p === 2 && currentIndex >= 8 && currentIndex <= 14)) {
                const op = 14 - currentIndex;
                if (board[op] > 0) {
                    await delay(600); let rk = (p === 1) ? 7 : 15; board[rk] += board[op] + 1; board[op] = 0; board[currentIndex] = 0;
                    window.activeHole = null; gameState.board = [...board]; renderBoard(); 
                    if (!window.isTutorialMode && myChannel) myChannel.send({ type: 'broadcast', event: 'sowing_end' });
                    await delay(500); 
                }
            }
        } else { await delay(500); seeds = board[currentIndex]; board[currentIndex] = 0; }
    }
    let isGameOver = false, winner = null;
    if (checkGameOver(board)) { for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; } for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; } isGameOver = true; winner = board[7] > board[15] ? "1" : (board[15] > board[7] ? "2" : "SERI"); }
    isAnimating = false; window.activeHole = null;
    if (window.isTutorialMode) { gameState.current_player = nextPlayer; gameState.game_over = isGameOver; gameState.winner = winner; renderBoard(); if (isGameOver) document.getElementById('status-panel').innerText = "Latihan Selesai!";
    } else { if (myChannel) myChannel.send({ type: 'broadcast', event: 'sowing_end' }); await db.from('rooms').update({ board: board, current_player: nextPlayer, game_over: isGameOver, winner: winner }).eq('id', myRoom); }
}
