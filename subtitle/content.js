//============================================
// 상수 정의
//============================================

// Udemy DOM 셀렉터 (UI 변경 시 이 부분만 수정)
const SELECTORS = {
  // 대본 관련
  TRANSCRIPT_TOGGLE: '[data-purpose="transcript-toggle"]',
  TRANSCRIPT_CONTAINER: 'div.transcript--cue-container--Vuwj6',
  TRANSCRIPT_TEXT: 'span[data-purpose="cue-text"]',
  
  // 강의 정보
  LECTURE_TITLE: 'section.lecture-view--container--mrZSm',
  
  // 자막 관련
  SUBTITLE_CONTAINER: 'div.well--container--afdWD',
  SUBTITLE_TEXT: 'span.well--text--J1-Qi',
  ENGLISH_SUBTITLE: '.english-subtitle',
  KOREAN_SUBTITLE: '.korean-subtitle',
  
  // 비디오
  VIDEO: 'video',
};

// 전역 상태: 번역 Map, 옵저버, Shadow DOM 레퍼런스, 마지막 표시 텍스트 캐시
const STATE = {
  translations: null,
  observer: null,
  refs: { eng: null, kor: null },
  last: { eng: "", kor: "" },
};

//============================================
// IndexedDB 레이어
//============================================

const DB_NAME = "udemy-translator-db";
const DB_VERSION = 1;
const STORE_NAME = "translations";

/**
 * IndexedDB 요청을 Promise로 변환.
 * @param {IDBRequest} request - IndexedDB 요청 객체
 * @returns {Promise<any>} 요청 결과를 담은 Promise
 */
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * IndexedDB 열기 및 연결 반환.
 * @returns {Promise<IDBDatabase>} 데이터베이스 연결 객체
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("Failed to open database:", event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "title" });
      }
    };
  });
}

/**
 * IndexedDB 스토어 접근 및 콜백 실행.
 * @param {IDBTransactionMode} mode - 트랜잭션 모드 ('readonly' | 'readwrite')
 * @param {Function} Callback - 스토어를 인자로 받는 콜백 함수
 * @returns {Promise<any>} 콜백 실행 결과
 */
async function withStore(mode, Callback) {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  return Callback(store);
}

/**
 * 번역 데이터 IndexedDB 저장.
 * @param {string} title - 강의 제목 (키)
 * @param {Map<string, string>} translations - 번역 Map 객체
 * @returns {Promise<void>}
 */
async function saveTranslation(title, translations) {
  await withStore("readwrite", (store) => {
    const request = store.put({ title, translations });
    return promisifyRequest(request);
  });
  console.log("Translation saved successfully:", title);
}

/**
 * IndexedDB에서 번역 데이터 조회.
 * @param {string} title - 강의 제목 (키)
 * @returns {Promise<Map<string, string>|null>} 번역 Map 객체 또는 null
 */
async function getTranslation(title) {
  const result = await withStore("readonly", (store) => {
    const request = store.get(title);
    return promisifyRequest(request);
  });
  return result ? result.translations : null;
}

/**
 * 텍스트 정규화 (소문자 변환, 특수문자 제거).
 * @param {string} text - 정규화할 텍스트
 * @returns {string} 정규화된 텍스트
 */
function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9가-힣\s]/g, "");
}

/**
 * 대본 사이드바 열기 및 DOM 마운트.
 */
function openSidebarAndExtractTranscript() {
  const transcriptButton = document.querySelector(SELECTORS.TRANSCRIPT_TOGGLE);
  if (!transcriptButton || transcriptButton.getAttribute("aria-expanded") === "true") {
    console.error("Transcript button not found.");
    return;
  }

  transcriptButton.click();
}

/**
 * 현재 강의 제목 추출.
 * @returns {string|null} 강의 제목 또는 null
 */
function extractTitle() {
  console.log("extractTitle 실행");
  let title = null;
  const titleElem = document.querySelector(SELECTORS.LECTURE_TITLE);
  
  if (titleElem) {
    title = titleElem.getAttribute("aria-label");
  } else {
    console.error("해당 class를 가진 section 요소가 존재하지 않습니다.");
  }
  console.log("title :", title);

  return title;
}

