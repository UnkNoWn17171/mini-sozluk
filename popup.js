"use strict";

// Güvenlik notları:
// - Tek ağ hedefi tureng.com (manifest CSP connect-src + host_permissions).
// - Gelen HTML yalnızca DOMParser ile ayrıştırılır (script çalışmaz, kaynak yüklenmez);
//   ekrana sadece textContent ile metin basılır, innerHTML hiç kullanılmaz.
// - Çerez ve referrer gönderilmez; girdi temizlenir ve URL'de kodlanır.

const ORIGIN = "https://tureng.com";
const BASE = ORIGIN + "/en/turkish-english/";
const PERMISSION = { origins: [ORIGIN + "/*"] };

const MAX_ROWS = 10;
const MAX_TERM_LEN = 80;
const MAX_CELL_LEN = 160;
const MAX_HTML_CHARS = 3_000_000;
const DEBOUNCE_MS = 250;
const TIMEOUT_MS = 8000;

const $q = document.getElementById("q");
const $open = document.getElementById("open");
const $grant = document.getElementById("grant");
const $status = document.getElementById("status");
const $suggest = document.getElementById("suggest");
const $results = document.getElementById("results");
const $rows = document.getElementById("rows");

const cache = new Map(); // sadece bu popup açıkken yaşar
let timer = 0;
let controller = null;
let seq = 0;

class LookupError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function cleanTerm(raw) {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TERM_LEN);
}

function textOf(el) {
  return el ? el.textContent.replace(/\s+/g, " ").trim().slice(0, MAX_CELL_LEN) : "";
}

function parseTureng(doc) {
  const box = doc.querySelector(".tureng-searchresults-content");
  if (!box) return { kind: "unknown" };

  if (box.classList.contains("tureng-page-suggest")) {
    const words = [...box.querySelectorAll(".suggestion-list li")]
      .map(textOf)
      .filter(Boolean)
      .slice(0, MAX_ROWS);
    return words.length ? { kind: "suggest", words } : { kind: "none" };
  }

  // Önce doğrudan anlamlar, yer kalırsa "with other terms" tablosu.
  const primary = [];
  const other = [];
  for (const table of box.querySelectorAll("table.searchResultsTable")) {
    const heading = table.previousElementSibling;
    const bucket = heading && /other terms/i.test(heading.textContent) ? other : primary;
    for (const tr of table.rows) {
      if (tr.cells.length < 4 || tr.hasAttribute("style")) continue;
      const [, catCell, srcCell, dstCell] = tr.cells;
      const src = textOf(srcCell.querySelector("a"));
      const dst = textOf(dstCell.querySelector("a"));
      if (!src || !dst) continue;
      bucket.push({
        cat: textOf(catCell),
        src,
        srcType: textOf(srcCell.querySelector("i")),
        dst,
        dstType: textOf(dstCell.querySelector("i")),
      });
    }
    if (primary.length >= MAX_ROWS) break;
  }

  const rows = primary.concat(other).slice(0, MAX_ROWS);
  return rows.length ? { kind: "rows", rows } : { kind: "none" };
}

async function lookup(term, signal) {
  const res = await fetch(BASE + encodeURIComponent(term), {
    signal,
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (new URL(res.url).origin !== ORIGIN) throw new LookupError("redirect");
  if (res.status === 403 || res.status === 429 || res.status === 503) throw new LookupError("blocked");
  if (!res.ok) throw new LookupError("http");
  if (!(res.headers.get("content-type") || "").startsWith("text/html")) throw new LookupError("type");
  if (Number(res.headers.get("content-length")) > MAX_HTML_CHARS) throw new LookupError("size");

  const html = await res.text();
  if (html.length > MAX_HTML_CHARS) throw new LookupError("size");
  return parseTureng(new DOMParser().parseFromString(html, "text/html"));
}

function setStatus(message, isError = false) {
  $status.textContent = message;
  $status.classList.toggle("error", isError);
}

function clearOutput() {
  $rows.replaceChildren();
  $suggest.replaceChildren();
  $results.hidden = true;
  $suggest.hidden = true;
}

function cell(className, main, type) {
  const td = document.createElement("td");
  td.className = className;
  td.textContent = main;
  if (type) {
    const i = document.createElement("i");
    i.textContent = type;
    td.append(i);
  }
  if (className === "cat") td.title = main;
  return td;
}

function render(result) {
  clearOutput();
  setStatus("");

  if (result.kind === "rows") {
    for (const r of result.rows) {
      const tr = document.createElement("tr");
      tr.append(cell("cat", r.cat), cell("src", r.src, r.srcType), cell("dst", r.dst, r.dstType));
      $rows.append(tr);
    }
    $results.hidden = false;
  } else if (result.kind === "suggest") {
    setStatus("Bulunamadı. Bunu mu demek istediniz?");
    for (const word of result.words) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = word;
      b.addEventListener("click", () => {
        $q.value = word;
        search(true);
        $q.focus();
      });
      $suggest.append(b);
    }
    $suggest.hidden = false;
  } else if (result.kind === "none") {
    setStatus("Sonuç bulunamadı.");
  } else {
    setStatus("Tureng sayfa yapısı değişmiş olabilir; ↗ ile sitede aç.", true);
  }
}

const ERRORS = {
  blocked: "Tureng isteği engelledi. ↗ ile siteyi bir kez açıp tekrar dene.",
  TimeoutError: "Zaman aşımı. Bağlantını kontrol et.",
  TypeError: "Bağlantı hatası.",
};

async function search(immediate = false) {
  clearTimeout(timer);
  const term = cleanTerm($q.value);

  $open.hidden = !term;
  $open.href = term ? BASE + encodeURIComponent(term) : ORIGIN + "/";

  if (!term) {
    controller?.abort();
    clearOutput();
    setStatus("");
    return;
  }

  if (cache.has(term)) {
    controller?.abort();
    render(cache.get(term));
    return;
  }

  if (!immediate) {
    timer = setTimeout(() => search(true), DEBOUNCE_MS);
    return;
  }

  controller?.abort();
  controller = new AbortController();
  const id = ++seq;
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]);

  // Sonuçlar ekrandayken metin göstermek tabloyu zıplatır; sadece soluklaştır.
  $results.classList.add("busy");
  if ($results.hidden) setStatus("Aranıyor…");
  try {
    const result = await lookup(term, signal);
    cache.set(term, result);
    if (id === seq) render(result);
  } catch (err) {
    if (id !== seq || err.name === "AbortError") return;
    clearOutput();
    setStatus(ERRORS[err.code] || ERRORS[err.name] || "Bir hata oluştu.", true);
  } finally {
    if (id === seq) $results.classList.remove("busy");
  }
}

async function init() {
  $q.addEventListener("input", () => search(false));
  $q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") search(true);
  });

  if (!(await browser.permissions.contains(PERMISSION))) {
    $q.disabled = true;
    $grant.hidden = false;
    setStatus("Sonuç alabilmek için yalnızca tureng.com erişimi gerekiyor.");
    $grant.addEventListener("click", async () => {
      if (await browser.permissions.request(PERMISSION)) {
        $grant.hidden = true;
        $q.disabled = false;
        setStatus("");
        $q.focus();
      }
    });
    return;
  }

  $q.focus();
}

init();
