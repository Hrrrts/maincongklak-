const SUPABASE_URL = "https://dcfgjrfxnoeumusesbeo.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjZmdqcmZ4bm9ldW11c2VzYmVvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODk2MzU4OSwiZXhwIjoyMDk0NTM5NTg5fQ.vt7Cbda1MnRRIzcSWia79HewVLnYTkIqM_dALx0euSY";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let myRoom = "", myName = "", myRole = null, myChannel = null;
let isAnimating = false, pregameCountdownInterval = null;
window.gameStarted = false; 
window.suitResultTimer = null;
window.activeHole = null; 
window.confettiFired = false;

let matchTimer = null, matchSeconds = 0;

let myClientId = "player_" + Math.random().toString(36).substr(2, 9);
try {
    myClientId = sessionStorage.getItem('congklak_client_id') || myClientId;
    sessionStorage.setItem('congklak_client_id', myClientId);
} catch(e) {}

let gameState = { board: new Array(16).fill(0), current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null, p1_name: "", p2_name: "" };

// FIX: Lazy Load Audio agar tidak di-crash oleh browser!
let audioCtx = null;
function initAudio() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch(e) { console.error("Audio diblokir browser:", e); }
}

function playDropSound() {
    initAudio();
    if(!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } catch(e){}
}
function triggerVibrate() { try { if (navigator.vibrate) navigator.vibrate(30); } catch(e){} }

window.changeBGM = function() {
    const bgm = document.getElementById('bgm');
    const select = document.getElementById('bgm-select');
    if(bgm && select) {
        bgm.src = select.value;
        bgm.play().catch(e => console.log("BGM dicegah autoplay"));
    }
}

// FIX: Pindahkan onload ke event listener agar lebih aman
document.addEventListener('DOMContentLoaded', () => {
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
            const btn = document.querySelector("#lobby button");
            if (btn) btn.innerText = "Auto-Join...";
            setTimeout(joinRoom, 800); 
        }
    } else {
        if(roomInput) roomInput.value = Math.random().toString(36).substring(2, 6).toUpperCase();
    }
});

window.toggleTutorial = function() {
    const content = document.getElementById('tutorial-content');
    const arrow = document.getElementById('tutorial-arrow');
    if (content && arrow) {
        if (content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            arrow.style.transform = 'rotate(180deg)';
        } else {
            content.classList.add('hidden');
            arrow.style.transform = 'rotate(0deg)';
        }
    }
}

function shareWhatsApp() {
    const appUrl = window.location.href.split('?')[0];
    let message = `Ayo main Congklak Online!\n\nKlik tautan ini untuk masuk:\n${appUrl}?room=${myRoom}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`, '_blank');
}

function updateTimerDisplay() {
    const mins = Math.floor(matchSeconds / 60).toString().padStart(2, '0');
    const secs = (matchSeconds % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('game-timer');
    if(timerEl) timerEl.innerText = `⏱️ ${mins}:${secs}`;
}
function startTimer() {
    const timerEl = document.getElementById('game-timer');
    if(timerEl) timerEl.classList.remove('hidden');
    if (!matchTimer) {
        matchTimer = setInterval(() => {
            if (!gameState.game_over) {
                matchSeconds++;
                updateTimerDisplay();
            }
        }, 1000);
    }
}
function resetTimerLocally() {
    clearInterval(matchTimer);
    matchTimer = null; matchSeconds = 0;
    updateTimerDisplay();
    const timerEl = document.getElementById('game-timer');
    if(timerEl) timerEl.classList.add('hidden');
}

function checkGamePhase() {
    if (isAnimating) return;
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && window.gameStarted) {
        startTimer(); renderBoard(); return;
    }
    if (gameState.p1_suit && gameState.p2_suit && !gameState.suit_winner && myRole === 1) calculateSuitWinner();
    if (gameState.p1_ready && gameState.p2_ready && !gameState.p1_suit && !gameState.p2_suit && !gameState.suit_winner) {
        const choicesDiv = document.getElementById('pregame-suit-choices');
        if (!pregameCountdownInterval && choicesDiv && choicesDiv.classList.contains('hidden')) startPregameCountdown();
    }
    renderBoard();
}