/**
 * 강의 대본 추출 및 Map 반환.
 * @returns {Map<string, string>} 정규화된 영어 텍스트를 키로 하는 Map (값은 빈 문자열)
 */
function extractScript() {
  console.log("extractTranscript 실행");
  const cueContainers = document.querySelectorAll(SELECTORS.TRANSCRIPT_CONTAINER);
  const scriptMap = new Map();

  cueContainers.forEach((container) => {
    const cueTextElement = container.querySelector(SELECTORS.TRANSCRIPT_TEXT);
    if (cueTextElement) {
      const normalizedText = normalizeText(cueTextElement.innerText);
      scriptMap.set(normalizedText, "");
    }
  });
  console.log("대본 추출", scriptMap);
  return scriptMap;
}

/**
 * 대본 청크 분할.
 * @param {Map<string, string>} scriptMap - 대본 Map 객체
 * @param {number} [initialChunkSize=20] - 첫 번째 청크 크기
 * @param {number} [subsequentChunkSize=50] - 이후 청크 크기
 * @returns {string[][]} 분할된 대본 청크 배열
 */
function scriptSlice(
  scriptMap,
  initialChunkSize = 20,
  subsequentChunkSize = 50
) {
  const transcript = [...scriptMap.keys()];
  const chunks = [];
  let start = 0;
  let end = initialChunkSize;

  while (start < transcript.length) {
    chunks.push(transcript.slice(start, end));
    start = end;
    end =
      start === initialChunkSize
        ? start + subsequentChunkSize
        : end + subsequentChunkSize;
  }

  console.log("scriptSlice 실행 : ", chunks);
  return chunks;
}

/**
 * Service Worker 통한 번역 API 호출.
 * @param {string} text - 번역할 텍스트
 * @param {string} api - 사용할 API ('openai' | 'deepl')
 * @returns {Promise<string|null>} 번역된 텍스트 또는 null
 */
async function fetchScript(text, api) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: "translateChunk",
      api,
      text,
    });

    if (!response || !response.ok) {
      const errMsg = response && response.error ? response.error : "Background translation failed";
      console.error("Background Error:", errMsg);
      throw new Error(errMsg);
    }

    const data = response.data;

    // DeepL API의 경우 data.translations[0].text를 반환, OpenAI는 문자열 반환
    return api === "deepl" ? data.translations[0].text : data;

  } catch (error) {
    console.error("Translation error:", error);
    return null;
  }
}

/**
 * 텍스트 라인 배열을 영어-한국어 번역 Map으로 파싱.
 * @param {string[]} lines - 텍스트 라인 배열 (영어, 한국어 교대)
 * @returns {Map<string, string>} 번역 Map 객체
 */
function parseTranslations(lines) {
  const translations = new Map();

  // 줄을 두 개씩 묶어 매핑합니다.
  for (let i = 0; i < lines.length; i += 2) {
    const english = normalizeText(lines[i]);
    const korean = i + 1 < lines.length ? lines[i + 1] : "";
    translations.set(english, korean);
  }

  return translations;
}

/**
 * 업로드된 번역 파일 읽기 및 Map 변환.
 * @param {File} file - 업로드된 텍스트 파일
 * @returns {Promise<Map<string, string>>} 번역 Map 객체
 */
async function readTranslationFile(file) {
  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  
  return parseTranslations(lines);
}

/**
 * Shadow DOM 초기화 및 자막 UI 생성.
 * @param {string} mode - 모드 ('auto' | 'text')
 */
