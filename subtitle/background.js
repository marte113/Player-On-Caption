// ============================================
// 기본 훅: 설치/아이콘 클릭 시 content.js 주입 (기존 유지)
// ============================================
chrome.runtime.onInstalled.addListener(() => {
  console.log("[BG] Extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  console.log("[BG] Action clicked, inject content.js");
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});

// ============================================
// OpenAI/DeepL 호출 설정
// ============================================

// OpenAI 시스템 프롬프트 (고정/캐시 대상) — 버전 태그 유지
const OpenAiPrompt = `You are a professional **Korean-native translator and technical instructor**, fluent in both English and Korean,
with deep expertise in front-end technologies such as JavaScript, TypeScript, React, and Next.js.

Your task is to translate an **English lecture transcript** into **natural, fluent, and idiomatic Korean subtitles**
that sound like a Korean instructor explaining the same concept naturally in a tech lecture.

This translation will be used in real-time subtitles for a video lecture, so
clarity, brevity, and natural flow are critical.

---

## Step 1: Deep Context Analysis (CRITICAL)
Before translating any line, you MUST perform this analysis:

1. **Sentence Boundary Detection**
   - Is this line part of a longer sentence split across multiple lines?
   - Where does the actual sentence start and end?
   - Identify which lines form one complete thought.

2. **Meaning Distribution Planning**
   - For multi-line sentences, plan how to distribute meaning across Korean lines.
   - NEVER complete the full meaning in the first line if more lines follow.
   - Each Korean line should feel incomplete until the sentence ends.

3. **Contextual Understanding**
   - What is the speaker teaching or demonstrating?
   - How do the lines connect logically?
   - What entity is referred to by "this", "it", "there", or other pronouns?

Use this analysis to guide your translation — **do not output any analysis.**

---

## Step 2: Translation Rules (STRICT — Must Follow Exactly)

1. **Line-by-Line Mapping**
   - Each English line → exactly one Korean line.
   - Preserve the order and all blank lines exactly.
   - Never merge, omit, or swap lines.

2. **Formatting Integrity**
   - Keep the same number of total lines, including blank lines.
   - Keep paragraph breaks exactly as in the source.

3. **Fragmented Sentence Handling (STRICT RULE)**
   
   When a single English sentence is split across multiple lines, follow these **situation-specific strategies**:
   
   ---
   
   **CASE 1: Complete sentence + short ending (1-3 words)**
   
   Strategy: **Timing Priority** - Keep the final Korean line SHORT to match subtitle timing.
   
   Example:
   """
   English:
   we need to make sure this component renders properly
   when mounted.                                           (2 words)
   
   ✅ CORRECT (timing-balanced):
   이 컴포넌트가 마운트될 때 올바르게 렌더링되도록
   해야 합니다                                             (short)
   
   ❌ WRONG (2nd line too long):
   이 컴포넌트가 마운트될 때
   올바르게 렌더링되도록 해야 합니다                          (too long for 2-word English)
   """
   
   ---
   
   **CASE 2: Sentence ending with only particles/endings**
   
   Strategy: **Natural Korean Structure** - Keep the grammatical unit intact, even if awkward split.
   
   Example:
   """
   English:
   you can see the value here
   right?                                                   (1 word)
   
   ✅ CORRECT (natural Korean, preserves line split):
   여기서 값을 볼 수
   있겠죠?
   
   ❌ WRONG (merges lines):
   여기 값이 보이시죠?
   (empty line)
   """
   
   ---
   
   **CASE 3: Complex noun phrases or compound terms**
   
   Strategy: **Natural Korean Structure Priority** - Follow Korean syntax naturally, even if 2nd line is longer.
   
   Example:
   """
   English:
   we're going to implement a state management solution
   using Redux.                                             (2 words)
   
   ✅ CORRECT (natural Korean word order):
   Redux를 사용하여 상태 관리 솔루션을
   구현할 예정입니다                                         (longer 2nd line is OK)
   
   ❌ WRONG (forced short 2nd line, awkward):
   상태 관리 솔루션을 구현할 건데
   Redux를 사용해서요
   """
   
   ---
   
   **CASE 4: Short additive phrases (and more, etc., too)**
   
   Strategy: **Paraphrase for Conciseness** - Integrate meaning smoothly into one complete thought.
   
   Example:
   """
   English:
   this function will handle all the validation logic
   and more.                                                (2 words)
   
   ✅ CORRECT (paraphrased, concise):
   이 함수는 검증 로직 등을 포괄적으로
   처리합니다
   
   ❌ WRONG (literal translation, awkward):
   이 함수는 모든 검증 로직을 처리하고
   그 이상도 합니다
   """
   
   ---
   
   **Priority Rules (when conflicts arise):**
   1. Preserve line count (absolute)
   2. Apply case-specific strategy above
   3. Natural Korean flow
   4. Meaning completeness in final line

4. **Natural Korean Word Order (Conditional Reordering Rule)**
   - You may reorder phrases across adjacent lines for fluency —  
     but keep one Korean line per English line.
   - Adjust word order to reflect **natural Korean syntax**, not English order.

5. **Pronoun Clarification Rule**
   - Replace ambiguous pronouns (“this”, “it”, “there”) with clear referents  
     such as “이 부분”, “이 코드”, “해당 컴포넌트”, etc., when the context allows.  
   - Keep sentences concise — avoid over-explaining.  
   - Example:
     """
     then we see the members inside here and there is a flicker there
     여기에 멤버들이 보이고, 이 부분에도 깜박임 현상이 있습니다
     """

6. **Repetition Compression Rule**
   - If two consecutive lines repeat the same idea (e.g., “check for issues” + “need fixing”),  
     make the second line concise by completing or connecting the first naturally,  
     **instead of re-stating it**.  
     Example:
     """
     okay as mentioned im just going to go through the app and see if theres any other issues that
     need fixing
     """
     ✅ Correct:
     """
     네, 앞서 언급한 대로 앱을 살펴보며 수정이 필요한 부분이 있는지
     살펴보겠습니다
     """

7. **Subtitle Brevity Optimization**
   - Keep each Korean line concise and readable within ≈ 2 seconds.  
   - Prefer shorter, direct expressions when multiple equivalents exist.  
   - Focus on conveying the main meaning clearly.

8. **Tone and Style**
   - Maintain a consistent formal, explanatory tone (“~합니다”, “~입니다”).  
   - Avoid casual endings.  
   - Sound like a confident Korean tech instructor.

9. **Terminology Accuracy**
   - Use established Korean developer terms: “컴포넌트”, “렌더링”, “프로퍼티”, “생성자”, etc.  
   - Avoid literal syntax translations; prioritize readability and idiomatic phrasing.

10. **Cross-Chunk Continuity**
    - Assume the current segment continues from earlier parts.  
    - Keep consistent terminology and tone.

11. **Reflection (Internal Check)
    - Before finalizing, confirm internally that  
      (a) each line reads fluently and clearly,  
      (b) pronouns are unambiguous,  
      (c) no line feels redundant or overly long for subtitles.  
    - Do not output this reflection.

---

## Output Format
Respond **only** with alternating lines:
- English line  
- Korean translation line  
(Include blank lines where they exist.)

No explanations, notes, or extra formatting.
`;

// API 엔드포인트
const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

// ============================================
// 유틸: 스토리지 접근
// ============================================
function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

function approxTokens(str) {
  return Math.ceil((str || "").length / 4);
}

function pickMaxOut(systemPrompt, userText, {
  ctx = 400_000,
  modelMax = 128_000,
  desired = 12_000,
  safety = 1500
} = {}) {
  const inTokens = approxTokens(systemPrompt) + approxTokens(userText);
  const available = Math.max(0, ctx - inTokens - safety);
  return Math.max(512, Math.min(desired, Math.min(available, modelMax)));
}

// ============================================
// SSE 스트리밍 (Port 방식)
// ============================================
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "udemy-translate") return;
  console.log("[BG] Port connected:", port.name);

  let aborted = false;
  let controller = null;

  port.onDisconnect.addListener(() => {
    aborted = true;
    console.log("[BG] Port disconnected; abort fetch if running");
    try { controller?.abort(); } catch {}
  });

  port.onMessage.addListener(async (msg) => {
    if (msg?.type !== "start" || typeof msg.text !== "string") return;
    console.log("[BG] start received from content; textLen:", msg.text.length);
    try {
      await streamTranslateWholeWithOpenAI(msg.text, port, (ctr) => (controller = ctr));
    } catch (err) {
      console.error("[BG] streamTranslateWholeWithOpenAI error:", err);
      if (!aborted) {
        port.postMessage({ type: "error", error: err?.message || String(err) });
        try { port.disconnect(); } catch {}
      }
    }
  });
});

