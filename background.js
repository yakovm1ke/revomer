"use strict";

chrome.action.setBadgeBackgroundColor({ color: "#ff8c00" });
if (typeof chrome.action.setBadgeTextColor === "function") {
  chrome.action.setBadgeTextColor({ color: "#14100a" });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "REVOMER_BADGE") return;
  if (!sender.tab || typeof sender.tab.id !== "number") return;

  const count = Number(message.count) || 0;
  chrome.action.setBadgeText({
    tabId: sender.tab.id,
    text: count > 0 ? (count > 999 ? "999+" : String(count)) : "",
  });
});
