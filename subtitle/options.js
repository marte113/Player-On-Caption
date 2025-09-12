// 옵션 페이지에서 API 키를 저장/로드

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (items) => resolve(items));
  });
}

function storageSet(items) {
  return new Promise((resolve) => {
    chrome.storage.local.set(items, () => resolve());
  });
}

async function init() {
  const $openaiKey = document.getElementById("openaiKey");
  const $openaiModel = document.getElementById("openaiModel");
  const $deeplKey = document.getElementById("deeplKey");
  const $saveBtn = document.getElementById("saveBtn");
  const $status = document.getElementById("status");

  const { OPENAI_API_KEY, OPENAI_MODEL, DEEPL_API_KEY } = await storageGet([
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "DEEPL_API_KEY",
  ]);

  if (OPENAI_API_KEY) $openaiKey.value = OPENAI_API_KEY;
  if (OPENAI_MODEL) $openaiModel.value = OPENAI_MODEL;
  if (DEEPL_API_KEY) $deeplKey.value = DEEPL_API_KEY;

  $saveBtn.addEventListener("click", async () => {
    $saveBtn.disabled = true;
    $status.textContent = "저장 중...";

    await storageSet({
      OPENAI_API_KEY: $openaiKey.value.trim(),
      OPENAI_MODEL: $openaiModel.value.trim(),
      DEEPL_API_KEY: $deeplKey.value.trim(),
    });

    $status.textContent = "저장되었습니다.";
    $saveBtn.disabled = false;
    setTimeout(() => ($status.textContent = ""), 2000);
  });
}

document.addEventListener("DOMContentLoaded", init);
