"use strict";

/* ============================================================
 * 3地点お天気 PWA
 *   データ: Open-Meteo (APIキー不要)
 *   地点検索: Open-Meteo Geocoding API
 *   地点設定は localStorage に保存
 * ============================================================ */

const STORAGE_KEY = "weather3spots.locations.v1";
const HOURS_AHEAD = 48; // 何時間先まで表示するか

// ---- 状態 ----
let locations = loadLocations(); // [{name, admin, country, lat, lon} | null, ..., ...] 長さ3
let activeIndex = firstFilledIndex();
const cache = {}; // slotキー -> forecast データ

// ---- DOM ----
const el = {
  tabs: document.getElementById("tabs"),
  status: document.getElementById("statusArea"),
  current: document.getElementById("currentCard"),
  hourly: document.getElementById("hourlyArea"),
  updatedAt: document.getElementById("updatedAt"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettings: document.getElementById("closeSettings"),
  slotEditors: document.getElementById("slotEditors"),
  useGeoBtn: document.getElementById("useGeoBtn"),
};

/* ============================================================
 * 天気コード (WMO) -> 絵文字 + 日本語
 * ============================================================ */
function weatherInfo(code, isDay) {
  const sun = isDay ? "☀️" : "🌙";
  const map = {
    0: [sun, "快晴"],
    1: [isDay ? "🌤️" : "🌙", "晴れ"],
    2: ["⛅", "一部くもり"],
    3: ["☁️", "くもり"],
    45: ["🌫️", "霧"],
    48: ["🌫️", "霧（着氷）"],
    51: ["🌦️", "霧雨（弱）"],
    53: ["🌦️", "霧雨"],
    55: ["🌦️", "霧雨（強）"],
    56: ["🌧️", "着氷性霧雨"],
    57: ["🌧️", "着氷性霧雨（強）"],
    61: ["🌧️", "小雨"],
    63: ["🌧️", "雨"],
    65: ["🌧️", "強い雨"],
    66: ["🌧️", "着氷性の雨"],
    67: ["🌧️", "着氷性の強い雨"],
    71: ["🌨️", "小雪"],
    73: ["🌨️", "雪"],
    75: ["❄️", "大雪"],
    77: ["🌨️", "霧雪"],
    80: ["🌦️", "にわか雨（弱）"],
    81: ["🌧️", "にわか雨"],
    82: ["⛈️", "激しいにわか雨"],
    85: ["🌨️", "にわか雪（弱）"],
    86: ["❄️", "にわか雪（強）"],
    95: ["⛈️", "雷雨"],
    96: ["⛈️", "雷雨（ひょう）"],
    99: ["⛈️", "激しい雷雨（ひょう）"],
  };
  return map[code] || ["❓", "不明"];
}

/* ============================================================
 * localStorage
 * ============================================================ */
function loadLocations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        while (arr.length < 3) arr.push(null);
        return arr.slice(0, 3);
      }
    }
  } catch (e) {
    console.warn("設定の読み込みに失敗", e);
  }
  return [null, null, null];
}

function saveLocations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
}

function firstFilledIndex() {
  const i = (locations || []).findIndex((l) => l);
  return i === -1 ? 0 : i;
}

/* ============================================================
 * API 呼び出し
 * ============================================================ */
async function geocode(query) {
  const url =
    "https://geocoding-api.open-meteo.com/v1/search?name=" +
    encodeURIComponent(query) +
    "&count=8&language=ja&format=json";
  const res = await fetch(url);
  if (!res.ok) throw new Error("地名検索に失敗しました (" + res.status + ")");
  const data = await res.json();
  return data.results || [];
}

async function fetchForecast(loc) {
  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    hourly:
      "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m,is_day",
    current:
      "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day,precipitation",
    timezone: "auto",
    forecast_days: "3",
  });
  const url = "https://api.open-meteo.com/v1/forecast?" + params.toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error("天気の取得に失敗しました (" + res.status + ")");
  return res.json();
}

/* ============================================================
 * 描画: タブ
 * ============================================================ */
function renderTabs() {
  el.tabs.innerHTML = "";
  locations.forEach((loc, i) => {
    const btn = document.createElement("button");
    btn.className = "tab" + (i === activeIndex ? " active" : "") + (loc ? "" : " empty");
    btn.textContent = loc ? loc.name : "地点" + (i + 1) + "（未設定）";
    btn.addEventListener("click", () => {
      activeIndex = i;
      renderTabs();
      renderActive();
    });
    el.tabs.appendChild(btn);
  });
}

/* ============================================================
 * 描画: 選択中の地点
 * ============================================================ */
function setStatus(msg, isError) {
  el.status.hidden = false;
  el.status.className = "status-area" + (isError ? " error" : "");
  el.status.innerHTML = msg;
  el.current.hidden = true;
  el.hourly.hidden = true;
}

