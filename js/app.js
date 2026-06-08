/* ═══════════════════════════════════════════
   AI Chat
   ═══════════════════════════════════════════ */

const PROVIDERS = {
  github:    { name:'GitHub Models',  url:'https://models.inference.ai.azure.com',          key:'' },
  deepseek:  { name:'DeepSeek',       url:'https://api.deepseek.com',                       key:'' },
  openrouter:{ name:'OpenRouter',     url:'https://openrouter.ai/api/v1',                   key:'' },
  openai:    { name:'OpenAI',         url:'https://api.openai.com/v1',                      key:'' },
  groq:      { name:'Groq',           url:'https://api.groq.com/openai/v1',                 key:'' }
};

// Embedding models to exclude from chat model list
const EMBED_PATTERNS = /embed|ada|similarity|search|classification|davinci|curie|babbage|whisper|tts|dall-e|moderation|cohere-embed|cohere-rerank|cohere-classify|jina-embed|jina-reranker|minilm|e5-|bge-/i;

const PREFERRED_MODELS = [
  'gpt-4o-mini','gpt-4o','gpt-4','gpt-4-turbo','gpt-3.5-turbo',
  'deepseek-chat','deepseek-v3','deepseek-r1',
  'claude-3-5-sonnet','claude-3-5-haiku','claude-3-opus','claude-3-sonnet','claude-3-haiku','claude-sonnet','claude-haiku',
  'gemini-2','gemini-1.5','gemini-pro',
  'llama-4','llama-3','llama3','llama',
  'mistral-large','mistral-small','mixtral','codestral',
  'phi-4','phi-3','phi3','phi',
  'qwen2','qwen',
  'command-r+','command-r','command',
  'grok'
];

let settings = { provider:'', url:'', key:'', systemPrompt:'', temperature:0.7, maxTokens:4096 };
let models = [];
let currentModel = '';
let messages = [];
let streaming = false;
let abortCtrl = null;

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
  toggleSettings();
  connect();
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
  const v = $('presetSelect').value;
  if (!v || v === 'custom') return;
  const p = PROVIDERS[v];
  if (!p) return;
  $('providerName').value = p.name;
  $('apiUrl').value = p.url;
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
  setPill('...');
  const ok = await refreshModels();
  if (ok) {
    setPill(settings.provider || 'ок');
    showChat();
  } else {
    setPill('ошибка');
  }
}

function setPill(t) { $('providerPill').textContent = t; }

async function refreshModels() {
  if (!settings.url || !settings.key) return false;
  try {
    const url = settings.url.replace(/\/+$/,'') + '/models';
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${settings.key}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const all = (data.data || data).filter(m => m.id).map(m => ({ id: normalizeModelId(m.id) }));
    // Filter out non-chat models
    models = all.filter(m => !EMBED_PATTERNS.test(m.id));
    if (!models.length) { models = all; } // fallback
    localStorage.setItem('aichat_models', JSON.stringify({ models, ts: Date.now(), url: settings.url }));

    const sel = $('modelSelect');
    sel.innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');

    // Auto-select best model
    const picked = pickBestModel(models);
    currentModel = picked;
    sel.value = picked;

    toast(`${models.length} моделей (${all.length - models.length} скрыто)`, 'success');
    return true;
  } catch (e) {
    const cached = loadCachedModels();
    if (cached) {
      models = cached.models;
      const sel = $('modelSelect');
      sel.innerHTML = models.map(m => `<option value="${esc(m.id)}">${esc(m.id)}</option>`).join('');
      currentModel = models[0]?.id || '';
      sel.value = currentModel;
      toast('Кэш моделей', 'success');
      return true;
    }
    toast(e.message, 'error');
    return false;
  }
}

function loadCachedModels() {
  try { const c = JSON.parse(localStorage.getItem('aichat_models')); if (c && c.url === settings.url && c.models.length) return c; } catch(e) {}
  return null;
}

function normalizeModelId(id) {
  // Azure ML format: azureml://registries/{reg}/models/{name}/versions/{v}
  const m = id.match(/\/models\/([^/]+)/);
  if (m) return m[1];
  return id;
}

function pickBestModel(list) {
  const id = id => id.toLowerCase();
  for (const preferred of PREFERRED_MODELS) {
    const found = list.find(m => id(m.id).includes(preferred));
    if (found) return found.id;
  }
  // Fallback: pick any model without "embed" "ada" "whisper" etc
  const chat = list.find(m => !EMBED_PATTERNS.test(m.id));
  return chat ? chat.id : (list[0]?.id || '');
}

function switchModel(id) { currentModel = id; }

/* ─── CHAT UI ─── */
function showChat() {
  $('welcomeScreen').style.display = 'none';
  $('chatLayout').style.display = 'flex';
  loadMessages();
}

function clearChat() {
  if (!messages.length) return;
  if (!confirm('Очистить чат?')) return;
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
  const c = $('chatMessages');
  c.innerHTML = messages.map((m, i) => renderMsg(m, i)).join('');
  c.scrollTop = c.scrollHeight;
}