window.joinRoom = async function() {
    const roomInput = document.getElementById('room-input');
    const nameInput = document.getElementById('name-input');
    if(!roomInput || !nameInput) return;
    const roomVal = roomInput.value.trim().toUpperCase();
    const nameVal = nameInput.value.trim();

    if (!roomVal || !nameVal) return alert("Lengkapi data!");
    
    // Mulai Audio Context & Musik pas diklik
    initAudio();
    const bgm = document.getElementById('bgm');
    if(bgm) { bgm.volume = 0.2; bgm.play().catch(e => console.log(e)); }

    const lobbyBtn = document.querySelector("#lobby button");
    if(lobbyBtn) lobbyBtn.innerText = "Memuat...";
    myRoom = roomVal; myName = nameVal; 
    
    try { localStorage.setItem('congklak_player_name', myName); } catch(e){}
    window.history.replaceState({}, '', `?room=${myRoom}`);

    let { data: room } = await db.from('rooms').select('*').eq('id', myRoom).single();
    const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

    if (!room) {
        myRole = 1;
        await db.from('rooms').insert([{ id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId, p1_name: myName, p2_id: null, p2_name: "" }]);
    } else {
        if (room.p1_id === myClientId) { myRole = 1; if (room.p1_name !== myName) await db.from('rooms').update({p1_name: myName}).eq('id', myRoom); } 
        else if (room.p2_id === myClientId) { myRole = 2; if (room.p2_name !== myName) await db.from('rooms').update({p2_name: myName}).eq('id', myRoom); } 
        else if (!room.p2_id) { myRole = 2; await db.from('rooms').update({ p2_id: myClientId, p2_name: myName, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); } 
        else {
            if(lobbyBtn) lobbyBtn.innerText = "Masuk Ruangan";
            return alert("Ruangan penuh.");
        }
    }

    const roomIdEl = document.getElementById('chat-room-id');
    const lobbyEl = document.getElementById('lobby');
    const gameAreaEl = document.getElementById('game-area');
    if(roomIdEl) roomIdEl.innerText = `KODE: ${myRoom}`;
    if(lobbyEl) lobbyEl.classList.add('hidden');
    if(gameAreaEl) gameAreaEl.classList.remove('hidden');

    let { data: currentRoom } = await db.from('rooms').select('*').eq('id', myRoom).single();
    if (currentRoom) { 
        gameState = currentRoom; 
        if (gameState.suit_winner && gameState.suit_winner !== 'SERI') window.gameStarted = true;
        checkGamePhase(); 
    }

    if (myChannel) db.removeChannel(myChannel);
    myChannel = db.channel('room_' + myRoom);
    myChannel
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (payload) => {
        if (!isAnimating) { gameState = payload.new; checkGamePhase(); }
    })
    .on('broadcast', { event: 'chat' }, (payload) => appendChatMessage(payload.payload.senderName, payload.payload.text, false))
    .on('broadcast', { event: 'taunt' }, (payload) => showFloatingTaunt(payload.payload.emoji, false))
    .on('broadcast', { event: 'sowing' }, (payload) => { gameState.board = payload.payload.board; window.activeHole = payload.payload.index; playDropSound(); triggerVibrate(); renderBoard(); })
    .on('broadcast', { event: 'sowing_end' }, () => { window.activeHole = null; renderBoard(); })
    .subscribe();
}

