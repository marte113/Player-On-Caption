// 자동 번역 모드 버튼 클릭 이벤트
document.getElementById("autoTranslateBtn").addEventListener("click", () => {
  console.log("auto button clicked");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "updateSubtitles",
      mode: "auto",
    });
  });
});

// 사용자 번역 모드 버튼 클릭 이벤트 (기존 코드 수정)
document.getElementById("userTranslateBtn").addEventListener("click", () => {
  console.log("Upload button clicked");
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    console.log("Sending message to content script");
    chrome.tabs.sendMessage(tabs[0].id, {
      action: "updateSubtitles",
      mode: "user",
    });
  });
});

//background.js에서 content.js 스크립트가 브라우저의 현재 탭에 설치되고 나서 popup.html에서의 사용자의 선택에 따라,
//content.js에서 어떤 동작을 실