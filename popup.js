"use strict";

const pickBtn = document.getElementById("pick-btn");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const newSelectorInput = document.getElementById("new-selector");
const addBtn = document.getElementById("add-btn");

let tabId = null;
let items = [];

init();

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    showStatus("Активная вкладка не найдена.");
    setControlsDisabled(true);
    return;
  }
  tabId = tab.id;
  await refresh();
}

function sendToContent(message) {
  return chrome.tabs.sendMessage(tabId, message);
}

async function refresh() {
  try {
    const response = await sendToContent({ type: "REVOMER_GET_STATE" });
    items = response && response.ok && Array.isArray(response.items) ? response.items : [];
    showStatus("");
  } catch {
    items = [];
    showStatus("Не удалось подключиться к странице. Обновите её и попробуйте снова.");
    setControlsDisabled(true);
  }
  render();
}

function setControlsDisabled(disabled) {
  pickBtn.disabled = disabled;
  addBtn.disabled = disabled;
  newSelectorInput.disabled = disabled;
}

function showStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

function render() {
  listEl.textContent = "";
  emptyEl.hidden = items.length > 0;

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "item__checkbox";
    checkbox.checked = item.hidden;
    checkbox.title = "Скрыть элемент";
    checkbox.addEventListener("change", () => {
      items[index].hidden = checkbox.checked;
      syncState();
    });

    const input = document.createElement("input");
    input.type = "text";
    input.className = "item__selector";
    input.value = item.selector;
    input.title = "CSS-селектор";
    input.addEventListener("change", () => {
      items[index].selector = input.value.trim();
      syncState();
    });

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "item__remove";
    removeBtn.title = "Удалить из списка";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      items.splice(index, 1);
      syncState();
      render();
    });

    li.append(checkbox, input, removeBtn);
    listEl.appendChild(li);
  });
}

async function syncState() {
  try {
    await sendToContent({ type: "REVOMER_SET_STATE", items });
    showStatus("");
  } catch {
    showStatus("Не удалось сохранить изменения.");
  }
}

function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function addManualItem() {
  const selector = newSelectorInput.value.trim();
  if (!selector) return;
  items.push({ id: generateId(), selector, hidden: true });
  newSelectorInput.value = "";
  await syncState();
  render();
}

addBtn.addEventListener("click", addManualItem);

newSelectorInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addManualItem();
  }
});

pickBtn.addEventListener("click", async () => {
  try {
    await sendToContent({ type: "REVOMER_PICK" });
    window.close();
  } catch {
    showStatus("Не удалось запустить выбор элемента. Обновите страницу.");
  }
});