window.insertEmote = function(emoji) { 
    const input = document.getElementById('chat-input');
    if(input) input.value += emoji; 
}
window.sendChat = function() {
    const input = document.getElementById('chat-input');
    if(!input) return;
    const text = input.value.trim();
    if (!text) return;
    appendChatMessage("Anda", text, true);
    myChannel.send({ type: 'broadcast', event: 'chat', payload: { senderName: myName, text: text } });
    input.value = '';
}
function appendChatMessage(displayName, text, isMe) {
    const container = document.getElementById('chat-messages');
    if(!container) return;
    const msgDiv = document.createElement('div');
    const alignClass = isMe ? 'self-end bg-amber-500 text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl' : 'self-start bg-white border border-amber-200 text-amber-900 rounded-tl-xl rounded-tr-xl rounded-br-xl shadow-sm';
    msgDiv.className = `max-w-[80%] px-4 py-2 text-sm ${alignClass}`;
    msgDiv.innerHTML = `<div class="text-[10px] font-bold ${isMe?'text-amber-100':'text-amber-500'} mb-0.5 uppercase tracking-wide">${displayName}</div><div>${text}</div>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

window.sendTaunt = function(emoji) {
    showFloatingTaunt(emoji, true);
    myChannel.send({ type: 'broadcast', event: 'taunt', payload: { emoji: emoji } });
}
function showFloatingTaunt(emoji, isMe) {
    const container = document.getElementById('taunt-container');
    if(!container) return;
    const el = document.createElement('div');
    el.className = 'float-taunt';
    el.innerText = emoji;
    el.style.left = isMe ? `${20 + Math.random()*10}%` : `${60 + Math.random()*10}%`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

window.surrenderGame = async function() {
    if(confirm("Yakin mau menyerah? Biji dan harga diri akan hilang!")) {
        const winner = myRole === 1 ? "2" : "1";
        await db.from('rooms').update({ game_over: true, winner: winner }).eq('id', myRoom);
    }
}
window.resetGame = async function() {
    if(confirm("Mulai permainan baru?")) {
        const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];
        await db.from('rooms').update({ board: initialBoard, current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom);
        window.gameStarted = false;
        window.confettiFired = false;
        resetTimerLocally();
    }
}

window.takeScreenshotAndShare = function() {
    const btn = document.getElementById('btn-ss');
    const area = document.getElementById('capture-area');
    if(!btn || !area) return;
    btn.innerText = "Memproses...";
    
    html2canvas(area, { backgroundColor: '#fef3c7', scale: 2 }).then(canvas => {
        canvas.toBlob(blob => {
            const file = new File([blob], 'HasilCongklak.jpg', { type: 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                navigator.share({
                    files: [file],
                    title: 'Hasil Congklak',
                    text: `Saya memenangkan pertandingan Congklak! Main di sini: ${window.location.href.split('?')[0]}?room=${myRoom}`
                }).catch(console.error);
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = 'HasilCongklak.jpg'; a.click();
                alert("Gambar berhasil di-download! Silakan bagikan manual.");
            }
            btn.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> Pamer Status WA`;
        }, 'image/jpeg', 0.9);
    });
}