function renderMsg(m, i) {
  const role = m.role === 'user' ? 'user' : 'ai';
  const extra = m.error ? ' error' : '';
  const html = fmt(m.content || '');
  const retry = m.error ? `<button class="retry" onclick="retryMsg(${i})">Повторить</button>` : '';
  return `<div class="msg ${role}${extra}">
    <div class="ava">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="bubble">
      <button class="msg-copy" onclick="copyMsg(${i})" title="Скопировать">⎘</button>
      ${html}${retry}
    </div>
  </div>`;
}

function fmt(text) {
  if (!text) return '';
  text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><button class="cpy" onclick="copy(this.nextSibling.textContent)">⎘</button><code>${esc(code.trimEnd())}</code></pre>`
  );
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(\S[^*]*\S|\S)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*(\S[^*]*\S|\S)\*/g, '<em>$1</em>');
  return text.split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('') || '<p></p>';
}

/* ─── SEND ─── */
async function sendMessage() {
  const input = $('chatInput');
  const text = input.value.trim();
  if (!text || streaming) return;

  if (!settings.key) { toggleSettings(); return; }

  input.value = '';
  input.style.height = 'auto';

  messages.push({ role: 'user', content: text });
  saveMessages();
  renderMessages();

  const msgs = [];
  if (settings.systemPrompt) msgs.push({ role: 'system', content: settings.systemPrompt });
  messages.forEach(m => msgs.push({ role: m.role, content: m.content }));

  abortCtrl = new AbortController();
  streaming = true;
  toggleSendStop();

  messages.push({ role: 'assistant', content: '', streaming: true });
  const idx = messages.length - 1;
  saveMessages();
  renderMessages();

  try {
    const url = settings.url.replace(/\/+$/,'') + '/chat/completions';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${settings.key}` },
      body: JSON.stringify({
        model: currentModel,
        messages: msgs,
        stream: true,
        temperature: settings.temperature ?? 0.7,
        max_tokens: settings.maxTokens ?? 4096
      }),
      signal: abortCtrl.signal
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      messages[idx] = { role:'assistant', content:`Ошибка ${res.status}: ${err || res.statusText}`, error:true };
      saveMessages(); renderMessages(); finishStream(); return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let content = '', buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const json = t.slice(6);
        if (json === '[DONE]') continue;
        try {
          const d = JSON.parse(json);
          const delta = d.choices?.[0]?.delta?.content;
          if (delta) content += delta;
        } catch(e) {}
      }
      scheduleUpdate(content, idx);
    }

    if (buf.startsWith('data: ')) {
      const json = buf.slice(6).trim();
      if (json !== '[DONE]') {
        try { const d = JSON.parse(json); const delta = d.choices?.[0]?.delta?.content; if (delta) content += delta; } catch(e) {}
      }
    }

    messages[idx] = { role:'assistant', content };
    saveMessages(); renderMessages();
  } catch (e) {
    if (e.name === 'AbortError') {
      messages[idx] = { role:'assistant', content: content || '(прервано)' };
    } else {
      messages[idx] = { role:'assistant', content: `Ошибка: ${e.message}`, error:true };
    }
    saveMessages(); renderMessages();
  }

  finishStream();
}

let _raf = null;
function scheduleUpdate(content, idx) {
  if (_raf) return;
  _raf = requestAnimationFrame(() => {
    _raf = null;
    messages[idx].content = content;
    saveMessages();
    const bubbles = $('chatMessages').querySelectorAll('.msg.ai .bubble');
    if (bubbles.length) {
      const last = bubbles[bubbles.length - 1];
      last.innerHTML = fmt(content || '');
      $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
    }
  });
}

function finishStream() {
  streaming = false;
  abortCtrl = null;
  toggleSendStop();
}

function toggleSendStop() {
  $('sendBtn').style.display = streaming ? 'none' : 'flex';
  $('stopBtn').style.display = streaming ? 'flex' : 'none';
}

function stopGeneration() { if (abortCtrl) abortCtrl.abort(); }

function retryMsg(i) {
  if (i <= 0 || messages[i-1]?.role !== 'user') return;
  const t = messages[i-1].content;
  messages.splice(i-1, 2);
  saveMessages(); renderMessages();
  $('chatInput').value = t;
  autoResize($('chatInput'));
  $('chatInput').focus();
}

function copy(text) { navigator.clipboard.writeText(text).then(() => toast('Скопировано','success')).catch(()=>{}); }
function copyMsg(i) { copy(messages[i]?.content || ''); }

/* ─── INPUT ─── */
function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  if (e.key === 'Tab') { e.preventDefault();
    const s = e.target.selectionStart;
    e.target.value = e.target.value.slice(0,s) + '  ' + e.target.value.slice(e.target.selectionEnd);
    e.target.selectionStart = e.target.selectionEnd = s + 2;
  }
  if (e.key === 'Escape') { e.target.blur(); }
}

/* ─── TOAST ─── */
function toast(msg, type) {
  const t = $('toast');
  t.textContent = msg; t.className = 'toast' + (type === 'error'?' error':type === 'success'?' success':'');
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2500);
}
