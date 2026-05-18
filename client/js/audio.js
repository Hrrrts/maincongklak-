let audioCtx = null;

export function initAudio() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch(e) { console.error("Audio diblokir browser"); }
}

export function playDropSound() {
    initAudio();
    if(!audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } catch(e){}
}

export function changeBGM() {
    initAudio();
    const bgm = document.getElementById('bgm');
    const select = document.getElementById('bgm-select');
    if(bgm && select) {
        bgm.pause();
        bgm.src = select.value;
        bgm.load(); // Paksa browser load ulang file yang baru
        bgm.play().catch(e => console.log("BGM dicegah autoplay"));
    }
}