window.clickReady = async function() {
    const btn = document.getElementById('pregame-ready-btn');
    if(btn) { btn.classList.add('hidden'); btn.disabled = true; }
    let RumahKita = `p${myRole}_ready`;
    await db.from('rooms').update({ [RumahKita]: true }).eq('id', myRoom);
}
function startPregameCountdown() {
    isAnimating = true;
    document.getElementById('pregame-ready-section').classList.add('hidden');
    document.getElementById('pregame-suit-result').classList.add('hidden');
    const countdownDiv = document.getElementById('pregame-suit-countdown');
    countdownDiv.classList.remove('hidden');
    countdownDiv.innerHTML = `<div class="text-[10px] uppercase font-bold text-amber-600 tracking-wider mb-2">Mulai Memilih Dalam...</div><div id="pregame-suit-seconds" class="text-7xl font-black drop-shadow-sm">5</div>`;
    let secondsLeft = 5;
    pregameCountdownInterval = setInterval(() => {
        secondsLeft--;
        const counterDisplay = document.getElementById('pregame-suit-seconds');
        if (counterDisplay) counterDisplay.innerText = secondsLeft;
        if (secondsLeft <= 0) { clearInterval(pregameCountdownInterval); pregameCountdownInterval = null; showSuitChoices(); }
    }, 1000);
}
function showSuitChoices() { 
    document.getElementById('pregame-suit-countdown').classList.add('hidden'); 
    document.getElementById('pregame-suit-choices').classList.remove('hidden'); 
    isAnimating = false; 
}
window.clickSuit = async function(choice) {
    document.getElementById('pregame-suit-choices').classList.add('hidden');
    const countdownDiv = document.getElementById('pregame-suit-countdown');
    countdownDiv.classList.remove('hidden');
    countdownDiv.innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan...</div>`;
    let RumahKita = `p${myRole}_suit`;
    await db.from('rooms').update({ [RumahKita]: choice }).eq('id', myRoom);
}
async function calculateSuitWinner() {
    if (myRole !== 1) return; 
    const p1 = gameState.p1_suit, p2 = gameState.p2_suit;
    if (!p1 || !p2) return;
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
    const actionButtons = document.getElementById('action-buttons');
    const btnSurrender = document.getElementById('btn-surrender');
    const btnReset = document.getElementById('btn-reset');
    const btnSS = document.getElementById('btn-ss');
    const roleIndicator = document.getElementById('role-indicator');

    if(roleIndicator) roleIndicator.innerText = `ANDA PLAYER ${myRole}`;

    if (gameState.p1_suit && gameState.p2_suit && !window.gameStarted) {
        document.getElementById('pregame-suit-countdown').classList.add('hidden');
        document.getElementById('pregame-suit-choices').classList.add('hidden');
        document.getElementById('pregame-ready-section').classList.add('hidden');
        const resultDiv = document.getElementById('pregame-suit-result');
        resultDiv.classList.remove('hidden');
        if(actionButtons) actionButtons.classList.add('hidden');

        const icons = { batu: '✊', kertas: '✋', gunting: '✌️' };
        let winText = "Menghitung hasil...", textStyle = "text-amber-600";
        if (gameState.suit_winner) {
            if (gameState.suit_winner === 'SERI') { winText = "HASIL SERI! Mengulang..."; textStyle = "text-blue-600"; }
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
        if(statusText) {
            statusText.innerText = "Fase Penentuan";
            statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
        }
        return; 
    }

    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && window.gameStarted) {
        pregamePanel.classList.add('hidden');
        mainBoardContainer.classList.remove('hidden');
        if(actionButtons) actionButtons.classList.remove('hidden'); 
        renderGameHoles();

        if (gameState.game_over) {
            clearInterval(matchTimer);
            if(btnSurrender) btnSurrender.classList.add('hidden');
            if(btnReset) btnReset.classList.remove('hidden');
            
            if (gameState.winner === "SERI") {
                if(statusText) statusText.innerText = "PERMAINAN SELESAI: HASIL SERI!";
                if(btnSS) btnSS.classList.add('hidden');
            } else if (parseInt(gameState.winner) === myRole) {
                 if(statusText) statusText.innerText = "ANDA MENANG! 🎉";
                 if(btnSS) btnSS.classList.remove('hidden'); 
                 if (!window.confettiFired) {
                     window.confettiFired = true;
                     if(typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                 }
            } else {
                 const winnerName = (gameState.winner === "1") ? gameState.p1_name : gameState.p2_name;
                 if(statusText) statusText.innerText = `${winnerName} Memenangkan Permainan.`;
                 if(btnSS) btnSS.classList.add('hidden');
            }
            if(statusText) statusText.className = "text-lg md:text-xl font-bold text-rose-900 bg-rose-100 px-6 py-2 rounded-full shadow-sm";
        } else {
            if(btnSurrender) btnSurrender.classList.remove('hidden');
            if(btnReset) btnReset.classList.add('hidden');
            if(btnSS) btnSS.classList.add('hidden');

            if (isAnimating) {
                if(statusText) {
                    statusText.innerText = "Sedang membagikan biji...";
                    statusText.className = "text-lg md:text-xl font-bold text-blue-900 bg-blue-100 px-6 py-2 rounded-full shadow-sm animate-pulse";
                }
            } else if (gameState.current_player === myRole) {
                if(statusText) {
                    statusText.innerText = "Giliran Anda.";
                    statusText.className = "text-lg md:text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-2 rounded-full shadow-sm";
                }
            } else {
                const currentPlayerName = (gameState.current_player === 1) ? gameState.p1_name : gameState.p2_name;
                if(statusText) {
                    statusText.innerText = `Menunggu ${currentPlayerName}...`;
                    statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
                }
            }
        }
    } else {
        mainBoardContainer.classList.add('hidden');
        pregamePanel.classList.remove('hidden'); 
        if(actionButtons) actionButtons.classList.add('hidden');
        
        if (!gameState.p1_ready || !gameState.p2_ready) {
             document.getElementById('pregame-suit-countdown').classList.add('hidden');
             document.getElementById('pregame-suit-choices').classList.add('hidden');
             document.getElementById('pregame-suit-result').classList.add('hidden');
             document.getElementById('pregame-ready-section').classList.remove('hidden');
             const RumahKita = `p${myRole}_ready`;
             const btn = document.getElementById('pregame-ready-btn');
             if (gameState[RumahKita]) {
                 if(btn) { btn.innerText = "Menunggu Lawan Siap..."; btn.disabled = true; btn.classList.remove('hidden'); }
             } else {
                 if(btn) { btn.innerText = "Siap Bermain"; btn.disabled = false; btn.classList.remove('hidden'); }
             }
        } else {
             document.getElementById('pregame-ready-section').classList.add('hidden');
             const RumahKitaSuit = `p${myRole}_suit`;
             if (gameState[RumahKitaSuit]) {
                 document.getElementById('pregame-suit-choices').classList.add('hidden');
                 const countdownDiv = document.getElementById('pregame-suit-countdown');
                 countdownDiv.classList.remove('hidden');
                 countdownDiv.innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan Memilih...</div>`;
             }
        }
        if(statusText) {
            statusText.innerText = "Persiapan Permainan";
            statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm";
        }
    }
}