function shadowDomInit(mode) {
  console.log("shadowDomInit 실행");
  const container = document.querySelector(SELECTORS.SUBTITLE_CONTAINER);

  // Shadow DOM 생성
  const shadowRoot = container.attachShadow({ mode: "open" });

  // 스타일 추가
  const style = document.createElement("style");
  style.textContent = `
      :host {
        display: flex;
        flex-direction: column;
        align-items: center; 
        justify-content: center;
        text-align: center;
      }
      .korean-subtitle {
        color: #ffffff;
        margin-top: 5px;
        font-size: 2rem;
      }
      .english-subtitle {
        color: #ffffff;
        margin-top: 2px;
        font-size: 2rem;
      }
        
#loading-indicator {
      
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 2000; 
      
    color: #555;
  }
  
  .spinner {
    width: 28px;
    height: 28px;
    border: 4px solid rgba(0, 0, 0, 0.1);
    border-top-color: #FFFFFF; 
    border-right-color: #FFFFFF;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
    `;
  shadowRoot.appendChild(style);

  // 영어 자막 요소 추가
  const englishSubtitle = document.createElement("div");
  englishSubtitle.className = "english-subtitle";
  shadowRoot.appendChild(englishSubtitle);

  // 한국어 자막 요소 추가
  const koreanSubtitle = document.createElement("div");
  koreanSubtitle.className = "korean-subtitle";
  shadowRoot.appendChild(koreanSubtitle);

  // 캐시된 레퍼런스 저장
  STATE.refs.eng = englishSubtitle;
  STATE.refs.kor = koreanSubtitle;

  if (mode === "auto") {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "loading-indicator";
    loadingIndicator.innerHTML = `
    <div class="spinner"></div>
  `;
    shadowRoot.appendChild(loadingIndicator);
  }
}

/**
 * 로딩 인디케이터 표시.
 */
function showLoadingIndicator() {
  console.log("showLoadingIndicator 실행");
  const container = document.querySelector(SELECTORS.SUBTITLE_CONTAINER);
  const shadowRoot = container.shadowRoot;
  const indicator = shadowRoot.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = "block"; // flex 또는 block 등으로 표시
  }
}

/**
 * 로딩 인디케이터 숨김.
 */
function hideLoadingIndicator() {
  console.log("hideLoadingIndicator 실행");
  const container = document.querySelector(SELECTORS.SUBTITLE_CONTAINER);
  const shadowRoot = container.shadowRoot;
  const indicator = shadowRoot.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = "none";
  }
}

/**
 * Shadow DOM 내부에서 영어, 한글 자막 요소 찾기 및 반환.
 * @param {ShadowRoot} shadowRoot 
 * @returns {{ engSubElem: Element|null, korSubElem: Element|null }}
 */
function getShadowSubtitleElements(shadowRoot) {
  const engSubElem = shadowRoot.querySelector(SELECTORS.ENGLISH_SUBTITLE);
  if (!engSubElem) {
    console.error("Cannot find 'english-subtitle' element in ShadowRoot");
  }

  const korSubElem = shadowRoot.querySelector(SELECTORS.KOREAN_SUBTITLE);
  if (!korSubElem) {
    console.error("Cannot find 'korean-subtitle' element in ShadowRoot");
  }

  return { engSubElem, korSubElem };
}

/**
 * 주어진 요소들에 대해 영어/한글 자막 업데이트.
 * @param {Element} engSubElem 
 * @param {Element} korSubElem 
 * @param {string} englishText 
 * @param {string} koreanText 
 */
function updateShadowSubtitles(engSubElem, korSubElem, englishText, koreanText) {
  // 동일 텍스트면 DOM 업데이트 스킵하여 reflow 최소화
  if (STATE.last.eng === englishText && STATE.last.kor === koreanText) return;
  engSubElem.innerText = englishText;
  korSubElem.innerText = koreanText;
  STATE.last.eng = englishText;
  STATE.last.kor = koreanText;
}

/**
 * 하나의 subtitleElement에 대해 컨테이너, Shadow DOM 요소 찾기 및 자막 업데이트.
 * @param {Element} subtitleElement 
 */