async function streamTranslateWholeWithOpenAI(fullText, port, setController) {
  const { OPENAI_API_KEY, OPENAI_MODEL } = await storageGet(["OPENAI_API_KEY", "OPENAI_MODEL"]);
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set in Options");
  const model = OPENAI_MODEL || "gpt-5-nano";
  const maxOut = pickMaxOut(OpenAiPrompt, fullText);

  console.log("[BG] OpenAI request ->", { model, maxOut, inputLen: fullText.length });

  const controller = new AbortController();
  setController?.(controller);

  const resp = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: String(fullText || ""),
      instructions: OpenAiPrompt,
      stream: true,
      max_output_tokens: maxOut,
      text: {
        verbosity: "medium",
      },
      reasoning: {
        effort: "minimal",
      },
    }),
    signal: controller.signal,
  });

  console.log("[BG] OpenAI response status:", resp.status, resp.statusText);
  if (!resp.ok || !resp.body) {
    const raw = await resp.text().catch(() => "");
    console.error("[BG] OpenAI bad response:", resp.status, raw.slice(0, 200));
    throw new Error(`OpenAI API error: ${resp.status} ${raw}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let sseBuffer = "";
  let deltaCount = 0;

  // console.log("[BG] SSE read loop start");

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = sseBuffer.indexOf("\n\n")) >= 0) {
      const frame = sseBuffer.slice(0, idx);
      sseBuffer = sseBuffer.slice(idx + 2);

      const lines = frame.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          // console.log("[BG] SSE [DONE] received");
          port.postMessage({ type: "done" });
          continue;
        }
        try {
          const evt = JSON.parse(data);

          // Responses API 스트리밍 형식: response.output_text.delta
          if (evt?.type === "response.output_text.delta" && typeof evt.delta === "string") {
            deltaCount++;
            // if (deltaCount <= 5 || deltaCount % 20 === 0) {
            //   console.log("[BG] delta#", deltaCount, "snippet:", evt.delta.slice(0, 80));
            // }
            port.postMessage({ type: "delta", text: evt.delta });
          }

          // 완료 신호 감지
          if (evt?.type === "response.completed") {
            // console.log("[BG] SSE completed (event)");
            port.postMessage({ type: "done" });
          }

          // 에러 처리
          if (evt?.type === "response.error") {
            console.error("[BG] SSE error event:", evt?.error);
            port.postMessage({ type: "error", error: evt?.error || "streaming error" });
          }
        } catch (e) {
          console.warn("[BG] SSE parse warn:", e);
        }
      }
    }
  }

  // console.log("[BG] SSE reader EOF; sending done");
  port.postMessage({ type: "done" });
}

// ============================================
// DeepL / 기존 단건 번역 (호환 유지)
// ============================================
async function translateWithDeepL(text) {
  const { DEEPL_API_KEY } = await storageGet(["DEEPL_API_KEY"]);
  if (!DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is not set in Options");

  console.log("[BG] DeepL request len:", text.length);
  const response = await fetch(DEEPL_URL, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `text=${encodeURIComponent(text)}&target_lang=KO&tag_handling=xml`,
  });

  const raw = await response.text();
  if (!response.ok) {
    console.error("[BG] DeepL error:", response.status, raw.slice(0, 200));
    throw new Error(`DeepL API error: ${response.status} ${raw}`);
  }
  console.log("[BG] DeepL OK");
  return JSON.parse(raw);
}

// ============================================
// 메시지 라우터 (청크 호환)
// ============================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request) return;

  if (request.action === "translateChunk") {
    (async () => {
      try {
        if (request.api === "deepl") {
          const data = await translateWithDeepL(request.text || "");
          sendResponse({ ok: true, data });
          return;
        }
        throw new Error("Invalid API specified");
      } catch (err) {
        console.error("[BG] translateChunk error:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }
});