function renderSeeds(count) {
    const maxVisual = 15; 
    const displayCount = Math.min(count, maxVisual);
    let seedsHTML = '';
    for (let i = 0; i < displayCount; i++) seedsHTML += `<div class="w-2 h-2 rounded-full bg-amber-800 shadow-sm"></div>`;
    if (count > maxVisual) seedsHTML += `<div class="text-[10px] font-bold text-amber-900 leading-none">+</div>`;
    return seedsHTML;
}

function renderGameHoles() {
    const topContainer = document.getElementById('holes-top');
    const bottomContainer = document.getElementById('holes-bottom');
    if(!topContainer || !bottomContainer) return;
    topContainer.innerHTML = ''; bottomContainer.innerHTML = '';

    let bottomIndices, topIndices, leftStoreIndex, rightStoreIndex, leftName, rightName;

    if (myRole === 1 || myRole === null) {
        bottomIndices = [6, 5, 4, 3, 2, 1, 0]; topIndices = [8, 9, 10, 11, 12, 13, 14]; 
        leftStoreIndex = 7; rightStoreIndex = 15;
        leftName = gameState.p1_name || "Player 1"; rightName = gameState.p2_name || "Player 2";
    } else {
        bottomIndices = [14, 13, 12, 11, 10, 9, 8]; topIndices = [0, 1, 2, 3, 4, 5, 6]; 
        leftStoreIndex = 15; rightStoreIndex = 7;
        leftName = gameState.p2_name || "Player 2"; rightName = gameState.p1_name || "Player 1";
    }

    document.getElementById('store-left-name').innerText = `RUMAH: ${leftName}`;
    document.getElementById('store-right-name').innerText = `RUMAH: ${rightName}`;
    document.getElementById('store-left-text').innerText = gameState.board[leftStoreIndex];
    document.getElementById('store-left-seeds').innerHTML = renderSeeds(gameState.board[leftStoreIndex]);
    document.getElementById('store-right-text').innerText = gameState.board[rightStoreIndex];
    document.getElementById('store-right-seeds').innerHTML = renderSeeds(gameState.board[rightStoreIndex]);

    bottomIndices.forEach(idx => { bottomContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); });
    topIndices.forEach(idx => { topContainer.innerHTML += createHoleHTML(idx, gameState.board[idx]); });
}

