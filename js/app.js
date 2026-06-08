/* ═══════════════════════════════════════════
   AI Chat — Multi-provider chat client
   ═══════════════════════════════════════════ */

const PROVIDERS = {
  github:   { name:'GitHub Models',  url:'https://models.inference.ai.azure.com', key:'' },
  deepseek: { name:'DeepSeek',       url:'https://api.deepseek.com',              key:'' },
  openrouter:{ name:'OpenRouter',    url:'https://openrouter.ai/api/v1',          key:'' },
  openai:   { name:'OpenAI',         url:'https://api.openai.com/v1',             key:'' },
  groq:     { name:'Groq',           url:'https://api.groq.com/openai/v1',        key:'' }
};

let settings = { provider:'', url:'', key:'', systemPrompt:'', temperature:0.7, maxTokens:4096 };
let models = [];
let currentModel = '';
let messages = [];
let streaming = false;
let abortController = null;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  if (settings.key) connect();
});

/* ─── SETTINGS ─── */
function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem('aichat_settings')); if (s) settings = s; } catch(e) {}
  $('providerName').value = settings.provider || '';
  $('apiUrl').value = settings.url || '';
  $('apiKey').value = settings.key || '';
  $('systemPrompt').value = settings.systemPrompt || '';
  $('temperature').value = settings.temperature ?? 0.7;
  $('maxTokens').value = settings.maxTokens ?? 4096;
}

function saveSettings() {
  settings.provider = $('providerName').value.trim();
  settings.url = $('apiUrl').value.trim().replace(/\/+$/,'');
  settings.key = $('apiKey').value.trim();
  settings.systemPrompt = $('systemPrompt').value.trim();
  settings.temperature = parseFloat($('temperature').value) || 0.7;
  settings.maxTokens = parseInt($('maxTokens').value) || 4096;
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

function applyPreset() {
  const val = $('presetSelect').value;
  if (!val || val === 'custom') return;
  const p = PROVIDERS[val];
  if (!p) return;
  $('providerName').value = p.name;
  $('apiUrl').value = p.url;
  if (p.key) $('apiKey').value = p.key;
}

function quickConnect(id) {
  const p = PROVIDERS[id];
  if (!p) return;
  $('providerName').value = p.name;
  $('apiUrl').value = p.url;
  toggleSettings();
}

/* ─── CONNECT ─── */
async function connect() {
  if (!settings.url || !settings.key) return;
  setPill('Подключение…');
  const ok = await refreshModels();
  if (ok) {
    setPill(settings.provider || 'Подключено');
    showChat();
  } else {
    setPill('Ошибка');
  }
}

function setPill(text) { $('providerPill').textContent = text; }

async function refreshModels() {
  if (!settings.url || !settings.key) return false;
  try {
    const url = settings.url.replace(/\/+$/,'') + '/models';
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${settings.key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    models = (data.data || data).filter(m => m.id).map(m => ({ id: m.id }));
    if (!models.length) throw new Error('Нет моделей');
    localStorage.setItem('aichat_models', JSON.stringify({ models, ts: Date.now(), url: settings.url }));
    renderModelSelect();
    if (currentModel && models.find(m => m.id === currentModel)) {
      $('modelSelect').value = currentModel;
    } else {
      currentModel = models[0].id;
      $('modelSelect').value = currentModel;
    }
    toast(`Загружено ${models.length} моделей`, 'success');
    return true;
  } catch (e) {
    const cached = loadCachedModels();
    if (cached) {
      models = cached.models;
      renderModelSelect();
      currentModel = models[0].id;
      $('modelSelect').value = currentModel;
      toast('Использован кэш', 'success');
      return true;
    }
    toast('Ошибка: ' + e.message, 'error');
    return false;
  }
}

function loadCachedModels() {
  try {
    const c = JSON.parse(localStorage.getItem('aichat_models'));
    if (c && c.url === settings.url && c.models.length) return c;
  } catch(e) {}
  return null;
}

function renderModelSelect() {
  const sel = $('modelSelect');
  sel.innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');
}

function switchModel(id) { currentModel = id; }

/* ─── CHAT UI ─── */
function showChat() {
  $('welcomeScreen').style.display = 'none';
  $('chatLayout').style.display = 'flex';
  loadMessages();
}

function showWelcome() {
  $('welcomeScreen').style.display = 'flex';
  $('chatLayout').style.display = 'none';
  setPill('—');
}

function clearChat() {
  if (!messages.length) return;
  if (!confirm('Очистить все сообщения?')) return;
  messages = [];
  saveMessages();
  renderMessages();
}

/* ─── MESSAGES ─── */
function loadMessages() {
  try { const s = JSON.parse(localStorage.getItem('aichat_messages')); if (s && s.length) messages = s; } catch(e) {}
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
  const content = esc(m.content || '');
  const html = formatContent(content);
  let retryBtn = '';
  if (m.error) retryBtn = `<button class="retry-btn" onclick="retryMessage(${i})">Повторить →</button>`;
  return `<div class="msg ${role}${extra}${m.streaming ? ' streaming' : ''}">
    <div class="avatar">${avatar}</div>
    <div class="bubble">${html}${retryBtn}</div>
  </div>`;
}

function formatContent(text) {
  if (!text) return '';
  // Code blocks
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langAttr = lang ? ` data-lang="${esc(lang)}"` : '';
    return `<pre${langAttr}><button class="copy-btn" onclick="copyText(this.nextSibling.textContent)">⎘</button><code>${esc(code.trimEnd())}</code></pre>`;
  });
  // Inline code
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  text = text.replace(/\*\*(\S[^*]*\S|\S)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(\S[^*]*\S|\S)\*/g, '<em>$1</em>');
  // Paragraphs
  text = text.replace(/\n\n/g, '</p><p>');
  text = '<p>' + text + '</p>';
  return text;
}

