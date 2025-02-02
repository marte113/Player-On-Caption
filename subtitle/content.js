
//DB Part
const DB_NAME = "udemy-translator-db";
const DB_VERSION = 1;
const STORE_NAME = "translations";

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
};

async function saveTranslation(title, translations) {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put({ title, translations });

    request.onsuccess = () => {
      console.log("Translation saved successfully:", title);
      resolve();
    };

    request.onerror = (event) => {
      console.error("Failed to save translation:", event.target.error);
      reject(event.target.error);
    };
  });
};

async function getTranslation(title) {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(title);

    request.onsuccess = () => {
      resolve(request.result ? request.result.translations : null);
    };

    request.onerror = (event) => {
      console.error("Failed to get translation:", event.target.error);
      reject(event.target.error);
    };
  });
};




// 텍스트 정규화 함수
function normalizeText(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9가-힣\s]/g, "");
}

//대본을 추출하기 위해서는 대본이 띄워지는 사이드바를 작동시켜서 마운트 시켜야함.
function openSidebarAndExtractTranscript() {
  const transcriptButton = document.querySelector(
    '[data-purpose="transcript-toggle"]'
  );
  if (!transcriptButton) {
    console.error("Transcript button not found.");
    return;
  }

  // 버튼이 이미 클릭된 상태인지 확인 (토글 버튼인 경우)
  if (transcriptButton.getAttribute("aria-expanded") === "true") {
    //해당 영역이 이미 열려 있는 상태라면 아무 동작도 하지 않고 함수 종료.
    return;
  }

  // 버튼 클릭 이벤트 강제 실행
  transcriptButton.click();
}

//강의 제목 추출
function extractTitle() {
  console.log("extractTitle 실행");
  const titleElem = document.querySelector("section.lecture-view--container--mrZSm");
  let title = null;
  if(titleElem) {
    title = titleElem.getAttribute("aria-label");
  }else {
  console.error("해당 class를 가진 section 요소가 존재하지 않습니다.");
}
  console.log("title :", title);

  return title;
}


//강의 대본 추출
function extractScript() {
  console.log("extractTranscript 실행");
  const cueContainers = document.querySelectorAll(
    "div.transcript--cue-container--Vuwj6"
  );
  const scriptMap = new Map();

  cueContainers.forEach((container) => {
    const cueTextElement = container.querySelector(
      "span[data-purpose='cue-text']"
    );
    if (cueTextElement) {
      const normalizedText = normalizeText(cueTextElement.innerText);
      scriptMap.set(normalizedText, "");
    }
  });
  console.log("대본 추출", scriptMap);
  return scriptMap;
}


//대본을 여러 덩어리로 나눔
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

async function fetchScript(text, api) {
  try {
    const response = await fetch("http://localhost:5004/translate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text, api }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Proxy Server Error:", errorData);
      throw new Error(
        `Proxy server request failed with status ${response.status}`
      );
    }

    const data = await response.json();

    // DeepL API의 경우 data.translations[0].text를 반환
    if (api === "deepl") {
      return data.translations[0].text;
    }
    // OpenAI API의 경우 data를 직접 반환
    return data;
  } catch (error) {
    console.error("Translation error:", error);
    return null;
  }
}



// 번역된 텍스트 파일을 읽어와 Map 객체로 변환
async function readTranslationFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const lines = event.target.result.split(/\r?\n/);
      const translations = new Map();
      let english = "";

      lines.forEach((line) => {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          if (!english) {
            english = normalizeText(trimmedLine); // 영어 문장
          } else {
            translations.set(english, trimmedLine); // 한국어 번역 매핑
            english = ""; // 다음 쌍 준비
          }
        }
      });
      resolve(translations);
    };
    reader.onerror = reject;
    reader.readAsText(file, "UTF-8");
  });
}

function shadowDomInit(mode) {
  console.log("shadowDomInit 실행");
  const container = document.querySelector("div.well--container--afdWD");

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

  if (mode === "auto") {
    const loadingIndicator = document.createElement("div");
    loadingIndicator.id = "loading-indicator";
    loadingIndicator.innerHTML = `
    <div class="spinner"></div>
  `;
    shadowRoot.appendChild(loadingIndicator);
  }
}

// 로딩 인디케이터 표시 함수
function showLoadingIndicator() {
  console.log("showLoadingIndicator 실행");
  const container = document.querySelector("div.well--container--afdWD");
  const shadowRoot = container.shadowRoot;
  const indicator = shadowRoot.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = "block"; // flex 또는 block 등으로 표시
  }
}

// 로딩 인디케이터 숨김 함수
function hideLoadingIndicator() {
  console.log("hideLoadingIndicator 실행");
  const container = document.querySelector("div.well--container--afdWD");
  const shadowRoot = container.shadowRoot;
  const indicator = shadowRoot.getElementById("loading-indicator");
  if (indicator) {
    indicator.style.display = "none";
  }
}

// 자막 업데이트
function updateSubtitles(translations) {
  console.log("updateSubtitles 실행");
  const subtitleElements = document.querySelectorAll("span.well--text--J1-Qi");

  subtitleElements.forEach((subtitleElement) => {
    const englishText = normalizeText(subtitleElement.innerText);
    const koreanText = translations.get(englishText);
    if (koreanText) {
      const container = subtitleElement.closest("div.well--container--afdWD");
      if (!container) {
        console.log("Container not found!");
        return;
      }

      // ShadowRoot 가져오기
      const shadowRoot = container.shadowRoot;
      if (!shadowRoot) {
        console.log("ShadowRoot not found!");
        return;
      }

      // Shadow DOM 내부에서 자막 요소 찾기
      let engSubElem = shadowRoot.querySelector(".english-subtitle");
      let korSubElem = shadowRoot.querySelector(".korean-subtitle");

      if (!engSubElem) {
        console.log("Cannot find 'english-subtitle' element in ShadowRoot");
        return;
      }

      if (!korSubElem) {
        console.log("Cannot find 'korean-subtitle' element in ShadowRoot");
        return;
      }

      // 자막 업데이트
      engSubElem.innerText = subtitleElement.innerText;
      korSubElem.innerText = koreanText;
    }
  });
}

