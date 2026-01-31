// DuRead - Chinese Reading Helper
// Progressive Web App for learning Chinese through reading
// Version: Bump this when making changes
const APP_VERSION = '1.3.0';

(function() {
  'use strict';

  // ===================
  // State Management
  // ===================
  const state = {
    direction: 'en-zh', // 'en-zh' or 'zh-en'
    apiKey: null, // Decrypted API key for current session
    sentences: [], // Array of { id, source, status, translation, pinyin, words }
    isTranslating: false, // Flag to ensure sequential translation
    translationQueue: [], // Queue of sentences waiting to be translated
    observer: null, // Intersection Observer instance
    currentTextId: null, // ID of the currently loaded saved text
    sourceText: '', // Original source text
  };

  // ===================
  // Constants
  // ===================
  const DB_NAME = 'duread-db';
  const DB_VERSION = 2;
  const STORE_NAME = 'settings';
  const TEXTS_STORE_NAME = 'texts';
  const API_URL = 'https://api.anthropic.com/v1/messages';
  const MODEL = 'claude-haiku-4-5-20251001';
  const SESSION_TOKEN_KEY = 'duread-session-token';

  // ===================
  // DOM Elements
  // ===================
  const elements = {
    textInput: document.getElementById('textInput'),
    submitBtn: document.getElementById('submitBtn'),
    outputSection: document.getElementById('outputSection'),
    emptyState: document.getElementById('emptyState'),
    settingsModal: document.getElementById('settingsModal'),
    unlockModal: document.getElementById('unlockModal'),
    settingsBtn: document.querySelector('.settings-btn'),
    closeSettings: document.getElementById('closeSettings'),
    apiKeyInput: document.getElementById('apiKeyInput'),
    passphraseInput: document.getElementById('passphraseInput'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    clearDataBtn: document.getElementById('clearDataBtn'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    unlockPassphrase: document.getElementById('unlockPassphrase'),
    unlockBtn: document.getElementById('unlockBtn'),
    directionBtns: document.querySelectorAll('.direction-btn'),
    toast: document.getElementById('toast'),
    versionTag: document.getElementById('versionTag'),
    libraryModal: document.getElementById('libraryModal'),
    libraryBtn: document.getElementById('libraryBtn'),
    closeLibrary: document.getElementById('closeLibrary'),
    libraryList: document.getElementById('libraryList'),
    libraryEmpty: document.getElementById('libraryEmpty'),
    newTextBtn: document.getElementById('newTextBtn'),
  };

  // ===================
  // IndexedDB Helpers
  // ===================
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
        // Add texts store for saved texts (version 2)
        if (!db.objectStoreNames.contains(TEXTS_STORE_NAME)) {
          const textsStore = db.createObjectStore(TEXTS_STORE_NAME, { keyPath: 'id' });
          textsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  async function dbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value);
    });
  }

  async function dbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put({ key, value });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function dbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function dbClear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ===================
  // Text Persistence
  // ===================
  function generateTextId() {
    return `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function generateTextTitle(text) {
    // Use first 50 characters, trimmed at word boundary
    const maxLen = 50;
    if (text.length <= maxLen) return text.trim();
    const trimmed = text.substring(0, maxLen);
    const lastSpace = trimmed.lastIndexOf(' ');
    return (lastSpace > 20 ? trimmed.substring(0, lastSpace) : trimmed) + '...';
  }

  async function saveText(textData) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE_NAME);
      const request = store.put(textData);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(textData.id);
    });
  }

  async function getText(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE_NAME, 'readonly');
      const store = tx.objectStore(TEXTS_STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async function deleteText(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE_NAME, 'readwrite');
      const store = tx.objectStore(TEXTS_STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async function getAllTexts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(TEXTS_STORE_NAME, 'readonly');
      const store = tx.objectStore(TEXTS_STORE_NAME);
      const index = store.index('updatedAt');
      const request = index.openCursor(null, 'prev'); // Most recent first
      const texts = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          texts.push(cursor.value);
          cursor.continue();
        } else {
          resolve(texts);
        }
      };
    });
  }

  async function saveCurrentText() {
    if (state.sentences.length === 0) return null;

    const now = Date.now();
    const isNew = !state.currentTextId;
    const textData = {
      id: state.currentTextId || generateTextId(),
      title: generateTextTitle(state.sourceText),
      sourceText: state.sourceText,
      direction: state.direction,
      sentences: state.sentences.map(s => ({
        id: s.id,
        source: s.source,
        status: s.status,
        translation: s.translation,
        pinyin: s.pinyin,
        words: s.words,
        error: s.error,
      })),
      createdAt: isNew ? now : (await getText(state.currentTextId))?.createdAt || now,
      updatedAt: now,
    };

    await saveText(textData);
    state.currentTextId = textData.id;
    return textData.id;
  }

  async function loadSavedText(id) {
    const textData = await getText(id);
    if (!textData) {
      showToast('Text not found', 'error');
      return false;
    }

    // Clear current state
    clearOutput();

    // Restore state
    state.currentTextId = textData.id;
    state.sourceText = textData.sourceText;
    state.direction = textData.direction;
    state.sentences = textData.sentences;

    // Update direction UI
    setDirection(textData.direction);

    // Update text input
    elements.textInput.value = textData.sourceText;

    // Setup observer
    setupIntersectionObserver();

    // Render all sentence blocks
    showEmptyState(false);
    state.sentences.forEach(sentence => {
      const block = renderSentenceBlock(sentence);
      elements.outputSection.appendChild(block);

      // Observe pending sentences for lazy translation
      if (sentence.status === 'pending') {
        state.observer.observe(block);
      }
    });

    return true;
  }

  function startNewText() {
    // Clear current text state
    state.currentTextId = null;
    state.sourceText = '';
    clearOutput();
    elements.textInput.value = '';
    showEmptyState(true);
    elements.textInput.focus();
  }

  // ===================
  // Encryption Helpers
  // ===================
  async function deriveKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptApiKey(apiKey, passphrase) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      encoder.encode(apiKey)
    );

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  async function decryptApiKey(encryptedData, passphrase) {
    try {
      const combined = new Uint8Array(
        atob(encryptedData).split('').map(c => c.charCodeAt(0))
      );

      const salt = combined.slice(0, 16);
      const iv = combined.slice(16, 28);
      const encrypted = combined.slice(28);

      const key = await deriveKey(passphrase, salt);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      throw new Error('Invalid passphrase');
    }
  }

  // ===================
  // Session Token Cache
  // ===================
  function cacheToken(token) {
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch (e) {
      // sessionStorage may be unavailable in some contexts
      console.warn('Could not cache token to sessionStorage:', e);
    }
  }

  function getCachedToken() {
    try {
      return sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function clearCachedToken() {
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (e) {
      // Ignore errors
    }
  }

  // ===================
  // Text Processing
  // ===================
  function splitIntoSentences(text) {
    if (!text || !text.trim()) return [];

    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Split by sentence boundaries
    // English: . ! ? followed by space or end
    // Chinese: 。！？；
    const sentenceRegex = /[^.!?。！？；]+[.!?。！？；]?\s*/g;
    const matches = text.match(sentenceRegex) || [];

    return matches
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map((source, index) => ({
        id: `sentence-${Date.now()}-${index}`,
        source: source,
        status: 'pending', // pending, loading, loaded, error
        translation: null,
        pinyin: null,
        words: null,
        error: null,
      }));
  }

  function detectLanguage(text) {
    // Simple detection: if majority is Chinese characters, it's Chinese
    const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
    const totalChars = text.replace(/\s/g, '').length;

    return chineseChars.length > totalChars * 0.3 ? 'zh' : 'en';
  }

  // ===================
  // Translation API
  // ===================
  async function translateSentence(sentence) {
    if (!state.apiKey) {
      throw new Error('API key not configured');
    }

    const isEnToZh = state.direction === 'en-zh';
    const sourceLanguage = isEnToZh ? 'English' : 'Chinese';
    const targetLanguage = isEnToZh ? 'Chinese' : 'English';

    const prompt = `You are a Chinese language learning assistant helping absolute beginners.

Translate the following ${sourceLanguage} text to ${targetLanguage} and provide a detailed word breakdown.

Text to translate: "${sentence.source}"

You MUST respond with valid JSON in this exact format (no markdown, no code blocks, just pure JSON):
{
  "translation": "the translated sentence",
  "pinyin": "full pinyin of the Chinese text with tone marks (ā á ǎ à ē é ě è etc.)",
  "words": [
    {
      "source": "original word/phrase from the source text",
      "chinese": "Chinese characters",
      "pinyin": "pinyin with tone marks",
      "meaning": "English meaning",
      "breakdown": "character breakdown like 谈(talk) + 判(judge)" or null if single character or simple word
    }
  ]
}

Important instructions:
- Break down EVERY word, not just difficult ones - absolute beginners need all words explained
- For compound words, always explain character components in the breakdown
- Maintain word order matching the Chinese sentence structure
- Use tone marks in pinyin (ā á ǎ à), NOT tone numbers
- The "pinyin" at the top level should be for the full Chinese sentence
- Keep the source field matching words from the input text
- Respond ONLY with the JSON object, no additional text`;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text || '';

    // Parse JSON response
    try {
      // Remove potential markdown code block wrappers
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }

      const parsed = JSON.parse(jsonStr);
      return {
        translation: parsed.translation,
        pinyin: parsed.pinyin,
        words: parsed.words || [],
      };
    } catch (parseError) {
      console.error('Failed to parse API response:', content);
      throw new Error('Failed to parse translation response');
    }
  }

  // ===================
  // Text-to-Speech
  // ===================
  function speak(text, lang = 'zh-CN') {
    if (!('speechSynthesis' in window)) {
      showToast('Text-to-speech not supported', 'error');
      return;
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.8; // Slower for learners

    // Try to find a Chinese voice
    const voices = speechSynthesis.getVoices();
    const chineseVoice = voices.find(v =>
      v.lang.startsWith('zh') || v.lang.includes('Chinese')
    );
    if (chineseVoice) {
      utterance.voice = chineseVoice;
    }

    speechSynthesis.speak(utterance);
    return utterance;
  }

  // ===================
  // UI Rendering
  // ===================
  function renderSentenceBlock(sentence) {
    const block = document.createElement('div');
    block.className = 'sentence-block';
    block.id = sentence.id;
    block.dataset.sentenceId = sentence.id;

    if (sentence.status === 'pending' || sentence.status === 'loading') {
      block.innerHTML = `
        <div class="sentence-source">${escapeHtml(sentence.source)}</div>
        <div class="sentence-loading">
          <div class="loading-spinner"></div>
          <span class="loading-text">${sentence.status === 'loading' ? 'Translating...' : 'Waiting...'}</span>
        </div>
      `;
    } else if (sentence.status === 'error') {
      block.innerHTML = `
        <div class="sentence-source">${escapeHtml(sentence.source)}</div>
        <div class="sentence-error">${escapeHtml(sentence.error || 'Translation failed')}</div>
      `;
    } else if (sentence.status === 'loaded') {
      const chineseText = state.direction === 'en-zh'
        ? sentence.translation
        : sentence.source;

      block.innerHTML = `
        <div class="sentence-source">${escapeHtml(sentence.source)}</div>
        <div class="sentence-translation-row">
          <div class="sentence-translation">${escapeHtml(sentence.translation)}</div>
          <button class="speak-btn" data-speak="${escapeAttr(chineseText)}" aria-label="Speak sentence">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
          </button>
        </div>
        <div class="sentence-pinyin">${escapeHtml(sentence.pinyin || '')}</div>
        ${renderWordTable(sentence.words)}
      `;
    }

    return block;
  }

  function renderWordTable(words) {
    if (!words || words.length === 0) return '';

    const rows = words.map(word => `
      <tr>
        <td class="word-source">${escapeHtml(word.source || '')}</td>
        <td>
          <div class="word-chinese-cell">
            <span class="word-chinese">${escapeHtml(word.chinese || '')}</span>
            <button class="word-speak-btn" data-speak="${escapeAttr(word.chinese || '')}" aria-label="Speak word">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </button>
          </div>
        </td>
        <td class="word-pinyin">${escapeHtml(word.pinyin || '')}</td>
        <td class="word-meaning">
          ${escapeHtml(word.meaning || '')}
          ${word.breakdown ? `<span class="word-breakdown">${escapeHtml(word.breakdown)}</span>` : ''}
        </td>
      </tr>
    `).join('');

    return `
      <table class="word-table">
        <thead>
          <tr>
            <th>Word</th>
            <th>Chinese</th>
            <th>Pinyin</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeAttr(text) {
    return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function updateSentenceBlock(sentence) {
    const block = document.getElementById(sentence.id);
    if (!block) return;

    const newBlock = renderSentenceBlock(sentence);
    block.replaceWith(newBlock);

    // Re-attach observers
    if (state.observer && sentence.status === 'pending') {
      state.observer.observe(newBlock);
    }
  }

  function showEmptyState(show) {
    elements.emptyState.style.display = show ? 'flex' : 'none';
  }

  function clearOutput() {
    // Remove all sentence blocks but keep empty state
    const blocks = elements.outputSection.querySelectorAll('.sentence-block');
    blocks.forEach(block => block.remove());
    state.sentences = [];
  }

  // ===================
  // Intersection Observer
  // ===================
  function setupIntersectionObserver() {
    if (state.observer) {
      state.observer.disconnect();
    }

    // Reset queue
    state.translationQueue = [];
    state.isTranslating = false;

    const options = {
      root: elements.outputSection,
      rootMargin: '200px 0px', // Prefetch 200px ahead
      threshold: 0,
    };

    state.observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sentenceId = entry.target.dataset.sentenceId;
          const sentence = state.sentences.find(s => s.id === sentenceId);

          if (sentence && sentence.status === 'pending') {
            queueTranslation(sentence);
          }
        }
      });
    }, options);
  }

  // Queue a sentence for translation (ensures sequential processing)
  function queueTranslation(sentence) {
    if (sentence.status !== 'pending') return;

    // Check if already in queue
    if (state.translationQueue.includes(sentence)) return;

    state.translationQueue.push(sentence);
    processTranslationQueue();
  }

  // Process queue one sentence at a time
  async function processTranslationQueue() {
    if (state.isTranslating) return;
    if (state.translationQueue.length === 0) return;

    state.isTranslating = true;
    const sentence = state.translationQueue.shift();

    // Double-check status in case it changed
    if (sentence.status !== 'pending') {
      state.isTranslating = false;
      processTranslationQueue();
      return;
    }

    sentence.status = 'loading';
    updateSentenceBlock(sentence);

    try {
      const result = await translateSentence(sentence);
      sentence.translation = result.translation;
      sentence.pinyin = result.pinyin;
      sentence.words = result.words;
      sentence.status = 'loaded';
    } catch (error) {
      console.error('Translation error:', error);
      sentence.error = error.message;
      sentence.status = 'error';
    }

    updateSentenceBlock(sentence);

    // Auto-save after translation completes
    saveCurrentText().catch(err => console.error('Failed to auto-save:', err));

    state.isTranslating = false;
    // Process next in queue
    processTranslationQueue();
  }

  // ===================
  // Main Processing
  // ===================
  async function processText(text) {
    if (!text || !text.trim()) {
      showToast('Please enter some text', 'error');
      return;
    }

    if (!state.apiKey) {
      // Check if there's an encrypted key that needs unlocking
      const hasEncryptedKey = await dbGet('encryptedApiKey');
      if (hasEncryptedKey) {
        showToast('Please unlock your API key first', 'error');
        openUnlockModal();
      } else {
        showToast('Please configure your API key first', 'error');
        openSettings();
      }
      return;
    }

    // Clear previous output
    clearOutput();
    showEmptyState(false);

    // Reset current text ID for new text (new submission = new saved text)
    state.currentTextId = null;
    state.sourceText = text;

    // Auto-detect direction if needed
    const detectedLang = detectLanguage(text);
    if (detectedLang === 'zh' && state.direction === 'en-zh') {
      setDirection('zh-en');
    } else if (detectedLang === 'en' && state.direction === 'zh-en') {
      setDirection('en-zh');
    }

    // Split into sentences
    state.sentences = splitIntoSentences(text);

    if (state.sentences.length === 0) {
      showToast('No sentences found in the text', 'error');
      showEmptyState(true);
      return;
    }

    // Setup observer
    setupIntersectionObserver();

    // Render all sentence blocks
    state.sentences.forEach(sentence => {
      const block = renderSentenceBlock(sentence);
      elements.outputSection.appendChild(block);

      // Observe for visibility
      if (sentence.status === 'pending') {
        state.observer.observe(block);
      }
    });

    // Scroll to top of output
    elements.outputSection.scrollTop = 0;

    // Save initial text state
    saveCurrentText().catch(err => console.error('Failed to save text:', err));
  }

  // ===================
  // Direction Toggle
  // ===================
  function setDirection(direction) {
    state.direction = direction;
    elements.directionBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.direction === direction);
    });
  }

  // ===================
  // Settings Management
  // ===================
  async function checkApiKeyStatus() {
    try {
      const encrypted = await dbGet('encryptedApiKey');
      if (encrypted) {
        elements.statusDot.classList.add('configured');
        elements.statusText.textContent = 'API key configured (locked)';
        return true;
      }
    } catch (error) {
      console.error('Error checking API key status:', error);
    }

    elements.statusDot.classList.remove('configured');
    elements.statusText.textContent = 'No API key configured';
    return false;
  }

  function updateKeyStatus() {
    if (state.apiKey) {
      elements.statusDot.classList.add('configured');
      elements.statusText.textContent = 'API key configured (unlocked)';
    } else {
      checkApiKeyStatus();
    }
  }

  async function saveApiKey() {
    const apiKey = elements.apiKeyInput.value.trim();
    const passphrase = elements.passphraseInput.value;

    if (!apiKey) {
      showToast('Please enter an API key', 'error');
      return;
    }

    if (!passphrase || passphrase.length < 6) {
      showToast('Passphrase must be at least 6 characters', 'error');
      return;
    }

    try {
      const encrypted = await encryptApiKey(apiKey, passphrase);
      await dbSet('encryptedApiKey', encrypted);

      state.apiKey = apiKey;
      cacheToken(apiKey); // Cache for session

      // Clear input fields
      elements.apiKeyInput.value = '';
      elements.passphraseInput.value = '';

      updateKeyStatus();
      closeSettingsModal();
      showToast('API key saved successfully', 'success');
    } catch (error) {
      console.error('Error saving API key:', error);
      showToast('Failed to save API key', 'error');
    }
  }

  async function unlockApiKey() {
    const passphrase = elements.unlockPassphrase.value;

    if (!passphrase) {
      showToast('Please enter your passphrase', 'error');
      return;
    }

    try {
      const encrypted = await dbGet('encryptedApiKey');
      if (!encrypted) {
        showToast('No API key found', 'error');
        return;
      }

      const apiKey = await decryptApiKey(encrypted, passphrase);
      state.apiKey = apiKey;
      cacheToken(apiKey); // Cache for session

      elements.unlockPassphrase.value = '';
      closeUnlockModal();
      updateKeyStatus();
      showToast('Session unlocked', 'success');
    } catch (error) {
      console.error('Error unlocking:', error);
      showToast('Invalid passphrase', 'error');
    }
  }

  async function clearAllData() {
    if (!confirm('This will delete your API key and all settings. Continue?')) {
      return;
    }

    try {
      await dbClear();
      clearCachedToken();
      state.apiKey = null;

      elements.apiKeyInput.value = '';
      elements.passphraseInput.value = '';

      updateKeyStatus();
      showToast('All data cleared', 'success');
    } catch (error) {
      console.error('Error clearing data:', error);
      showToast('Failed to clear data', 'error');
    }
  }

  // ===================
  // Modal Management
  // ===================
  function openSettings() {
    elements.settingsModal.classList.add('open');
  }

  function closeSettingsModal() {
    elements.settingsModal.classList.remove('open');
  }

  function openUnlockModal() {
    elements.unlockModal.classList.add('open');
    elements.unlockPassphrase.focus();
  }

  function closeUnlockModal() {
    elements.unlockModal.classList.remove('open');
  }

  async function openLibraryModal() {
    elements.libraryModal.classList.add('open');
    await renderLibraryList();
  }

  function closeLibraryModal() {
    elements.libraryModal.classList.remove('open');
  }

  function formatRelativeDate(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;

    return new Date(timestamp).toLocaleDateString();
  }

  function renderTextCard(textData) {
    const totalSentences = textData.sentences.length;
    const translatedSentences = textData.sentences.filter(s => s.status === 'loaded').length;
    const progress = totalSentences > 0 ? Math.round((translatedSentences / totalSentences) * 100) : 0;
    const isActive = state.currentTextId === textData.id;

    const card = document.createElement('div');
    card.className = `text-card${isActive ? ' active' : ''}`;
    card.dataset.textId = textData.id;

    card.innerHTML = `
      <div class="text-card-header">
        <div class="text-card-title">${escapeHtml(textData.title)}</div>
        <button class="text-card-delete" data-delete-id="${textData.id}" aria-label="Delete text">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
      <div class="text-card-meta">
        <div class="text-card-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <span>${translatedSentences}/${totalSentences}</span>
        </div>
        <span class="text-card-date">${formatRelativeDate(textData.updatedAt)}</span>
        <span class="text-card-direction">${textData.direction === 'en-zh' ? 'EN→中' : '中→EN'}</span>
      </div>
    `;

    return card;
  }

  async function renderLibraryList() {
    const texts = await getAllTexts();

    // Clear existing cards (keep empty state element)
    const existingCards = elements.libraryList.querySelectorAll('.text-card');
    existingCards.forEach(card => card.remove());

    if (texts.length === 0) {
      elements.libraryEmpty.style.display = 'block';
      return;
    }

    elements.libraryEmpty.style.display = 'none';

    texts.forEach(textData => {
      const card = renderTextCard(textData);
      elements.libraryList.appendChild(card);
    });
  }

  async function handleTextCardClick(textId) {
    const success = await loadSavedText(textId);
    if (success) {
      closeLibraryModal();
      showToast('Text loaded', 'success');
    }
  }

  async function handleDeleteText(textId, event) {
    event.stopPropagation(); // Prevent card click

    if (!confirm('Delete this text? This cannot be undone.')) {
      return;
    }

    try {
      await deleteText(textId);

      // If deleting the current text, clear the state
      if (state.currentTextId === textId) {
        startNewText();
      }

      await renderLibraryList();
      showToast('Text deleted', 'success');
    } catch (error) {
      console.error('Failed to delete text:', error);
      showToast('Failed to delete text', 'error');
    }
  }

  // ===================
  // Toast Notifications
  // ===================
  let toastTimeout;

  function showToast(message, type = 'info') {
    clearTimeout(toastTimeout);

    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.add('show');

    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 3000);
  }

  // ===================
  // Event Handlers
  // ===================
  function setupEventListeners() {
    // Submit button
    elements.submitBtn.addEventListener('click', () => {
      processText(elements.textInput.value);
    });

    // Enter key in textarea (Ctrl/Cmd + Enter to submit)
    elements.textInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        processText(elements.textInput.value);
      }
    });

    // Direction toggle
    elements.directionBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        setDirection(btn.dataset.direction);
      });
    });

    // Settings button
    elements.settingsBtn.addEventListener('click', openSettings);
    elements.closeSettings.addEventListener('click', closeSettingsModal);

    // Close modal on overlay click
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) {
        closeSettingsModal();
      }
    });

    elements.unlockModal.addEventListener('click', (e) => {
      if (e.target === elements.unlockModal) {
        closeUnlockModal();
      }
    });

    // Library button and modal
    elements.libraryBtn.addEventListener('click', openLibraryModal);
    elements.closeLibrary.addEventListener('click', closeLibraryModal);

    elements.libraryModal.addEventListener('click', (e) => {
      if (e.target === elements.libraryModal) {
        closeLibraryModal();
      }
    });

    // New text button
    elements.newTextBtn.addEventListener('click', () => {
      startNewText();
      closeLibraryModal();
      showToast('Ready for new text', 'success');
    });

    // Library list click handling (event delegation)
    elements.libraryList.addEventListener('click', (e) => {
      // Handle delete button
      const deleteBtn = e.target.closest('[data-delete-id]');
      if (deleteBtn) {
        handleDeleteText(deleteBtn.dataset.deleteId, e);
        return;
      }

      // Handle card click
      const card = e.target.closest('.text-card');
      if (card && card.dataset.textId) {
        handleTextCardClick(card.dataset.textId);
      }
    });

    // Settings form
    elements.saveSettingsBtn.addEventListener('click', saveApiKey);
    elements.clearDataBtn.addEventListener('click', clearAllData);

    // Unlock form
    elements.unlockBtn.addEventListener('click', unlockApiKey);
    elements.unlockPassphrase.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        unlockApiKey();
      }
    });

    // Speak buttons (event delegation)
    elements.outputSection.addEventListener('click', (e) => {
      const speakBtn = e.target.closest('[data-speak]');
      if (speakBtn) {
        const text = speakBtn.dataset.speak;
        if (text) {
          speak(text);

          // Visual feedback
          speakBtn.classList.add('speaking');
          setTimeout(() => speakBtn.classList.remove('speaking'), 1000);
        }
      }
    });
  }

  // ===================
  // URL Content Fetching
  // ===================
  const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

  function extractUrlFromText(text) {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const matches = text.match(urlRegex);
    return matches ? matches[0] : null;
  }

  async function fetchUrlContent(url) {
    try {
      const proxyUrl = CORS_PROXY + encodeURIComponent(url);
      const response = await fetch(proxyUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const html = await response.text();
      return extractMainContent(html);
    } catch (error) {
      console.error('Error fetching URL:', error);
      throw new Error('Could not fetch article content');
    }
  }

  function extractMainContent(html) {
    // Create a DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove unwanted elements
    const removeSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 'aside',
      'iframe', 'noscript', 'svg', 'form', 'button',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.nav', '.navbar', '.menu', '.sidebar', '.footer', '.header',
      '.advertisement', '.ad', '.ads', '.social', '.share', '.comments',
      '.cookie', '.popup', '.modal', '.newsletter'
    ];

    removeSelectors.forEach(selector => {
      doc.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Try to find main content area
    const contentSelectors = [
      'article', 'main', '[role="main"]',
      '.post-content', '.article-content', '.entry-content',
      '.content', '.post', '.article'
    ];

    let contentEl = null;
    for (const selector of contentSelectors) {
      contentEl = doc.querySelector(selector);
      if (contentEl && contentEl.textContent.trim().length > 200) {
        break;
      }
    }

    // Fall back to body if no content area found
    if (!contentEl) {
      contentEl = doc.body;
    }

    // Extract text content
    let text = contentEl.textContent || '';

    // Clean up whitespace
    text = text
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Limit to reasonable length (Claude has context limits)
    const maxLength = 8000;
    if (text.length > maxLength) {
      text = text.substring(0, maxLength) + '...\n\n[Content truncated]';
    }

    return text;
  }

  // ===================
  // Share Target Handling
  // ===================
  async function handleShareTarget() {
    const params = new URLSearchParams(window.location.search);
    const sharedText = params.get('text');
    const sharedTitle = params.get('title');
    const sharedUrl = params.get('url');

    // Clear URL params to avoid re-processing on refresh
    if (params.has('text') || params.has('title') || params.has('url')) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Combine shared content to check for URL
    let content = '';
    if (sharedTitle) content += sharedTitle + '\n\n';
    if (sharedText) content += sharedText;
    if (sharedUrl && !content.includes(sharedUrl)) content += '\n' + sharedUrl;

    if (!content.trim()) return;

    // Check if there's a URL to fetch
    const url = sharedUrl || extractUrlFromText(content);

    if (url) {
      // Show loading state
      elements.textInput.value = `Fetching article from:\n${url}\n\nPlease wait...`;
      elements.textInput.disabled = true;

      try {
        const articleText = await fetchUrlContent(url);
        const title = sharedTitle || 'Article';
        elements.textInput.value = `${title}\n\n${articleText}`;
        showToast('Article content loaded', 'success');
      } catch (error) {
        // Fall back to showing original shared content
        elements.textInput.value = content.trim();
        showToast('Could not fetch article - showing shared text', 'error');
      }

      elements.textInput.disabled = false;
    } else {
      elements.textInput.value = content.trim();
    }
  }

  // ===================
  // Service Worker Registration
  // ===================
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration.scope);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }

  // ===================
  // Speech Synthesis Init
  // ===================
  function initSpeechSynthesis() {
    // Load voices (some browsers need this)
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
      };
    }
  }

  // ===================
  // Initialization
  // ===================
  async function init() {
    // Display version
    if (elements.versionTag) {
      elements.versionTag.textContent = 'v' + APP_VERSION;
    }

    // Register service worker
    registerServiceWorker();

    // Initialize speech synthesis
    initSpeechSynthesis();

    // Setup event listeners
    setupEventListeners();

    // Try to restore token from session cache
    const cachedToken = getCachedToken();
    if (cachedToken) {
      state.apiKey = cachedToken;
      updateKeyStatus();
    }

    // Check API key status (if not already unlocked from cache)
    const hasKey = state.apiKey ? true : await checkApiKeyStatus();

    // Handle share target (may fetch URL content)
    await handleShareTarget();

    // If we have an API key stored but not unlocked, and there's shared content, prompt unlock
    if (hasKey && !state.apiKey && elements.textInput.value.trim()) {
      openUnlockModal();
    }
  }

  // Start the app
  init();
})();
