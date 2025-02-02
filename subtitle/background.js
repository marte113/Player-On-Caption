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
