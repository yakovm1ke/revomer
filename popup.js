"use strict";

const pickBtn = document.getElementById("pick-btn");
const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const statusEl = document.getElementById("status");
const statusTextEl = document.getElementById("status-text");
const undoBtn = document.getElementById("undo-btn");
const newSelectorInput = document.getElementById("new-selector");
const addBtn = document.getElementById("add-btn");
const clearBtn = document.getElementById("clear-btn");

let tabId = null;
let items = [];
let undoState = null;
let undoTimer = null;

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

function showStatus(text, withUndo = false) {
  statusTextEl.textContent = text;
  statusEl.hidden = !text;
  undoBtn.hidden = !withUndo;
}

function requestUndo(snapshot, message) {
  undoState = { items: snapshot };
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoState = null;
    showStatus("");
  }, 5000);
  showStatus(message, true);
}

undoBtn.addEventListener("click", async () => {
  if (!undoState) return;
  clearTimeout(undoTimer);
  items = undoState.items;
  undoState = null;
  showStatus("");
  await syncState();
  render();
});

function render() {
  listEl.textContent = "";
  emptyEl.hidden = items.length > 0;
  clearBtn.hidden = items.length === 0;

  items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "item";

    const row = document.createElement("div");
    row.className = "item__row";

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
      const snapshot = items.slice();
      items.splice(index, 1);
      syncState();
      render();
      requestUndo(snapshot, "Правило удалено.");
    });

    const commentInput = document.createElement("input");
    commentInput.type = "text";
    commentInput.className = "item__caption";
    commentInput.value = item.comment || "";
    commentInput.placeholder = "Подпись";
    commentInput.title = "Подпись к правилу";
    commentInput.addEventListener("change", () => {
      items[index].comment = commentInput.value.trim();
      syncState();
    });

    row.append(checkbox, input, removeBtn);
    li.append(row, commentInput);
    listEl.appendChild(li);
  });
}

async function syncState() {
  try {
    await sendToContent({ type: "REVOMER_SET_STATE", items });
    if (!undoState) showStatus("");
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
  items.push({ id: generateId(), selector, hidden: true, comment: "" });
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

clearBtn.addEventListener("click", async () => {
  if (items.length === 0) return;
  const confirmed = window.confirm(
    "Удалить все элементы из списка? Скрытые элементы на странице снова появятся."
  );
  if (!confirmed) return;
  const snapshot = items.slice();
  items = [];
  await syncState();
  render();
  requestUndo(snapshot, `Удалено правил: ${snapshot.length}.`);
});

pickBtn.addEventListener("click", async () => {
  try {
    await sendToContent({ type: "REVOMER_PICK" });
    window.close();
  } catch {
    showStatus("Не удалось запустить выбор элемента. Обновите страницу.");
  }
});