async function renderActive() {
  const loc = locations[activeIndex];
  if (!loc) {
    setStatus(
      "この地点はまだ設定されていません。<br>右上の ⚙️ から地名を登録してください。",
      false
    );
    el.updatedAt.textContent = "";
    return;
  }

  const key = loc.lat + "," + loc.lon;
  // キャッシュ（10分以内）
  const cached = cache[key];
  const fresh = cached && Date.now() - cached.at < 10 * 60 * 1000;

  if (!fresh) {
    setStatus('<span class="spinner"></span><br>読み込み中…', false);
    try {
      const data = await fetchForecast(loc);
      cache[key] = { at: Date.now(), data };
    } catch (e) {
      setStatus("⚠️ " + e.message + "<br>通信環境を確認して再度お試しください。", true);
      return;
    }
  }

  drawForecast(loc, cache[key].data);
}

function drawForecast(loc, data) {
  el.status.hidden = true;

  // ---- 現在 ----
  const cur = data.current;
  const [cIcon, cDesc] = weatherInfo(cur.weather_code, cur.is_day === 1);
  el.current.hidden = false;
  el.current.innerHTML = `
    <div class="cur-place">${escapeHtml(placeFull(loc))}</div>
    <div class="cur-main">
      <div class="cur-icon">${cIcon}</div>
      <div>
        <div class="cur-temp">${Math.round(cur.temperature_2m)}°</div>
        <div class="cur-desc">${cDesc}</div>
      </div>
    </div>
    <div class="cur-sub">
      <div><div class="lbl">体感</div><div class="val">${Math.round(cur.apparent_temperature)}°</div></div>
      <div><div class="lbl">湿度</div><div class="val">${cur.relative_humidity_2m}%</div></div>
      <div><div class="lbl">風速</div><div class="val">${Math.round(cur.wind_speed_10m)}<span style="font-size:11px"> m/s</span></div></div>
    </div>`;

  // ---- 時間別 ----
  // Open-Meteo は timezone=auto で「地点ローカル時刻」の ISO 文字列を返す。
  // 端末のタイムゾーンに依存せず正しく表示するため、Date 変換せず文字列で扱う。
  const h = data.hourly;
  // 地点ローカルの現在時刻（例: "2026-10-19T17:30"）。無ければ端末時刻で代用。
  const nowStr = cur.time || localIsoNow();
  const todayKey = nowStr.slice(0, 10); // "YYYY-MM-DD"
  const curHour = parseInt(nowStr.slice(11, 13), 10);
  // 現在の正時（"...T17:00"）。これ以降の時間だけを表示対象にする。
  const nowHourStr = todayKey + "T" + pad(curHour) + ":00";

  const rows = [];
  for (let i = 0; i < h.time.length; i++) {
    const ts = h.time[i]; // "YYYY-MM-DDTHH:MM"
    if (ts < nowHourStr) continue; // ISO文字列は辞書順＝時系列順
    rows.push({
      dayKey: ts.slice(0, 10),
      hour: parseInt(ts.slice(11, 13), 10),
      temp: h.temperature_2m[i],
      pop: h.precipitation_probability[i],
      precip: h.precipitation[i],
      code: h.weather_code[i],
      wind: h.wind_speed_10m[i],
      isDay: h.is_day[i] === 1,
    });
    if (rows.length >= HOURS_AHEAD) break;
  }

  // 日ごとにグループ化
  const groups = {};
  const order = [];
  rows.forEach((r) => {
    if (!groups[r.dayKey]) {
      groups[r.dayKey] = [];
      order.push(r.dayKey);
    }
    groups[r.dayKey].push(r);
  });

  let html = "";
  order.forEach((dk) => {
    html += `<div class="day-group"><div class="day-head">${dayLabel(dk, todayKey)}</div><div class="hour-list">`;
    groups[dk].forEach((r) => {
      const [icon] = weatherInfo(r.code, r.isDay);
      const isNow = dk === todayKey && r.hour === curHour;
      const rainTxt =
        r.pop != null && r.pop > 0
          ? `<span class="rain">☔${r.pop}%</span>`
          : "";
      html += `
        <div class="hour-row${isNow ? " now" : ""}">
          <div class="h-time">${isNow ? "今" : pad(r.hour) + "時"}</div>
          <div class="h-icon">${icon}</div>
          <div class="h-detail">${rainTxt}<span>💨${Math.round(r.wind)}m/s</span></div>
          <div class="h-temp">${Math.round(r.temp)}°</div>
        </div>`;
    });
    html += "</div></div>";
  });

  el.hourly.hidden = false;
  el.hourly.innerHTML = html;

  el.updatedAt.textContent = "更新 " + formatClock(new Date());
}

/* ============================================================
 * 設定モーダル
 * ============================================================ */
function openSettings() {
  renderSlotEditors();
  el.settingsModal.hidden = false;
}
function closeSettings() {
  el.settingsModal.hidden = true;
}