/* ─── SEND ─── */
async function sendMessage() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || streaming) return;

  if (!settings.key) { toggleSettings(); return; }

  input.value = '';
  autoResize(input);

  // Add user message
  messages.push({ role: 'user', content: text });
  saveMessages();
  renderMessages();

  // Build request
  const msgs = [];
  if (settings.systemPrompt) msgs.push({ role: 'system', content: settings.systemPrompt });
  messages.forEach(m => msgs.push({ role: m.role, content: m.content }));

  const body = {
    model: currentModel,
    messages: msgs,
    stream: true,
    temperature: settings.temperature ?? 0.7,
    max_tokens: settings.maxTokens ?? 4096
  };

  abortController = new AbortController();
  streaming = true;
  showStopBtn();

  // Add placeholder for AI response
  messages.push({ role: 'assistant', content: '', streaming: true });
  const msgIdx = messages.length - 1;
  saveMessages();
  renderMessages();

  try {
    const url = settings.url.replace(/\/+$/,'') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.key}`,
      },
      body: JSON.stringify(body),
      signal: abortController.signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      messages[msgIdx] = { role: 'assistant', content: `Ошибка ${res.status}: ${errText || res.statusText}`, error: true };
      saveMessages();
      renderMessages();
      finishStream();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let content = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const json = trimmed.slice(6);
        if (json === '[DONE]') continue;
        try {
          const data = JSON.parse(json);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch(e) {}
      }

      // Batch update via requestAnimationFrame
      doUpdate(content, msgIdx);
    }

    // Process remaining buffer
    if (buffer.startsWith('data: ')) {
      const json = buffer.slice(6).trim();
      if (json !== '[DONE]') {
        try {
          const data = JSON.parse(json);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch(e) {}
      }
    }

    messages[msgIdx] = { role: 'assistant', content };
    saveMessages();
    renderMessages();
  } catch (e) {
    if (e.name === 'AbortError') {
      messages[msgIdx] = { role: 'assistant', content: content || '(прервано)' };
    } else {
      messages[msgIdx] = { role: 'assistant', content: `Ошибка: ${e.message}`, error: true };
    }
    saveMessages();
    renderMessages();
  }

  finishStream();
}

let _updateTimer = null;
function doUpdate(content, idx) {
  if (_updateTimer) return;
  _updateTimer = requestAnimationFrame(() => {
    _updateTimer = null;
    messages[idx].content = content;
    saveMessages();
    // Live update DOM
    const bubbles = $('chatMessages').querySelectorAll('.msg.ai .bubble');
    if (bubbles.length) {
      const last = bubbles[bubbles.length - 1];
      last.innerHTML = formatContent(esc(content || ''));
      $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    }
  });
}

function finishStream() {
  streaming = false;
  hideStopBtn();
  abortController = null;
}

/* ─── STOP ─── */
function stopGeneration() {
  if (abortController) abortController.abort();
}

function showStopBtn() {
  $('sendBtn').style.display = 'none';
  $('stopBtn').style.display = 'flex';
}

function hideStopBtn() {
  $('sendBtn').style.display = 'flex';
  $('stopBtn').style.display = 'none';
}

/* ─── RETRY ─── */
function retryMessage(i) {
  if (i <= 0 || messages[i-1]?.role !== 'user') return;
  // Remove the error message and the user message before it, re-send
  const userText = messages[i-1].content;
  messages.splice(i-1, 2);
  saveMessages();
  renderMessages();
  $('chatInput').value = userText;
  autoResize($('chatInput'));
  $('chatInput').focus();
}

/* ─── COPY ─── */
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('Скопировано', 'success');
  }).catch(() => {});
}

/* ─── INPUT ─── */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = e.target.selectionStart;
    e.target.value = e.target.value.slice(0, start) + '  ' + e.target.value.slice(e.target.selectionEnd);
    e.target.selectionStart = e.target.selectionEnd = start + 2;
  }
}

/* ─── TOAST ─── */
function toast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}