function processSubtitleElement(subtitleElement) {
  if (!STATE.translations) return;
  
  const englishText = normalizeText(subtitleElement.innerText);
  const koreanText = STATE.translations.get(englishText);
  if (!koreanText) return; // 번역이 없으면 아무 작업도 수행하지 않음

  // 캐시된 Shadow DOM 레퍼런스 사용, 없으면 보정
  if (!STATE.refs.eng || !STATE.refs.kor) {
    const container = document.querySelector(SELECTORS.SUBTITLE_CONTAINER);
    if (!container) return;
    const shadowRoot = container.shadowRoot;
    if (!shadowRoot) return;
    const { engSubElem, korSubElem } = getShadowSubtitleElements(shadowRoot);
    STATE.refs.eng = engSubElem;
    STATE.refs.kor = korSubElem;
  }

  updateShadowSubtitles(
    STATE.refs.eng,
    STATE.refs.kor,
    subtitleElement.innerText,
    koreanText
  );
}

/**
 * 페이지의 모든 자막 요소 찾기 및 번역된 자막으로 업데이트.
 */
function updateSubtitles() {
  const subtitleElement = document.querySelector(SELECTORS.SUBTITLE_TEXT);
  if (!subtitleElement) return;
  processSubtitleElement(subtitleElement);
}

/**
 * 단일 MutationObserver 생성 또는 재사용.
 * 자막 텍스트 변경 시 자동으로 번역된 자막 업데이트.
 */
function ensureObserver() {
  if (STATE.observer) return;

  const targetNode = document.querySelector(SELECTORS.SUBTITLE_TEXT);
  if (!targetNode) return;

  const observer = new MutationObserver((records) => {
    for (const r of records) {
      // MutationObserver의 records를 활용하여 변경된 노드에서만 탐색
      // (전체 DOM 탐색 대비 ~75% 빠름)
      const base = r.target.nodeType === Node.TEXT_NODE 
        ? r.target.parentElement  // 텍스트 노드면 부모 요소로
        : r.target;                // Element 노드면 그대로 사용
      
      const subtitleElement = base?.closest(SELECTORS.SUBTITLE_TEXT);
      
      if (subtitleElement && STATE.translations) {
        processSubtitleElement(subtitleElement);
      }
    }
  });

  observer.observe(targetNode, {
    characterData: true,
    subtree: true,
    childList: true,
  });

  STATE.observer = observer;
}

/**
 * 전역 상태 초기화 및 옵저버 정리.
 */
function resetState() {
  if (STATE.observer) {
    try { STATE.observer.disconnect(); } catch (_) {}
  }
  STATE.observer = null;
  STATE.translations = null;
  STATE.last = { eng: "", kor: "" };
  STATE.refs = { eng: null, kor: null };
}

/**
 * 옵저버 설정 직후 초기 자막 표시를 위한 폴링 시작.
 * @param {number} [duration=4000] - 폴링 지속 시간 (ms)
 */
function startInitialPolling(duration = 4000) {
  if (!STATE.translations) return;
  
  const video = document.querySelector(SELECTORS.VIDEO);
  if (!video) {
    // 비디오 없으면 1회만 시도
    updateSubtitles();
    return;
  }

  const intervalId = setInterval(() => {
    if (!video.paused) {
      updateSubtitles();
    }
  }, 500);

  setTimeout(() => {
    clearInterval(intervalId);
    console.log("Initial subtitle priming completed");
  }, duration);
}

/**
 * 대본 추출 및 번역 프로세스 실행.
 * @returns {Promise<Map<string, string>|undefined>} 번역 Map 객체 또는 undefined
 */
