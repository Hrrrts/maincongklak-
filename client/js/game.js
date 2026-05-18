const delay = ms => new Promise(r => setTimeout(r, ms));
function checkGameOver(b) { let p1=true, p2=true; for(let i=0;i<7;i++) if(b[i]>0) p1=false; for(let i=8;i<15;i++) if(b[i]>0) p2=false; return p1||p2; }

async function clickHole(holeIndex) {
    if (!gameStarted && !isTutorialMode) return; 
    isAnimating = true; let board = [...gameState.board], p = gameState.current_player, seeds = board[holeIndex]; board[holeIndex] = 0; 
    let currentIndex = holeIndex, isSowing = true, nextPlayer = p;
    if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();

    while (isSowing) {
        gameState.board = [...board]; renderBoard(); await delay(300); 
        while (seeds > 0) {
            currentIndex = (currentIndex + 1) % 16;
            if (p === 1 && currentIndex === 15) continue; if (p === 2 && currentIndex === 7) continue;
            board[currentIndex]++; seeds--; activeHole = currentIndex; gameState.board = [...board]; renderBoard(); playDropSound(); triggerVibrate();
            if (!isTutorialMode && myChannel) myChannel.send({ type: 'broadcast', event: 'sowing', payload: { board: board, index: currentIndex } });
            await delay(450); 
        }
        if ((p === 1 && currentIndex === 7) || (p === 2 && currentIndex === 15)) { isSowing = false; nextPlayer = p;
        } else if (board[currentIndex] === 1) {
            isSowing = false; nextPlayer = p === 1 ? 2 : 1; 
            if ((p === 1 && currentIndex >= 0 && currentIndex <= 6) || (p === 2 && currentIndex >= 8 && currentIndex <= 14)) {
                const op = 14 - currentIndex;
                if (board[op] > 0) {
                    await delay(600); let rk = (p === 1) ? 7 : 15; board[rk] += board[op] + 1; board[op] = 0; board[currentIndex] = 0;
                    activeHole = null; gameState.board = [...board]; renderBoard(); 
                    if (!isTutorialMode && myChannel) myChannel.send({ type: 'broadcast', event: 'sowing_end' }); await delay(500); 
                }
            }
        } else { await delay(500); seeds = board[currentIndex]; board[currentIndex] = 0; }
    }
    let isGameOver = false, winner = null;
    if (checkGameOver(board)) { for (let i=0;i<7;i++) { board[7]+=board[i]; board[i]=0; } for (let i=8;i<15;i++) { board[15]+=board[i]; board[i]=0; } isGameOver = true; winner = board[7]>board[15]?"1":(board[15]>board[7]?"2":"SERI"); }
    isAnimating = false; activeHole = null;
    if (isTutorialMode) { gameState.current_player = nextPlayer; gameState.game_over = isGameOver; gameState.winner = winner; renderBoard(); if (isGameOver) document.getElementById('status-panel').innerText = "Latihan Selesai!";
    } else { if (myChannel) myChannel.send({ type: 'broadcast', event: 'sowing_end' }); await db.from('rooms').update({ board: board, current_player: nextPlayer, game_over: isGameOver, winner: winner }).eq('id', myRoom); }
}
function startTutorial() {
    isTutorialMode = true; gameStarted = true; myRole = 1; 
    gameState = { board: [7,7,7,7,7,7,7,0,7,7,7,7,7,7,7,0], current_player: 1, game_over: false, winner: null, p1_name: "Anda (Bawah)", p2_name: "Lawan Latihan" };
    document.getElementById('include-lobby').classList.add('hidden'); document.getElementById('include-board').classList.remove('hidden'); document.getElementById('pregame-panel').classList.add('hidden'); document.getElementById('main-board-container').classList.remove('hidden'); document.getElementById('include-chat').classList.add('hidden'); document.getElementById('action-buttons').classList.remove('hidden'); document.getElementById('btn-exit-tutorial').classList.remove('hidden'); document.getElementById('btn-surrender').classList.add('hidden'); document.getElementById('status-panel').innerText = "Mode Latihan"; document.getElementById('role-indicator').innerText = "BEBAS MAIN"; renderBoard();
}
function exitTutorial() {
    if(!confirm("Keluar dari Latihan?")) return;
    isTutorialMode = false; gameStarted = false;
    document.getElementById('include-lobby').classList.remove('hidden'); document.getElementById('include-board').classList.add('hidden'); document.getElementById('include-chat').classList.add('hidden'); document.getElementById('btn-exit-tutorial').classList.add('hidden');
}
async function surrenderGame() { if(confirm("Yakin menyerah?")) await db.from('rooms').update({ game_over: true, winner: myRole === 1 ? "2" : "1" }).eq('id', myRoom); }
async function resetGame() { if(confirm("Mulai ulang?")) { await db.from('rooms').update({ board: [7,7,7,7,7,7,7,0,7,7,7,7,7,7,7,0], current_player: 1, game_over: false, winner: null, p1_ready: false, p2_ready: false, p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); gameStarted = false; confettiFired = false; resetTimerLocally(); } }
async function clickReady() { const bgm = document.getElementById('bgm'); if(bgm){bgm.volume = 0.2; bgm.play().catch(e=>{});} const btn = document.getElementById('pregame-ready-btn'); if(btn){btn.classList.add('hidden'); btn.disabled = true;} await db.from('rooms').update({ [`p${myRole}_ready`]: true }).eq('id', myRoom); }
function startPregameCountdown() {
    isAnimating = true; document.getElementById('pregame-ready-section').classList.add('hidden'); document.getElementById('pregame-suit-result').classList.add('hidden'); document.getElementById('pregame-suit-countdown').classList.remove('hidden'); document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-[10px] uppercase font-bold text-amber-600 tracking-wider mb-2">Mulai Memilih Dalam...</div><div id="pregame-suit-seconds" class="text-7xl font-black drop-shadow-sm">5</div>`; let secs = 5;
    pregameCountdownInterval = setInterval(() => { secs--; const c = document.getElementById('pregame-suit-seconds'); if (c) c.innerText = secs; if (secs <= 0) { clearInterval(pregameCountdownInterval); pregameCountdownInterval = null; document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.remove('hidden'); isAnimating = false; } }, 1000);
}
async function clickSuit(choice) { document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-suit-countdown').classList.remove('hidden'); document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan...</div>`; await db.from('rooms').update({ [`p${myRole}_suit`]: choice }).eq('id', myRoom); }
async function calculateSuitWinner() {
    if (myRole !== 1) return; const p1 = gameState.p1_suit, p2 = gameState.p2_suit; if (!p1 || !p2) return; let w = "SERI";
    if ((p1==='batu'&&p2==='gunting')||(p1==='gunting'&&p2==='kertas')||(p1==='kertas'&&p2==='batu')) w = "1"; else if (p1!==p2) w = "2"; 
    await db.from('rooms').update({ suit_winner: w, current_player: w !== "SERI" ? parseInt(w) : gameState.current_player }).eq('id', myRoom);
}
function checkGamePhase() {
    if (isAnimating || isTutorialMode) return;
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && gameStarted) { startTimer(); renderBoard(); return; }
    if (gameState.p1_suit && gameState.p2_suit && !gameState.suit_winner && myRole === 1) calculateSuitWinner();
    if (gameState.p1_ready && gameState.p2_ready && !gameState.p1_suit && !gameState.p2_suit && !gameState.suit_winner) { const c = document.getElementById('pregame-suit-choices'); if (!pregameCountdownInterval && c && c.classList.contains('hidden')) startPregameCountdown(); }
    renderBoard();
}