function renderSlotEditors() {
  el.slotEditors.innerHTML = "";
  for (let i = 0; i < 3; i++) {
    const loc = locations[i];
    const wrap = document.createElement("div");
    wrap.className = "slot-editor";
    wrap.innerHTML = `
      <div class="slot-label">スロット ${i + 1}</div>
      <div class="slot-current">${loc ? "現在: " + escapeHtml(placeFull(loc)) : "未設定"}</div>
      <div class="search-row">
        <input type="text" placeholder="地名を入力（例: 名古屋）" data-slot="${i}" />
        <button data-search="${i}">検索</button>
      </div>
      <ul class="results" data-results="${i}"></ul>`;
    el.slotEditors.appendChild(wrap);
  }

  // 検索ハンドラ
  el.slotEditors.querySelectorAll("button[data-search]").forEach((btn) => {
    btn.addEventListener("click", () => doSearch(+btn.dataset.search));
  });
  el.slotEditors.querySelectorAll("input[data-slot]").forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch(+inp.dataset.slot);
    });
  });
}

async function doSearch(slot) {
  const input = el.slotEditors.querySelector(`input[data-slot="${slot}"]`);
  const resultsEl = el.slotEditors.querySelector(`ul[data-results="${slot}"]`);
  const q = input.value.trim();
  if (!q) return;
  resultsEl.innerHTML = '<li>検索中…</li>';
  try {
    const results = await geocode(q);
    if (!results.length) {
      resultsEl.innerHTML = '<li>該当なし。別の表記で試してください。</li>';
      return;
    }
    resultsEl.innerHTML = "";
    results.forEach((r) => {
      const li = document.createElement("li");
      li.innerHTML = `${escapeHtml(r.name)}<span class="sub">${escapeHtml(
        [r.admin1, r.country].filter(Boolean).join(" / ")
      )}</span>`;
      li.addEventListener("click", () => {
        locations[slot] = {
          name: r.name,
          admin: r.admin1 || "",
          country: r.country || "",
          lat: r.latitude,
          lon: r.longitude,
        };
        saveLocations();
        if (!locations[activeIndex]) activeIndex = slot;
        renderSlotEditors();
        renderTabs();
        renderActive();
      });
      resultsEl.appendChild(li);
    });
  } catch (e) {
    resultsEl.innerHTML = "<li>⚠️ " + escapeHtml(e.message) + "</li>";
  }
}

function useGeolocation() {
  if (!navigator.geolocation) {
    alert("この端末では現在地取得に対応していません。");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      // 逆ジオコーディングは簡易に「現在地」名で保存
      locations[0] = {
        name: "現在地",
        admin: "",
        country: "",
        lat: latitude,
        lon: longitude,
      };
      saveLocations();
      activeIndex = 0;
      renderSlotEditors();
      renderTabs();
      renderActive();
    },
    (err) => {
      alert("現在地を取得できませんでした: " + err.message);
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}

/* ============================================================
 * ユーティリティ
 * ============================================================ */
function pad(n) {
  return String(n).padStart(2, "0");
}
// 端末ローカル時刻を "YYYY-MM-DDTHH:MM" 形式で返す（current.time が無い場合の代用）
function localIsoNow() {
  const d = new Date();
  return (
    d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
    "T" + pad(d.getHours()) + ":" + pad(d.getMinutes())
  );
}
// 日付の1日後の "YYYY-MM-DD" を返す（タイムゾーン非依存のためUTCで計算）
function nextDayKey(dk) {
  const [y, m, d] = dk.split("-").map(Number);
  const nd = new Date(Date.UTC(y, m - 1, d + 1));
  return (
    nd.getUTCFullYear() + "-" + pad(nd.getUTCMonth() + 1) + "-" + pad(nd.getUTCDate())
  );
}
// "YYYY-MM-DD" の曜日インデックス(0=日)。UTC基準で計算しズレを防ぐ。
function weekdayIndex(dk) {
  const [y, m, d] = dk.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function dayLabel(dk, todayKey) {
  const [, m, d] = dk.split("-").map(Number);
  const w = ["日", "月", "火", "水", "木", "金", "土"][weekdayIndex(dk)];
  let prefix = "";
  if (dk === todayKey) prefix = "今日 ";
  else if (dk === nextDayKey(todayKey)) prefix = "明日 ";
  return prefix + m + "/" + d + "（" + w + "）";
}
function placeFull(loc) {
  return [loc.name, loc.admin, loc.country].filter(Boolean).join(" / ");
}
function formatClock(d) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ============================================================
 * イベント / 初期化
 * ============================================================ */
el.settingsBtn.addEventListener("click", openSettings);
el.closeSettings.addEventListener("click", closeSettings);
el.useGeoBtn.addEventListener("click", useGeolocation);
el.settingsModal.addEventListener("click", (e) => {
  if (e.target === el.settingsModal) closeSettings();
});

// 復帰時に再読み込み（10分キャッシュ超過分を更新）
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") renderActive();
});

renderTabs();
renderActive();

// 初回起動で地点が1つも無ければ設定を開く
if (!locations.some((l) => l)) {
  openSettings();
}

// Service Worker 登録
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW登録失敗", e));
  });
}
