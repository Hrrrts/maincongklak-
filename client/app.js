async function loadComponents() {
    try {
        const [lobbyRes, boardRes, chatRes] = await Promise.all([
            fetch('components/lobby.html'), fetch('components/board.html'), fetch('components/chat.html')
        ]);
        document.getElementById('include-lobby').innerHTML = await lobbyRes.text();
        document.getElementById('include-board').innerHTML = await boardRes.text();
        document.getElementById('include-chat').innerHTML = await chatRes.text();
        initAppLobby();
    } catch(e) { console.error("Gagal load komponen HTML", e); }
}
document.addEventListener('DOMContentLoaded', loadComponents);

function initAppLobby() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    let savedName = ""; try { savedName = localStorage.getItem('congklak_player_name') || ""; } catch(e){}
    if (savedName) { const ni = document.getElementById('name-input'); if(ni) ni.value = savedName; }
    const ri = document.getElementById('room-input');
    if (roomFromUrl) {
        if(ri) ri.value = roomFromUrl.toUpperCase();
        if (savedName) { const btn = document.getElementById("btn-join"); if (btn) btn.innerText = "Auto-Join..."; setTimeout(joinRoom, 800); }
    } else { if(ri) ri.value = Math.random().toString(36).substring(2, 6).toUpperCase(); }
}

async function joinRoom() {
    if (!db) return alert("Database gagal.");
    try {
        const ri = document.getElementById('room-input'), ni = document.getElementById('name-input');
        if(!ri || !ni) return; const roomVal = ri.value.trim().toUpperCase(), nameVal = ni.value.trim();
        if (!roomVal || !nameVal) return alert("Lengkapi data!");
        
        initAudio(); const bgm = document.getElementById('bgm'); if(bgm){bgm.volume=0.2; bgm.play().catch(e=>console.log(e));}
        const lobbyBtn = document.getElementById("btn-join"); if(lobbyBtn) lobbyBtn.innerText = "Memuat...";
        myRoom = roomVal; myName = nameVal; try{localStorage.setItem('congklak_player_name', myName);}catch(e){}
        window.history.replaceState({}, '', `?room=${myRoom}`);

        let { data: room, error: fetchError } = await db.from('rooms').select('*').eq('id', myRoom).single();
        const initialBoard = [7,7,7,7,7,7,7, 0, 7,7,7,7,7,7,7, 0];

        if (!room) { myRole = 1; await db.from('rooms').insert([{ id: myRoom, board: initialBoard, current_player: 1, p1_id: myClientId, p1_name: myName, p2_id: null, p2_name: "" }]);
        } else {
            if (room.p1_id === myClientId) { myRole = 1; if (room.p1_name !== myName) await db.from('rooms').update({p1_name: myName}).eq('id', myRoom); } 
            else if (room.p2_id === myClientId) { myRole = 2; if (room.p2_name !== myName) await db.from('rooms').update({p2_name: myName}).eq('id', myRoom); } 
            else if (!room.p2_id) { myRole = 2; await db.from('rooms').update({ p2_id: myClientId, p2_name: myName, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); } 
            else { if(lobbyBtn) lobbyBtn.innerText = "Masuk Ruangan"; return alert("Penuh."); }
        }

        const roomIdEl = document.getElementById('chat-room-id'), lobbyEl = document.getElementById('include-lobby'), boardEl = document.getElementById('include-board'), chatEl = document.getElementById('include-chat');
        if(roomIdEl) roomIdEl.innerText = `KODE: ${myRoom}`;
        if(lobbyEl) lobbyEl.classList.add('hidden');
        if(boardEl) boardEl.classList.remove('hidden');
        if(chatEl) chatEl.classList.remove('hidden');

        let { data: currentRoom } = await db.from('rooms').select('*').eq('id', myRoom).single();
        if (currentRoom) { gameState = currentRoom; if (gameState.suit_winner && gameState.suit_winner !== 'SERI') gameStarted = true; checkGamePhase(); }

        if (myChannel) db.removeChannel(myChannel);
        myChannel = db.channel('room_' + myRoom);
        myChannel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${myRoom}` }, (p) => { if (!isAnimating) { gameState = p.new; checkGamePhase(); } })
        .on('broadcast', { event: 'chat' }, (p) => appendChatMessage(p.payload.senderName, p.payload.text, false))
        .on('broadcast', { event: 'taunt' }, (p) => showFloatingTaunt(p.payload.emoji, false))
        .on('broadcast', { event: 'sowing' }, (p) => { gameState.board = p.payload.board; activeHole = p.payload.index; playDropSound(); triggerVibrate(); renderBoard(); })
        .on('broadcast', { event: 'sowing_end' }, () => { activeHole = null; renderBoard(); }).subscribe();
    } catch(err) { alert(err.message); }
}
