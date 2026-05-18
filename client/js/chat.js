function insertEmote(emoji) { const input = document.getElementById('chat-input'); if(input) input.value += emoji; }
function sendChat() {
    const input = document.getElementById('chat-input'); if(!input) return;
    const text = input.value.trim(); if (!text) return;
    appendChatMessage("Anda", text, true);
    if(myChannel) myChannel.send({ type: 'broadcast', event: 'chat', payload: { senderName: myName, text: text } });
    input.value = '';
}
function appendChatMessage(displayName, text, isMe) {
    const container = document.getElementById('chat-messages'); if(!container) return;
    const msgDiv = document.createElement('div');
    const alignClass = isMe ? 'self-end bg-amber-500 text-white rounded-tl-xl rounded-tr-xl rounded-bl-xl' : 'self-start bg-white border border-amber-200 text-amber-900 rounded-tl-xl rounded-tr-xl rounded-br-xl shadow-sm';
    msgDiv.className = `max-w-[80%] px-4 py-2 text-sm ${alignClass}`;
    msgDiv.innerHTML = `<div class="text-[10px] font-bold ${isMe?'text-amber-100':'text-amber-500'} mb-0.5 uppercase tracking-wide">${displayName}</div><div>${text}</div>`;
    container.appendChild(msgDiv); container.scrollTop = container.scrollHeight;
}
function sendTaunt(emoji) {
    showFloatingTaunt(emoji, true);
    if(myChannel) myChannel.send({ type: 'broadcast', event: 'taunt', payload: { emoji: emoji } });
}
function showFloatingTaunt(emoji, isMe) {
    const container = document.getElementById('taunt-container'); if(!container) return;
    const el = document.createElement('div'); el.className = 'float-taunt'; el.innerText = emoji;
    el.style.left = isMe ? `${20 + Math.random()*10}%` : `${60 + Math.random()*10}%`;
    container.appendChild(el); setTimeout(() => el.remove(), 2000);
}
function shareWhatsApp() {
    const appUrl = window.location.href.split('?')[0];
    let msg = `Ayo main Congklak Online!

Klik tautan ini untuk masuk:
${appUrl}?room=${myRoom}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}
