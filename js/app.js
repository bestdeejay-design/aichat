/* ═══════════════════════════════════════════
   AI Chat — Multi-provider chat client
   ═══════════════════════════════════════════ */

/* ─── STATE ─── */
let settings = { provider: '', url: '', key: '', systemPrompt: '' };
let models = [];
let currentModel = '';
let messages = [];
let isStreaming = false;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ─── INIT ─── */
function init() {
  loadSettings();
  if (settings.key) {
    connect();
  }
}

/* ─── SETTINGS ─── */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('aichat_settings'));
    if (s) settings = s;
  } catch(e) {}
  $('providerName').value = settings.provider || '';
  $('apiUrl').value = settings.url || '';
  $('apiKey').value = settings.key || '';
  $('systemPrompt').value = settings.systemPrompt || '';
}

function saveSettings() {
  settings.provider = $('providerName').value.trim();
  settings.url = $('apiUrl').value.trim().replace(/\/+$/, '');
  settings.key = $('apiKey').value.trim();
  settings.systemPrompt = $('systemPrompt').value.trim();
  localStorage.setItem('aichat_settings', JSON.stringify(settings));
  connect();
  toggleSettings();
}

function toggleSettings() {
  const o = $('settingsOverlay');
  o.style.display = o.style.display === 'none' ? 'flex' : 'none';
  if (o.style.display === 'flex') loadSettings();
}

function toggleKeyVis() {
  const k = $('apiKey');
  k.type = k.type === 'password' ? 'text' : 'password';
}

/* ─── CONNECT ─── */
async function connect() {
  if (!settings.url || !settings.key) return;
  $('providerBadge').textContent = 'Подключение...';
  await refreshModels();
  if (models.length) {
    $('providerBadge').textContent = settings.provider || 'Подключено';
    showChat();
  }
}

async function refreshModels() {
  if (!settings.url || !settings.key) return;
  try {
    const url = settings.url.replace(/\/+$/, '') + '/models';
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${settings.key}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    models = (data.data || data).filter(m => m.id).map(m => ({ id: m.id }));
    if (!models.length) throw new Error('Нет моделей');

    // Cache
    localStorage.setItem('aichat_models', JSON.stringify({ models, ts: Date.now(), url: settings.url }));

    renderModelSelect();

    // Auto-select first or previous
    if (currentModel && models.find(m => m.id === currentModel)) {
      $('modelSelect').value = currentModel;
    } else {
      currentModel = models[0].id;
      $('modelSelect').value = currentModel;
    }

    showToast(`Загружено ${models.length} моделей`, 'success');
    return true;
  } catch (e) {
    // Try cache
    try {
      const cached = JSON.parse(localStorage.getItem('aichat_models'));
      if (cached && cached.url === settings.url && cached.models.length) {
        models = cached.models;
        renderModelSelect();
        currentModel = models[0].id;
        $('modelSelect').value = currentModel;
        showToast('Использован кэш моделей', 'success');
        return true;
      }
    } catch(e2) {}
    showToast('Ошибка подключения: ' + e.message, 'error');
    return false;
  }
}

function renderModelSelect() {
  const sel = $('modelSelect');
  sel.innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');
}

function switchModel(id) {
  currentModel = id;
}

/* ─── CHAT UI ─── */
function showChat() {
  $('welcomeScreen').style.display = 'none';
  $('chatLayout').style.display = 'flex';
  loadMessages();
}

function showWelcome() {
  $('welcomeScreen').style.display = 'flex';
  $('chatLayout').style.display = 'none';
  $('providerBadge').textContent = 'не подключено';
}

function clearChat() {
  if (!messages.length) return;
  if (!confirm('Очистить историю сообщений?')) return;
  messages = [];
  saveMessages();
  renderMessages();
}

/* ─── MESSAGES ─── */
function loadMessages() {
  try {
    const saved = JSON.parse(localStorage.getItem('aichat_messages'));
    if (saved && saved.length) messages = saved;
  } catch(e) {}
  renderMessages();
}

function saveMessages() {
  try { localStorage.setItem('aichat_messages', JSON.stringify(messages.slice(-100))); } catch(e) {}
}

function renderMessages() {
  const container = $('chatMessages');
  container.innerHTML = messages.map((m, i) => renderMessage(m, i)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMessage(m, i) {
  const role = m.role === 'user' ? 'user' : 'ai';
  const avatar = role === 'user' ? '👤' : '🤖';
  const extra = m.error ? ' error' : '';
  return `<div class="message ${role}${extra}">
    <div class="avatar">${avatar}</div>
    <div class="bubble">${esc(m.content)}</div>
  </div>`;
}

function addMessage(role, content) {
  messages.push({ role, content });
  saveMessages();
  renderMessages();
}

/* ─── SEND ─── */
async function sendMessage() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || isStreaming) return;

  // Check connection
  if (!settings.key) {
    toggleSettings();
    return;
  }

  input.value = '';
  autoResize(input);
  addMessage('user', text);

  // Build request
  const msgs = [];
  if (settings.systemPrompt) msgs.push({ role: 'system', content: settings.systemPrompt });
  messages.forEach(m => msgs.push({ role: m.role, content: m.content }));

  const body = {
    model: currentModel,
    messages: msgs,
    stream: true
  };

  // Show typing indicator
  showTyping();

  try {
    const url = settings.url.replace(/\/+$/, '') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.key}`
      },
      body: JSON.stringify(body)
    });

    hideTyping();

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      addMessage('ai', `Ошибка ${res.status}: ${err || res.statusText}`);
      return;
    }

    // Read stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let content = '';

    // Add placeholder
    messages.push({ role: 'assistant', content: '' });
    const msgIdx = messages.length - 1;
    saveMessages();
    renderMessages();

    // Remove last "thinking" bubble to replace with real content
    // Actually we just update it

    const updateContent = () => {
      const container = $('chatMessages');
      const bubbles = container.querySelectorAll('.message.ai .bubble');
      if (bubbles.length) {
        bubbles[bubbles.length - 1].textContent = content;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        const json = line.slice(6).trim();
        if (json === '[DONE]') continue;
        try {
          const data = JSON.parse(json);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
            messages[msgIdx].content = content;
            updateContent();
            const container = $('chatMessages');
            container.scrollTop = container.scrollHeight;
          }
        } catch(e) {}
      }
    }

    saveMessages();
    updateContent();
  } catch (e) {
    hideTyping();
    addMessage('ai', `Ошибка: ${e.message}`);
  }
}

/* ─── TYPING ─── */
function showTyping() {
  isStreaming = true;
  $('sendBtn').disabled = true;
  const container = $('chatMessages');
  container.innerHTML += `<div class="message ai typing" id="typingIndicator">
    <div class="avatar">🤖</div>
    <div class="bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  </div>`;
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  isStreaming = false;
  $('sendBtn').disabled = false;
  const el = $('typingIndicator');
  if (el) el.remove();
}

/* ─── INPUT ─── */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

/* ─── TOAST ─── */
function showToast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', init);