function createHoleHTML(index, count) {
    const isMyTurn = gameState.current_player === myRole;
    const isMyZone = (myRole === 1 && index >= 0 && index <= 6) || (myRole === 2 && index >= 8 && index <= 14);
    const canClick = isMyTurn && isMyZone && count > 0 && !gameState.game_over && !isAnimating && window.gameStarted;
    const activeClass = (index === window.activeHole) ? 'active-hole' : 'border-[3px] border-amber-900/10 hover:bg-amber-200';
    return `
        <button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="relative overflow-hidden w-12 h-12 md:w-16 md:h-16 bg-amber-100 disabled:opacity-90 disabled:cursor-not-allowed rounded-full flex flex-col items-center justify-end pb-1 shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)] active:scale-90 transition-all shrink-0 ${activeClass}">
            <div class="absolute top-1 md:top-2 left-0 w-full px-2 flex flex-wrap justify-center gap-[2px] pointer-events-none">${renderSeeds(count)}</div>
            <span class="z-10 bg-white/50 px-1.5 py-[1px] rounded text-xs font-black text-amber-950 shadow-sm">${count}</span>
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

window.clickHole = async function(holeIndex) {
    if (!window.gameStarted) return; 
    isAnimating = true; 
    let board = [...gameState.board], p = gameState.current_player, seeds = board[holeIndex];
    board[holeIndex] = 0; 
    let currentIndex = holeIndex, isSowing = true, nextPlayer = p;

    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    while (isSowing) {
        gameState.board = [...board]; renderBoard(); await delay(300); 

        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            if (p === 1 && currentIndex === 15) continue;
            if (p === 2 && currentIndex === 7) continue;

            board[currentIndex]++; seeds--;
            window.activeHole = currentIndex; gameState.board = [...board];
            renderBoard(); playDropSound(); triggerVibrate();
            myChannel.send({ type: 'broadcast', event: 'sowing', payload: { board: board, index: currentIndex } });
            await delay(450); 
        }

        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) {
            isSowing = false; nextPlayer = p;
        } else if (board[currentIndex] === 1) {
            isSowing = false; nextPlayer = p === 1 ? 2 : 1; 
            const isP1Zone = currentIndex >= 0 && currentIndex <= 6;
            const isP2Zone = currentIndex >= 8 && currentIndex <= 14;
            if ((p === 1 && isP1Zone) || (p === 2 && isP2Zone)) {
                const oppositeIndex = 14 - currentIndex;
                if (board[oppositeIndex] > 0) {
                    await delay(600); 
                    let RumahKita = (p === 1) ? 7 : 15;
                    board[RumahKita] += board[oppositeIndex] + 1; board[oppositeIndex] = 0; board[currentIndex] = 0;
                    window.activeHole = null; gameState.board = [...board];
                    renderBoard(); myChannel.send({ type: 'broadcast', event: 'sowing_end' });
                    await delay(500); 
                }
            }
        } else { await delay(500); seeds = board[currentIndex]; board[currentIndex] = 0; }
    }

    let isGameOver = false, winner = null;
    if (checkGameOver(board)) {
        for (let i = 0; i < 7; i++) { board[7] += board[i]; board[i] = 0; }
        for (let i = 8; i < 15; i++) { board[15] += board[i]; board[i] = 0; }
        isGameOver = true;
        winner = board[7] > board[15] ? "1" : (board[15] > board[7] ? "2" : "SERI");
    }

    isAnimating = false; window.activeHole = null;
    myChannel.send({ type: 'broadcast', event: 'sowing_end' });
    await db.from('rooms').update({ board: board, current_player: nextPlayer, game_over: isGameOver, winner: winner }).eq('id', myRoom);
}
