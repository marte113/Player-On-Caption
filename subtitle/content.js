//============================================
// 상수/상태
//============================================
const SELECTORS = {
  TRANSCRIPT_TOGGLE: '[data-purpose="transcript-toggle"]',
  TRANSCRIPT_CONTAINER: 'div.transcript--cue-container--Vuwj6',
  TRANSCRIPT_TEXT: 'span[data-purpose="cue-text"]',
  LECTURE_TITLE: 'section.lecture-view--container--mrZSm',
  SUBTITLE_CONTAINER: 'div.well--container--afdWD',
  SUBTITLE_TEXT: 'span.well--text--J1-Qi',
  ENGLISH_SUBTITLE: '.english-subtitle',
  KOREAN_SUBTITLE: '.korean-subtitle',
  VIDEO: 'video',
};

const STATE = {
  translations: null,
  observer: null,
  refs: { eng: null, kor: null },
  last: { eng: "", kor: "" },
  subtitleElement: null,
  shadowRoot: null,
};

console.log("[CT] content.js loaded");

//============================================
// IndexedDB
//============================================
const DB_NAME = "udemy-translator-db";
const DB_VERSION = 1;
const STORE_NAME = "translations";

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      console.log("[CT][IDB] request success");
      resolve(request.result);
    };
    request.onerror = (event) => {
      console.error("[CT][IDB] request error:", event?.target?.error || request.error);
      reject(event?.target?.error || request.error);
    };
  });
}

function openDB() {
  console.log("[CT][IDB] openDB...");
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => {
      console.error("[CT][IDB] open error:", event?.target?.error || request.error);
      reject(event?.target?.error || request.error);
    };
    request.onsuccess = (event) => {
      console.log("[CT][IDB] open success");
      resolve(request.result); // ✅ 안전
    };
    request.onupgradeneeded = (event) => {
      console.log("[CT][IDB] onupgradeneeded");
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "title" });
        console.log("[CT][IDB] store created:", STORE_NAME);
      }
    };
  });
}

async function withStore(mode, Callback) {
  const db = await openDB();
  console.log("[CT][IDB] withStore mode:", mode);
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = await Callback(store);
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => { console.log("[CT][IDB] tx complete"); resolve(); };
      tx.onerror = () => { console.error("[CT][IDB] tx error:", tx.error); reject(tx.error); };
    });
    return result;
  } finally {
    try { db.close(); console.log("[CT][IDB] db closed"); } catch {}
  }
}

async function saveTranslation(title, translations) {
  console.log("[CT] saveTranslation title:", title, "size:", translations?.size);
  await withStore("readwrite", (store) => {
    const request = store.put({ title, translations });
    return promisifyRequest(request);
  });
  console.log("[CT] saveTranslation done");
}

async function getTranslation(title) {
  console.log("[CT] getTranslation title:", title);
  const result = await withStore("readonly", (store) => {
    const request = store.get(title);
    return promisifyRequest(request);
  });
  console.log("[CT] getTranslation found:", !!result);
  return result ? result.translations : null;
}

//============================================
// 텍스트/DOM 유틸
//============================================
function normalizeText(text) {
  return text.trim().toLowerCase().replace(/[^a-zA-Z0-9가-힣\s]/g, "");
}

function openSidebarAndExtractTranscript() {
  const btn = document.querySelector(SELECTORS.TRANSCRIPT_TOGGLE);
  if (!btn) throw new Error("Transcript button not found in DOM");
  if (btn.getAttribute("aria-expanded") !== "true") {
    console.log("[CT] opening transcript sidebar");
    btn.click();
  } else {
    console.log("[CT] transcript already open");
  }
}

function extractTitle() {
  const el = document.querySelector(SELECTORS.LECTURE_TITLE);
  if (!el) throw new Error("Lecture title element not found in DOM");
  const title = el.getAttribute("aria-label");
  if (!title) throw new Error("Lecture title attribute 'aria-label' is empty");
  console.log("[CT] title:", title);
  return title;
}

