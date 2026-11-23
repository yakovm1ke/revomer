(() => {
  "use strict";

  const STORAGE_KEY = "revomer";
  const STYLE_TAG_ID = "revomer-style";
  const PICKER_CURSOR_STYLE_ID = "revomer-picker-cursor";
  const HIGHLIGHT_ID = "revomer-highlight";
  const TOOLTIP_ID = "revomer-tooltip";
  const HIDDEN_ATTR = "data-revomer-hidden";
  const ORIG_DISPLAY_ATTR = "data-revomer-orig-display";
  const MAX_SELECTOR_DEPTH = 6;

  let items = loadItems();
  let picking = false;
  let pickerHighlight = null;
  let pickerTooltip = null;
  let mutationObserver = null;
  let hoveredEl = null;

  // ---------- хранилище ----------

  function loadItems() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((item) => item && typeof item.selector === "string")
        : [];
    } catch {
      return [];
    }
  }

  function saveItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // localStorage недоступен (например, заблокирован) — работаем в памяти
    }
  }

  // ---------- применение скрытия ----------

  function ensureStyleEl() {
    let styleEl = document.getElementById(STYLE_TAG_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_TAG_ID;
      (document.head || document.documentElement).appendChild(styleEl);
    }
    return styleEl;
  }

  function isSelectorValid(selector) {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  function applyStyleTag() {
    const rules = [];
    for (const item of items) {
      if (!item.hidden) continue;
      const selector = (item.selector || "").trim();
      if (!selector || !isSelectorValid(selector)) continue;
      rules.push(`${selector} { display: none !important; }`);
    }
    ensureStyleEl().textContent = rules.join("\n");
  }

  function hideInline(el) {
    if (!el.getAttribute(HIDDEN_ATTR)) {
      if (el.style && el.style.display) {
        el.setAttribute(ORIG_DISPLAY_ATTR, el.style.display);
      }
      el.setAttribute(HIDDEN_ATTR, "1");
    }
    el.style.setProperty("display", "none", "important");
  }

  function clearInlineHidden() {
    const els = document.querySelectorAll(`[${HIDDEN_ATTR}]`);
    for (const el of els) {
      const origDisplay = el.getAttribute(ORIG_DISPLAY_ATTR);
      el.removeAttribute(HIDDEN_ATTR);
      el.removeAttribute(ORIG_DISPLAY_ATTR);
      if (origDisplay !== null) {
        el.style.setProperty("display", origDisplay);
      } else {
        el.style.removeProperty("display");
      }
    }
  }

  function applyInlineTo(root) {
    for (const item of items) {
      if (!item.hidden) continue;
      const selector = (item.selector || "").trim();
      if (!selector) continue;
      try {
        if (root.nodeType === 1 && typeof root.matches === "function" && root.matches(selector)) {
          hideInline(root);
        }
        if (typeof root.querySelectorAll === "function") {
          for (const el of root.querySelectorAll(selector)) {
            hideInline(el);
          }
        }
      } catch {
        // невалидный селектор — пропускаем
      }
    }
  }

  function ensureObserver() {
    if (mutationObserver || !document.documentElement) return;
    mutationObserver = new MutationObserver((mutations) => {
      if (!items.some((item) => item.hidden)) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) applyInlineTo(node);
        }
      }
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function applyHiding() {
    clearInlineHidden();
    applyStyleTag();
    applyInlineTo(document);
    ensureObserver();
  }

  // ---------- генерация CSS-селектора (как в DevTools) ----------

  function getCssSelector(el) {
    if (!el || el.nodeType !== 1) return "";
    if (el.id) return `#${CSS.escape(el.id)}`;

    const segments = [];
    let current = el;

    while (current && current.nodeType === 1) {
      let segment = current.tagName.toLowerCase();

      if (current.id) {
        segments.unshift(`#${CSS.escape(current.id)}`);
        break;
      }

      const classes = Array.from(current.classList || []).slice(0, 2);
      if (classes.length) {
        segment += classes.map((cls) => `.${CSS.escape(cls)}`).join("");
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (sib) => sib.tagName === current.tagName
        );
        if (siblings.length > 1) {
          segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }

      segments.unshift(segment);
      const candidate = segments.join(" > ");
      try {
        if (document.querySelectorAll(candidate).length === 1) return candidate;
      } catch {
        // селектор пока невалиден — углубляемся дальше
      }
      if (segments.length >= MAX_SELECTOR_DEPTH) break;
      current = parent;
    }

    return segments.join(" > ");
  }

  // ---------- выбор элемента на странице ----------

  function setPickingCursor(on) {
    let styleEl = document.getElementById(PICKER_CURSOR_STYLE_ID);
    if (on && !styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = PICKER_CURSOR_STYLE_ID;
      styleEl.textContent = "* { cursor: crosshair !important; }";
      (document.head || document.documentElement).appendChild(styleEl);
    } else if (!on && styleEl) {
      styleEl.remove();
    }
  }

  function ensurePickerUi() {
    let highlight = document.getElementById(HIGHLIGHT_ID);
    if (!highlight) {
      highlight = document.createElement("div");
      highlight.id = HIGHLIGHT_ID;
      Object.assign(highlight.style, {
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        border: "2px solid #4c8dff",
        background: "rgba(76, 141, 255, 0.15)",
        display: "none",
        boxSizing: "border-box",
      });
      document.documentElement.appendChild(highlight);
    }

    let tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.id = TOOLTIP_ID;
      Object.assign(tooltip.style, {
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        background: "#1f2937",
        color: "#ffffff",
        font: "12px/1.4 monospace",
        padding: "4px 8px",
        borderRadius: "4px",
        maxWidth: "60vw",
        overflowWrap: "anywhere",
        display: "none",
      });
      document.documentElement.appendChild(tooltip);
    }

    return { highlight, tooltip };
  }

  function isOwnNode(node) {
    return (
      node &&
      node.nodeType === 1 &&
      (node.id === HIGHLIGHT_ID || node.id === TOOLTIP_ID)
    );
  }

  function startPicking() {
    if (picking) return;
    picking = true;

    const ui = ensurePickerUi();
    pickerHighlight = ui.highlight;
    pickerTooltip = ui.tooltip;
    setPickingCursor(true);

    document.addEventListener("mousemove", onPickerMove, true);
    document.addEventListener("click", onPickerClick, true);
    document.addEventListener("keydown", onPickerKey, true);
  }

  function stopPicking() {
    if (!picking) return;
    picking = false;

    document.removeEventListener("mousemove", onPickerMove, true);
    document.removeEventListener("click", onPickerClick, true);
    document.removeEventListener("keydown", onPickerKey, true);

    setPickingCursor(false);
    if (pickerHighlight) {
      pickerHighlight.remove();
      pickerHighlight = null;
    }
    if (pickerTooltip) {
      pickerTooltip.remove();
      pickerTooltip = null;
    }
    hoveredEl = null;
  }

  function onPickerMove(e) {
    const target = e.target;
    if (!target || target.nodeType !== 1 || isOwnNode(target)) return;
    hoveredEl = target;

    const rect = target.getBoundingClientRect();
    Object.assign(pickerHighlight.style, {
      display: "block",
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });

    pickerTooltip.textContent = getCssSelector(target);
    const tipWidth = pickerTooltip.offsetWidth;
    const tipHeight = pickerTooltip.offsetHeight;
    let x = e.clientX + 12;
    let y = e.clientY + 12;
    if (x + tipWidth > window.innerWidth) x = e.clientX - tipWidth - 12;
    if (y + tipHeight > window.innerHeight) y = e.clientY - tipHeight - 12;
    Object.assign(pickerTooltip.style, {
      display: "block",
      top: `${y}px`,
      left: `${x}px`,
    });
  }

  function onPickerClick(e) {
    if (!picking) return;
    e.preventDefault();
    e.stopPropagation();

    const target = hoveredEl || e.target;
    if (target && target.nodeType === 1 && !isOwnNode(target)) {
      const selector = getCssSelector(target);
      items.push({ id: generateId(), selector, hidden: true });
      saveItems();
      applyHiding();
    }
    stopPicking();
  }

  function onPickerKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      stopPicking();
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- сообщения от попапа ----------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") return;

    switch (message.type) {
      case "REVOMER_GET_STATE":
        sendResponse({ ok: true, items: items.map((item) => ({ ...item })) });
        break;

      case "REVOMER_SET_STATE":
        if (Array.isArray(message.items)) {
          items = message.items
            .filter((item) => item && typeof item.selector === "string")
            .map((item) => ({
              id: typeof item.id === "string" ? item.id : generateId(),
              selector: item.selector,
              hidden: Boolean(item.hidden),
            }));
          saveItems();
          applyHiding();
        }
        sendResponse({ ok: true });
        break;

      case "REVOMER_PICK":
        startPicking();
        sendResponse({ ok: true });
        break;

      default:
        break;
    }
  });

  // при загрузке страницы подхватываем сохранённые правила
  applyHiding();
})();
