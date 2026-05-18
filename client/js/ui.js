function updateTimerDisplay() {
    if (isTutorialMode) return; 
    const mins = Math.floor(matchSeconds / 60).toString().padStart(2, '0'), secs = (matchSeconds % 60).toString().padStart(2, '0');
    const timerEl = document.getElementById('game-timer'); if(timerEl) timerEl.innerText = `⏱️ ${mins}:${secs}`;
}
function startTimer() {
    if (isTutorialMode) return;
    const timerEl = document.getElementById('game-timer'); if(timerEl) timerEl.classList.remove('hidden');
    if (!matchTimer) { matchTimer = setInterval(() => { if (!gameState.game_over) { matchSeconds++; updateTimerDisplay(); } }, 1000); }
}
function resetTimerLocally() {
    clearInterval(matchTimer); matchTimer = null; matchSeconds = 0; updateTimerDisplay();
    const timerEl = document.getElementById('game-timer'); if(timerEl) timerEl.classList.add('hidden');
}
function toggleTutorial() {
    const content = document.getElementById('tutorial-content'), arrow = document.getElementById('tutorial-arrow');
    if (content && arrow) {
        if (content.classList.contains('hidden')) { content.classList.remove('hidden'); arrow.style.transform = 'rotate(180deg)'; }
        else { content.classList.add('hidden'); arrow.style.transform = 'rotate(0deg)'; }
    }
}
function renderSeeds(count) {
    const maxVisual = 15; const displayCount = Math.min(count, maxVisual); let html = '';
    for (let i = 0; i < displayCount; i++) html += `<div class="w-2 h-2 rounded-full bg-amber-800 shadow-sm"></div>`;
    if (count > maxVisual) html += `<div class="text-[10px] font-bold text-amber-900 leading-none">+</div>`; return html;
}
function createHoleHTML(index, count) {
    let canClick = false;
    if (isTutorialMode) {
        canClick = count > 0 && !gameState.game_over && !isAnimating && ((gameState.current_player===1 && index>=0 && index<=6) || (gameState.current_player===2 && index>=8 && index<=14));
    } else {
        canClick = gameState.current_player === myRole && ((myRole===1 && index>=0 && index<=6) || (myRole===2 && index>=8 && index<=14)) && count > 0 && !gameState.game_over && !isAnimating && gameStarted;
    }
    const actCls = (index === activeHole) ? 'active-hole' : 'border-[3px] border-amber-900/10 hover:bg-amber-200';
    return `<button onclick="clickHole(${index})" ${!canClick ? 'disabled' : ''} class="relative overflow-hidden w-12 h-12 md:w-16 md:h-16 bg-amber-100 disabled:opacity-90 disabled:cursor-not-allowed rounded-full flex flex-col items-center justify-end pb-1 shadow-[inset_0_3px_6px_rgba(0,0,0,0.4)] active:scale-90 transition-all shrink-0 ${actCls}"><div class="absolute top-1 md:top-2 left-0 w-full px-2 flex flex-wrap justify-center gap-[2px] pointer-events-none">${renderSeeds(count)}</div><span class="z-10 bg-white/50 px-1.5 py-[1px] rounded text-xs font-black text-amber-950 shadow-sm">${count}</span></button>`;
}
function renderGameHoles() {
    const topC = document.getElementById('holes-top'), botC = document.getElementById('holes-bottom'); if(!topC || !botC) return;
    topC.innerHTML = ''; botC.innerHTML = '';
    let bIdx, tIdx, lsIdx, rsIdx, lName, rName;
    if (myRole === 1 || myRole === null || isTutorialMode) { bIdx = [6,5,4,3,2,1,0]; tIdx = [8,9,10,11,12,13,14]; lsIdx = 7; rsIdx = 15; lName = gameState.p1_name || "Player 1"; rName = gameState.p2_name || "Player 2"; } 
    else { bIdx = [14,13,12,11,10,9,8]; tIdx = [0,1,2,3,4,5,6]; lsIdx = 15; rsIdx = 7; lName = gameState.p2_name || "Player 2"; rName = gameState.p1_name || "Player 1"; }
    document.getElementById('store-left-name').innerText = `RUMAH: ${lName}`; document.getElementById('store-right-name').innerText = `RUMAH: ${rName}`;
    document.getElementById('store-left-text').innerText = gameState.board[lsIdx]; document.getElementById('store-left-seeds').innerHTML = renderSeeds(gameState.board[lsIdx]);
    document.getElementById('store-right-text').innerText = gameState.board[rsIdx]; document.getElementById('store-right-seeds').innerHTML = renderSeeds(gameState.board[rsIdx]);
    bIdx.forEach(idx => botC.innerHTML += createHoleHTML(idx, gameState.board[idx])); tIdx.forEach(idx => topC.innerHTML += createHoleHTML(idx, gameState.board[idx]));
}
function renderBoard() {
    if (isTutorialMode) { document.getElementById('status-panel').innerText = (gameState.current_player === 1) ? "Latihan: Pemain Bawah" : "Latihan: Pemain Atas"; renderGameHoles(); return; }
    const pregamePanel = document.getElementById('pregame-panel'), mainBoard = document.getElementById('main-board-container'), statusText = document.getElementById('status-panel'), actionBtns = document.getElementById('action-buttons');
    if(document.getElementById('role-indicator')) document.getElementById('role-indicator').innerText = `ANDA PLAYER ${myRole}`;
    
    if (gameState.p1_suit && gameState.p2_suit && !gameStarted) {
        document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-ready-section').classList.add('hidden');
        document.getElementById('pregame-suit-result').classList.remove('hidden'); if(actionBtns) actionBtns.classList.add('hidden');
        const icons = { batu: '✊', kertas: '✋', gunting: '✌️' }; let winText = "Menghitung...", c = "text-amber-600";
        if (gameState.suit_winner) { if (gameState.suit_winner === 'SERI') { winText = "SERI! Mengulang..."; c = "text-blue-600"; } else if (gameState.suit_winner === myRole.toString()) { winText = "ANDA MENANG! Jalan pertama."; c = "text-emerald-600"; } else { winText = "LAWAN MENANG."; c = "text-rose-600"; } }
        document.getElementById('pregame-suit-result').innerHTML = `<div class="flex gap-8 text-4xl mb-4 text-center"><div><div class="text-xs mb-2">${gameState.p1_name}</div>${icons[gameState.p1_suit]}</div><div class="text-2xl font-black text-amber-400">VS</div><div><div class="text-xs mb-2">${gameState.p2_name}</div>${icons[gameState.p2_suit]}</div></div><div class="text-xl font-black ${c}">${winText}</div>`;
        if (gameState.suit_winner && !suitResultTimer) {
            suitResultTimer = setTimeout(async () => { suitResultTimer = null; document.getElementById('pregame-suit-result').classList.add('hidden'); 
                if (gameState.suit_winner === 'SERI') { if (myRole === 1) await db.from('rooms').update({ p1_suit: null, p2_suit: null, suit_winner: null }).eq('id', myRoom); } else { gameStarted = true; renderBoard(); }
            }, 3500);
        }
        if(statusText) { statusText.innerText = "Fase Penentuan"; statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
        return; 
    }
    if (gameState.suit_winner && gameState.suit_winner !== 'SERI' && gameStarted) {
        pregamePanel.classList.add('hidden'); mainBoard.classList.remove('hidden'); if(actionBtns) actionBtns.classList.remove('hidden'); renderGameHoles();
        if (gameState.game_over) {
            clearInterval(matchTimer); document.getElementById('btn-surrender').classList.add('hidden'); document.getElementById('btn-reset').classList.remove('hidden');
            if (gameState.winner === "SERI") { statusText.innerText = "HASIL SERI!"; document.getElementById('btn-ss').classList.add('hidden'); } 
            else if (parseInt(gameState.winner) === myRole) { statusText.innerText = "ANDA MENANG! 🎉"; document.getElementById('btn-ss').classList.remove('hidden'); if (!confettiFired) { confettiFired = true; if(typeof confetti !== 'undefined') confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } }); } } 
            else { statusText.innerText = `${gameState.winner==="1"?gameState.p1_name:gameState.p2_name} Menang.`; document.getElementById('btn-ss').classList.add('hidden'); }
            statusText.className = "text-lg md:text-xl font-bold text-rose-900 bg-rose-100 px-6 py-2 rounded-full shadow-sm";
        } else {
            document.getElementById('btn-surrender').classList.remove('hidden'); document.getElementById('btn-reset').classList.add('hidden'); document.getElementById('btn-ss').classList.add('hidden');
            if (isAnimating) { statusText.innerText = "Membagikan biji..."; statusText.className = "text-lg md:text-xl font-bold text-blue-900 bg-blue-100 px-6 py-2 rounded-full shadow-sm animate-pulse"; } 
            else if (gameState.current_player === myRole) { statusText.innerText = "Giliran Anda."; statusText.className = "text-lg md:text-xl font-bold text-emerald-900 bg-emerald-100 px-6 py-2 rounded-full shadow-sm"; } 
            else { statusText.innerText = `Menunggu ${gameState.current_player===1?gameState.p1_name:gameState.p2_name}...`; statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
        }
    } else {
        mainBoard.classList.add('hidden'); pregamePanel.classList.remove('hidden'); if(actionBtns) actionBtns.classList.add('hidden');
        if (!gameState.p1_ready || !gameState.p2_ready) {
             document.getElementById('pregame-suit-countdown').classList.add('hidden'); document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-suit-result').classList.add('hidden'); document.getElementById('pregame-ready-section').classList.remove('hidden');
             const btn = document.getElementById('pregame-ready-btn');
             if (gameState[`p${myRole}_ready`]) { if(btn) { btn.innerText = "Menunggu Lawan Siap..."; btn.disabled = true; btn.classList.remove('hidden'); } } else { if(btn) { btn.innerText = "Siap Bermain"; btn.disabled = false; btn.classList.remove('hidden'); } }
        } else {
             document.getElementById('pregame-ready-section').classList.add('hidden');
             if (gameState[`p${myRole}_suit`]) { document.getElementById('pregame-suit-choices').classList.add('hidden'); document.getElementById('pregame-suit-countdown').classList.remove('hidden'); document.getElementById('pregame-suit-countdown').innerHTML = `<div class="text-xl font-bold text-amber-600">Menunggu Lawan Memilih...</div>`; }
        }
        if(statusText) { statusText.innerText = "Persiapan Permainan"; statusText.className = "text-lg md:text-xl font-bold text-amber-900 bg-amber-100 px-6 py-2 rounded-full shadow-sm"; }
    }
}
function takeScreenshotAndShare() {
    const btn = document.getElementById('btn-ss'), area = document.getElementById('capture-area'); if(!btn || !area) return; btn.innerText = "Memproses...";
    html2canvas(area, { backgroundColor: '#fef3c7', scale: 2 }).then(canvas => {
        canvas.toBlob(blob => {
            const file = new File([blob], 'HasilCongklak.jpg', { type: 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'Hasil Congklak', text: `Main di sini: ${window.location.href.split('?')[0]}?room=${myRoom}` }).catch(console.error); } 
            else { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'HasilCongklak.jpg'; a.click(); alert("Tersimpan."); }
            btn.innerHTML = `📸 Pamer WA`;
        }, 'image/jpeg', 0.9);
    });
}
