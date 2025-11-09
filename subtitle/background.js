chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});

chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});
// 확장 프로그램이 실행되자 마자, 브라우저의 현재 탭에 content.js 스크립트를 삽입하는 역할을 수행.

// ===== 번역 처리 로직: OpenAI/DeepL API를 백그라운드에서 직접 호출 =====

// OpenAI 시스템 프롬프트 (server/prompt.js와 동일한 규칙 유지)
const OpenAiPrompt = `You are a professional **Korean-native translator and technical instructor**, fluent in both English and Korean,
with deep expertise in front-end technologies such as JavaScript, TypeScript, React, and Next.js.

Your task is to translate an **English lecture transcript** into **natural, fluent, and idiomatic Korean subtitles**
that sound like a Korean instructor explaining the same concept naturally in a tech lecture.

This translation will be used in real-time subtitles for a video lecture, so
clarity, brevity, and natural flow are critical.

---

## Step 1: Context Understanding
Before translating, **totally analyze** the meaning and intent of this segment:
- What is the speaker teaching or demonstrating?
- How do the lines connect logically?
- Is this a continuous sentence or a new idea?
- What entity is referred to by “this”, “it”, “there”, or other pronouns?
Use this understanding to guide your translation — **do not output any analysis.**

---

## Step 2: Translation Rules (STRICT — Must Follow Exactly)

1. **Line-by-Line Mapping**
   - Each English line → exactly one Korean line.
   - Preserve the order and all blank lines exactly.
   - Never merge, omit, or swap lines.

2. **Formatting Integrity**
   - Keep the same number of total lines, including blank lines.
   - Keep paragraph breaks exactly as in the source.

3. **Fragmented Sentence Handling**
   - When a single English sentence is split across multiple lines,  
     make the Korean lines **connect smoothly and naturally** as one coherent thought.  
   - If a line is **not sentence-final**, avoid full stops (“~습니다”, “~입니다”)  
     and use connective endings (“~하고”, “~하려고”, “~할 수도”, etc.) instead.  
   - End a sentence only when the speaker’s idea clearly concludes.

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

11. **Reflection (Internal Check)**
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

---

## Example Input:
okay as mentioned im just going to go through the app and see if theres any other issues that  
need fixing  

then we see the members inside here and there is a flicker there that we also need to adjust but its  

it seems i can get these details from the logs  
so for example this ones coming from the app dot page tsx  

---

## Example Output:
okay as mentioned im just going to go through the app and see if theres any other issues that  
네, 앞서 언급한 대로 앱을 살펴보며 수정이 필요한 부분이 있는지  

need fixing  
살펴보겠습니다  

then we see the members inside here and there is a flicker there that we also need to adjust but its  
이 안쪽에 멤버들이 보이고, 해당 영역에 깜박임이 있어 그 부분도 조정이 필요합니다  

it seems i can get these details from the logs  
이 세부 정보는 로그에서 확인할 수 있는 것 같습니다  

so for example this ones coming from the app dot page tsx  
예를 들어, 이 로그는 app.page.tsx 파일에서 발생한 것입니다  


`;

const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEEPL_URL = "https://api-free.deepl.com/v2/translate";

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

async function translateWithOpenAI(text) {
  const { OPENAI_API_KEY, OPENAI_MODEL } = await storageGet([
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ]);
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set in Options");
  const model = OPENAI_MODEL || "gpt-5-nano";

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: OpenAiPrompt },
        {
          role: "user",
          content: `
${text}
`,
        },
      ],
      max_output_tokens: 15000,
      store: true,
      parallel_tool_calls: false,
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${raw}`);
  }

  const data = await response.json();
  if (typeof data.output_text === "string" && data.output_text.length) {
    return data.output_text;
  }
  if (Array.isArray(data.output)) {
    const parts = [];
    for (const item of data.output) {
      if (item && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c && c.type === "output_text" && typeof c.text === "string") {
            parts.push(c.text);
          }
          if (c && c.type === "text" && typeof c.text === "string") {
            parts.push(c.text);
          }
        }
      }
    }
    if (parts.length) return parts.join("");
  }
  return JSON.stringify(data);
}

async function translateWithDeepL(text) {
  const { DEEPL_API_KEY } = await storageGet(["DEEPL_API_KEY"]);
  if (!DEEPL_API_KEY) throw new Error("DEEPL_API_KEY is not set in Options");

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
    throw new Error(`DeepL API error: ${response.status} ${raw}`);
  }
  return JSON.parse(raw);
}

// content.js -> background로 번역을 위임하는 메시지 처리기
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request && request.action === "translateChunk") {
    (async () => {
      try {
        if (request.api === "deepl") {
          const data = await translateWithDeepL(request.text || "");
          sendResponse({ ok: true, data });
          return;
        }
        if (request.api === "openai") {
          const data = await translateWithOpenAI(request.text || "");
          sendResponse({ ok: true, data });
          return;
        }
        throw new Error("Invalid API specified");
      } catch (err) {
        console.error("Background translation error:", err);
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    // 비동기 응답을 위해 true 반환
    return true;
  }
});