async function process() {
  console.log("process 최초 실행");
  let isInitialChunk = true;
  if (isInitialChunk) {
    showLoadingIndicator(); // 최초 chunk인 경우, 로딩 인디케이터 표시
  }

  const title = extractTitle();

  if (!title) {
    console.error("Failed to extract title.");
  }

  const existingTranslation = await getTranslation(title);
  if (existingTranslation) {
    // 번역 객체가 존재하면 이를 Map으로 변환하여 반환
    console.log("기존의 번역이 map객체화 되기 전의 형태", existingTranslation);
    hideLoadingIndicator();
    // 단일 옵저버 + 상태 갱신으로 대체
    STATE.translations = existingTranslation;
    ensureObserver();
    // 옵저버 설정 직후 4초간 폴링으로 자막 즉시 반영
    startInitialPolling();
    return;
  }

  const extractedScriptMap = extractScript();
  const chunks = scriptSlice(extractedScriptMap);
  //const translations = new Map();

  for (const chunk of chunks) {
    //const joinedText = chunk.map((sentence) => `<p>${sentence}</p>`).join(""); -> DeepL방식
    const joinedText = chunk.join("\n");
    console.log("process 내부의 joinedText", joinedText);

    // fetchScript 함수를 await로 호출하고, 전체 번역 결과를 받습니다.
    const translatedText = await fetchScript(joinedText, "openai");
    console.log("translatedText :", translatedText);

    // translatedText가 null이 아닌 경우에만 split 호출
    if (translatedText !== null) {
      const translatedSentences = translatedText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s !== "");
      console.log("process 내부의 translatedSentences : ", translatedSentences);
      for (let i = 0; i < translatedSentences.length; i += 2) {
        // arr[i]: 영어, arr[i + 1]: 한국어 (단, 배열 길이를 넘어가지 않도록 체크)
        // 기존의 코드 -> extractedScriptMap.set(extractedScriptMap.get(english), korean);
        // 반복적인 get의 실행이 대본과 번역을 매치하는 안정성을 제공하긴 하지만, 한 차례 검증하는 것이 그리 의미가
        // 크지 않다고 판단.
        const english = translatedSentences[i];
        const korean = translatedSentences[i + 1] ?? "";

        // Map에 저장 (정규화 키로 일관성 유지)
        extractedScriptMap.set(normalizeText(english), korean);
      }

      console.log(extractedScriptMap);

      
    } else {
      // translatedText가 null인 경우, 에러 처리 또는 건너뛰기
      console.error("Error: fetchScript returned null");
    }

    // 옵저버 재생성 대신 상태만 갱신하고 단일 옵저버 보장
    STATE.translations = extractedScriptMap;
    ensureObserver();
    console.log("Observer ensured/updated for new translations.");

    // 번역된 chunk가 translations Map에 추가되었으므로, 최초 1회만 프라임을 수행합니다.
    console.log("process callback 실행 바로 직전");
    if (isInitialChunk) {
      isInitialChunk = false; // 최초 chunk 처리 완료 후 false로 변경
      hideLoadingIndicator(); // 최초 chunk 처리 완료 후 로딩 인디케이터 숨김
      startInitialPolling();
    }
  }

  // 모든 번역이 완료된 후, 최종 translations Map을 반환.
  return extractedScriptMap;
}

/**
 * Auto 모드: API 기반 자동 번역 실행.
 */
async function handleAutoMode() {
  shadowDomInit("auto");
  openSidebarAndExtractTranscript();

  try {
    const finalTranslations = await process();
    
    if (!finalTranslations?.size) {
      console.warn("finalTranslations가 존재하지 않거나 이미 저장되어 있습니다.");
      return;
    }

    const title = extractTitle();
    if (!title) {
      console.error("Failed to extract title.");
      return;
    }

    console.log("final translation:", finalTranslations);
    saveTranslation(title, finalTranslations);
  } catch (error) {
    console.error("process 함수 실행 중 에러 발생:", error);
  }
}

/**
 * User 모드: 사용자가 업로드한 번역 파일 처리.
 */
async function handleUserMode() {
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
      console.error("Failed to process the translation file:", error);
    }
  };
  
  fileInput.click();
}

// 모드별 핸들러 맵
const modeHandlers = {
  auto: handleAutoMode,
  user: handleUserMode,
};

// 메시지 리스너: 확장 프로그램 실행 진입점
chrome.runtime.onMessage.addListener((request) => {
  if (request.action !== "updateSubtitles") return;
  
  resetState();
  const handler = modeHandlers[request.mode];
  handler?.();
});