function autoObserveSubtitles(translations, currentObserver) {
  // 기존 observer가 있으면 disconnect
  if (currentObserver && currentObserver.disconnect) {
    currentObserver.disconnect();
  }

  const targetNode = document.querySelector("span.well--text--J1-Qi");
  if (!targetNode) return null;

  const observer = new MutationObserver(() => updateSubtitles(translations));
  observer.observe(targetNode, {
    characterData: true,
    subtree: true,
    childList: true,
  });

  console.log("New observer set up for updated translations.");
  return observer;
}

// 자막 텍스트 변화 감지
function observeSubtitles(translations) {
  const targetNode = document.querySelector("span.well--text--J1-Qi");
  if (!targetNode) return;

  const observer = new MutationObserver(() => updateSubtitles(translations));
  observer.observe(targetNode, {
    characterData: true,
    subtree: true,
    childList: true,
  });
}

function setupInitialPolling(translations, duration = 4000) {
  const videoElement = document.querySelector("video");
  if (!videoElement) return;

  let intervalId;
  const startTime = Date.now();

  const startUpdating = () => {
    intervalId = setInterval(() => {
      if (!videoElement.paused) {
        updateSubtitles(translations);
        
        // 4초가 지나면 폴링 중단
        if (Date.now() - startTime >= duration) {
          clearInterval(intervalId);
          console.log("Initial polling completed, switching to Observer mode");
        }
      }
    }, 500); // 더 빈번한 업데이트를 위해 100ms 간격으로 설정
  };

  startUpdating();
} // 초기 observer 컨텍스트가 준비될 때 까지 폴링 사용.

// 비디오 상태 업데이트
function setupSubtitleUpdater(translations) {
  const videoElement = document.querySelector("video");
  if (!videoElement) return;

  let intervalId;

  const startUpdating = () => {
    intervalId = setInterval(() => {
      if (!videoElement.paused) updateSubtitles(translations);
    }, 1000); // 1초 간격
  };

  const stopUpdating = () => clearInterval(intervalId);

  videoElement.addEventListener("play", startUpdating);
  videoElement.addEventListener("pause", stopUpdating);
  videoElement.addEventListener("ended", stopUpdating);

  if (!videoElement.paused) startUpdating();
}

async function process() {
  console.log("process 최초 실행");
  let isInitialChunk = true;
  let currentObserver = null;
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
    console.log("기존의 번역이 map객체화 되기 전의 형태", existingTranslation );
    //const translations = new Map(Object.entries(existingTranslation));
    //console.log("기존 번역을 반환합니다:", translations);
    hideLoadingIndicator();
    setupInitialPolling(existingTranslation,4000);
    autoObserveSubtitles(existingTranslation, null); // 기존 번역을 사용하여 자막 관찰 시작
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
        const english = translatedSentences[i];
        const korean = translatedSentences[i + 1] ?? "";
      
        // Map에 저장
        extractedScriptMap.set(english, korean);
      }

      console.log(extractedScriptMap);

      // 번역된 문장들을 translations Map에 저장합니다.
      // for (let i = 0; i < chunk.length; i++) {
      //   if (translatedSentences[i]) {
      //     translations.set(normalizeText(chunk[i]), translatedSentences[i]);
      //   }
      // }
    } else {
      // translatedText가 null인 경우, 에러 처리 또는 건너뛰기
      console.error("Error: fetchScript returned null");
    }

    currentObserver = autoObserveSubtitles(extractedScriptMap, currentObserver);
    console.log("Observer updated for new translations.");

    // 번역된 chunk가 translations Map에 추가되었으므로, callback 함수를 호출합니다.
    console.log("process callback 실행 바로 직전");
    if (isInitialChunk) {
      isInitialChunk = false; // 최초 chunk 처리 완료 후 false로 변경
      hideLoadingIndicator(); // 최초 chunk 처리 완료 후 로딩 인디케이터 숨김
      setupInitialPolling(extractedScriptMap,4000);
    }
  }

  // 모든 번역이 완료된 후, 최종 translations Map을 반환.
  return extractedScriptMap;
}


// 번역 파일 처리 및 자막 업데이트 시작

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "updateSubtitles") {
    if (request.mode === "auto") {
      (async () => {
        shadowDomInit("auto");
        openSidebarAndExtractTranscript();
        

        try {
          const finalTranslations = await process();
          if (finalTranslations && finalTranslations.size > 0) {
            const title = extractTitle();
            if (!title) {
              console.error("Failed to extract title.");
            }
            // finalTranslations가 존재하고 비어있지 않을 때만 실행
            console.log("final translation:", finalTranslations);
            saveTranslation(title, finalTranslations);
            // 이미 process 함수 내에서 autoObserveSubtitles를 호출함
          } else {
            console.warn("finalTranslations가 존재하지 않거나 이미 저장 되어있습니다..");
          }
        } catch (error) {
          console.error("process 함수 실행 중 에러 발생:", error);
        }
      })();
    } else if (request.mode === "user") {
      // 기존 로직 실행
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".txt";
      fileInput.onchange = async () => {
        try {
          shadowDomInit("text");
          const translations = await readTranslationFile(fileInput.files[0]);
          observeSubtitles(translations);
          //setupSubtitleUpdater(translations);
        } catch (error) {
          console.error("Failed to process the translation file:", error);
        }
      };
      fileInput.click();
    }
  }
});