function extractScript() {
  const cueContainers = document.querySelectorAll(SELECTORS.TRANSCRIPT_CONTAINER);
  const scriptMap = new Map();
  cueContainers.forEach((container) => {
    const cueTextElement = container.querySelector(SELECTORS.TRANSCRIPT_TEXT);
    if (cueTextElement) {
      const normalizedText = normalizeText(cueTextElement.innerText);
      scriptMap.set(normalizedText, "");
    }
  });
  console.log("[CT] extractScript size:", scriptMap.size);
  return scriptMap;
}

//============================================
// Shadow DOM UI
//============================================
function shadowDomInit(mode) {
  const container = document.querySelector(SELECTORS.SUBTITLE_CONTAINER);
  if (!container) throw new Error("Subtitle container not found");
  const shadowRoot = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
      :host { display:flex; flex-direction:column; align-items:center; justify-content:center; }
      .korean-subtitle { color:#fff; margin-top:5px; font-size:2rem; }
      .english-subtitle { color:#fff; margin-top:2px; font-size:2rem; }
      #loading-indicator { display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:2000; color:#555; }
      .spinner { width:28px; height:28px; border:4px solid rgba(0,0,0,0.1); border-top-color:#fff; border-right-color:#fff; border-radius:50%; animation:spin 1s linear infinite; }
      @keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
  `;
  shadowRoot.appendChild(style);

  const englishSubtitle = document.createElement("div");
  englishSubtitle.className = "english-subtitle";
  shadowRoot.appendChild(englishSubtitle);

  const koreanSubtitle = document.createElement("div");
  koreanSubtitle.className = "korean-subtitle";
  shadowRoot.appendChild(koreanSubtitle);

  if (mode === "auto") {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "loading-indicator";
    loadingIndicator.innerHTML = `<div class="spinner"></div>`;
    shadowRoot.appendChild(loadingIndicator);
  }

  STATE.refs.eng = englishSubtitle;
  STATE.refs.kor = koreanSubtitle;
  STATE.shadowRoot = shadowRoot;
  console.log("[CT] shadow DOM initialized, mode:", mode);
}

function showLoadingIndicator() {
  const indicator = STATE.shadowRoot?.getElementById("loading-indicator");
  if (indicator) indicator.style.display = "flex";
  console.log("[CT] showLoadingIndicator");
}

function hideLoadingIndicator() {
  const indicator = STATE.shadowRoot?.getElementById("loading-indicator");
  if (indicator) indicator.style.display = "none";
  console.log("[CT] hideLoadingIndicator");
}

//============================================
// 화면 반영 & 옵저버
//============================================
function updateShadowSubtitles(engSubElem, korSubElem, englishText, koreanText) {
  if (STATE.last.eng === englishText && STATE.last.kor === koreanText) return;
  engSubElem.innerText = englishText;
  korSubElem.innerText = koreanText;
  STATE.last.eng = englishText;
  STATE.last.kor = koreanText;
}

function processSubtitleElement(subtitleElement) {
  if (!STATE.translations) return;
  const englishText = normalizeText(subtitleElement.innerText);
  const koreanText = STATE.translations.get(englishText);
  if (!koreanText) return;

  updateShadowSubtitles(STATE.refs.eng, STATE.refs.kor, subtitleElement.innerText, koreanText);
}

function updateSubtitles() {
  const subtitleElement = document.querySelector(SELECTORS.SUBTITLE_TEXT);
  if (!subtitleElement) return;
  processSubtitleElement(subtitleElement);
}

function ensureObserver() {
  if (STATE.observer) return;
  const targetNode = document.querySelector(SELECTORS.SUBTITLE_TEXT);
  if (!targetNode) return;

  STATE.subtitleElement = targetNode;

  const observer = new MutationObserver(() => {
    if (STATE.translations && STATE.subtitleElement) {
      processSubtitleElement(STATE.subtitleElement);
    }
  });

  observer.observe(targetNode, { characterData: true, subtree: true, childList: true });
  STATE.observer = observer;
  console.log("[CT] MutationObserver attached");
}

function resetState() {
  if (STATE.observer) {
    try { STATE.observer.disconnect(); } catch {}
  }
  STATE.observer = null;
  STATE.translations = null;
  STATE.last = { eng: "", kor: "" };
  STATE.refs = { eng: null, kor: null };
  STATE.subtitleElement = null;
  STATE.shadowRoot = null;
  console.log("[CT] state reset");
}

function startInitialPolling(duration = 4000) {
  if (!STATE.translations) return;
  const video = document.querySelector(SELECTORS.VIDEO);
  const id = setInterval(() => { if (!video || !video.paused) updateSubtitles(); }, 500);
  setTimeout(() => { clearInterval(id); console.log("[CT] initial polling done"); }, duration);
  console.log("[CT] initial polling start", { duration });
}

//============================================
// 스트리밍 버퍼 & 적용
//============================================
const STREAM = {
  accumulated: "",
  pendingLines: [],
  firstDeltaShown: false,
  port: null,
};

function applyDeltaToMap(deltaText, targetMap) {
  STREAM.accumulated += deltaText;

  const lines = STREAM.accumulated.split(/\r?\n/);
  STREAM.accumulated = lines.pop() || "";

  const beforePending = STREAM.pendingLines.length;
  const all = STREAM.pendingLines.concat(lines.map(s => s.trim()).filter(s => s !== ""));

  const pairsLen = all.length - (all.length % 2);
  for (let i = 0; i < pairsLen; i += 2) {
    const english = all[i];
    const korean  = all[i + 1] ?? "";
    targetMap.set(normalizeText(english), korean);
  }
  STREAM.pendingLines = all.slice(pairsLen);

  console.log("[CT] applyDelta", {
    addedLines: lines.length,
    tailLen: STREAM.accumulated.length,
    pairsLen,
    pendingBefore: beforePending,
    pendingAfter: STREAM.pendingLines.length,
    mapSize: targetMap.size,
  });

  if (!STREAM.firstDeltaShown && pairsLen > 0) {
    STREAM.firstDeltaShown = true;
    STATE.translations = targetMap;
    hideLoadingIndicator();
    startInitialPolling();
    console.log("[CT] first delta shown -> UI primed");
  }
}

//============================================
// 전체 대본 통번역 — 스트리밍 Port
//============================================
function translateWholeScriptStreaming(scriptMap) {
  return new Promise((resolve, reject) => {
    const full = [...scriptMap.keys()].join("\n");
    console.log("[CT] translateWholeScriptStreaming start, input lines:", scriptMap.size);

    STREAM.accumulated = "";
    STREAM.pendingLines = [];
    STREAM.firstDeltaShown = false;

    const port = chrome.runtime.connect({ name: "udemy-translate" });
    STREAM.port = port;
    console.log("[CT] Port connected to BG");

    port.onMessage.addListener((msg) => {
      if (!msg || !msg.type) return;
      if (msg.type === "delta") {
        // 간단 로그(너무 많으면 성능↓) — 처음 5번/20번째마다
        if (!translateWholeScriptStreaming._cnt) translateWholeScriptStreaming._cnt = 0;
        translateWholeScriptStreaming._cnt++;
        if (translateWholeScriptStreaming._cnt <= 5 || translateWholeScriptStreaming._cnt % 20 === 0) {
          console.log("[CT] msg:delta snippet:", (msg.text || "").slice(0, 80));
        }
        applyDeltaToMap(msg.text, scriptMap);
        STATE.translations = scriptMap;
      }
      if (msg.type === "error") {
        console.error("[CT] msg:error", msg.error);
        hideLoadingIndicator();
        try { port.disconnect(); } catch {}
        reject(new Error(msg.error || "Streaming error"));
      }
      if (msg.type === "done") {
        console.log("[CT] msg:done; flushing remainders");
        if (STREAM.accumulated) applyDeltaToMap("\n", scriptMap);
        if (STREAM.pendingLines.length >= 2) {
          for (let i = 0; i + 1 < STREAM.pendingLines.length; i += 2) {
            const english = STREAM.pendingLines[i];
            const korean  = STREAM.pendingLines[i + 1] ?? "";
            scriptMap.set(normalizeText(english), korean);
          }
          STREAM.pendingLines = [];
        }
        STATE.translations = scriptMap;
        try { port.disconnect(); } catch {}
        resolve(scriptMap);
      }
    });

    port.postMessage({ type: "start", text: full });
    console.log("[CT] start signal posted to BG");
  });
}

//============================================
// 캐시/프로세스
//============================================
async function loadExistingTranslation(title) {
  try {
    const existingTranslation = await getTranslation(title);
    if (!existingTranslation) {
      console.log("[CT] no cached translation");
      return false;
    }
    console.log("[CT] cached translation loaded, size:", existingTranslation.size);
    hideLoadingIndicator();
    STATE.translations = existingTranslation;
    startInitialPolling();
    return true;
  } catch (e) {
    console.warn("[CT] loadExistingTranslation failed:", e);
    return false;
  }
}

async function process() {
  console.log("[CT] process start");
  showLoadingIndicator();

  const title = extractTitle();
  if (!title) { console.error("[CT] no title"); return; }

  const hasExisting = await loadExistingTranslation(title);
  ensureObserver();
  if (hasExisting) return;

  const extractedScriptMap = extractScript();

  try {
    await translateWholeScriptStreaming(extractedScriptMap);
  } catch (e) {
    hideLoadingIndicator();
    alert(`자막 번역 중 오류가 발생했습니다: ${e.message}`);
    return;
  }

  try {
    const title2 = extractTitle();
    await saveTranslation(title2, extractedScriptMap);
  } catch (e) {
    console.warn("[CT] saveTranslation failed:", e);
  }
  console.log("[CT] process done");
}

//============================================
// 모드 핸들러 & 진입점
//============================================
async function handleAutoMode() {
  try {
    console.log("[CT] handleAutoMode");
    shadowDomInit("auto");
    openSidebarAndExtractTranscript();
    await process();
  } catch (error) {
    hideLoadingIndicator();
    console.error("[CT] handleAutoMode error:", error);
    alert(`자막 번역 중 오류가 발생했습니다: ${error.message}`);
  }
}

async function handleUserMode() {
  console.log("[CT] handleUserMode");
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".txt";
  fileInput.onchange = async () => {
    try {
      shadowDomInit("text");
      const translations = await readTranslationFile(fileInput.files[0]);
      STATE.translations = translations;
      ensureObserver();
      startInitialPolling();
    } catch (error) {
      console.error("[CT] user file error:", error);
      alert(`번역 파일 처리 중 오류가 발생했습니다: ${error.message}`);
    }
  };
  fileInput.click();
}

async function readTranslationFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return parseTranslationFile(lines);
}

function parseTranslationFile(lines) {
  const translations = new Map();
  for (let i = 0; i < lines.length; i += 2) {
    const english = normalizeText(lines[i]);
    const korean = i + 1 < lines.length ? lines[i + 1] : "";
    translations.set(english, korean);
  }
  return translations;
}

const modeHandlers = { auto: handleAutoMode, user: handleUserMode };

chrome.runtime.onMessage.addListener((request) => {
  if (request.action !== "updateSubtitles") return;
  console.log("[CT] updateSubtitles:", request.mode);
  resetState();
  const handler = modeHandlers[request.mode];
  handler?.();
});
