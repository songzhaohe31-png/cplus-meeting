/**
 * CPLUS 会议室预约 — 简洁版
 * 仅：会议室、日期、开始、结束、人数
 * 可用：周一至周五 9:30–18:00
 */

const API = "/api/bookings";
const DAY_START = 9 * 60 + 30; // 9:30
const DAY_END = 18 * 60; // 18:00
const TOTAL_MINS = DAY_END - DAY_START;
const PIN_KEY = "cplus_access_pin";

const ROOMS = {
  large: { id: "large", name: "大会议室", max: 10 },
  medium: { id: "medium", name: "中会议室", max: 4 },
  small: { id: "small", name: "小会议室", max: 2 },
};

let bookings = [];
let filterDate = formatDate(new Date());
let accessPin = sessionStorage.getItem(PIN_KEY) || "";

const $ = (id) => document.getElementById(id);

function apiHeaders(extra = {}) {
  const h = { ...extra };
  if (accessPin) h["X-Access-Pin"] = accessPin;
  return h;
}

async function apiFetch(url, options = {}) {
  const opts = { ...options, headers: apiHeaders(options.headers || {}) };
  return fetch(url, opts);
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 0=周一 … 6=周日（基于本地日期字符串） */
function weekdayMon0(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return (d.getDay() + 6) % 7;
}

function isWeekday(dateStr) {
  return weekdayMon0(dateStr) < 5;
}

function weekdayName(dateStr) {
  return ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][weekdayMon0(dateStr)];
}

function toast(msg, type = "ok") {
  const el = $("toast");
  el.textContent = msg;
  el.className = "toast " + type;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2600);
}

async function fetchBookings() {
  try {
    const res = await apiFetch(API, { cache: "no-store" });
    if (res.status === 401) {
      showPinGate(true);
      return false;
    }
    if (!res.ok) throw new Error("fail");
    const data = await res.json();
    bookings = data.bookings || [];
    return true;
  } catch {
    return false;
  }
}

function showPinGate(show) {
  const el = $("pinMask");
  if (!el) return;
  el.hidden = !show;
  if (show) {
    $("pinErr").hidden = true;
    setTimeout(() => $("pinInput")?.focus(), 50);
  }
}

async function checkConfigAndPin() {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    const cfg = await res.json();
    if (cfg.pinRequired) {
      if (!accessPin) {
        showPinGate(true);
        return false;
      }
      // 验证已存访问码
      const test = await apiFetch(API, { cache: "no-store" });
      if (test.status === 401) {
        accessPin = "";
        sessionStorage.removeItem(PIN_KEY);
        showPinGate(true);
        return false;
      }
    }
    showPinGate(false);
    return true;
  } catch {
    showPinGate(false);
    return true;
  }
}

async function submitPin() {
  accessPin = ($("pinInput").value || "").trim();
  if (!accessPin) {
    $("pinErr").hidden = false;
    $("pinErr").textContent = "请输入访问码";
    return;
  }
  const test = await apiFetch(API, { cache: "no-store" });
  if (test.status === 401) {
    $("pinErr").hidden = false;
    $("pinErr").textContent = "访问码不正确";
    accessPin = "";
    return;
  }
  sessionStorage.setItem(PIN_KEY, accessPin);
  showPinGate(false);
  await fetchBookings();
  renderAll();
  toast("已进入系统", "ok");
}

function dayBookings(roomId) {
  return bookings
    .filter((b) => b.date === filterDate && b.roomId === roomId)
    .sort((a, b) => parseMinutes(a.startTime) - parseMinutes(b.startTime));
}

function isNowOccupied(roomId) {
  if (filterDate !== formatDate(new Date())) return false;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return dayBookings(roomId).some(
    (b) => parseMinutes(b.startTime) <= mins && mins < parseMinutes(b.endTime)
  );
}

function openModal(edit = null, presetRoom = null) {
  $("modal").hidden = false;
  $("formAlert").hidden = true;
  $("formAlert").textContent = "";
  $("modalTitle").textContent = edit ? "编辑预约" : "新建预约";
  $("btnSubmit").textContent = edit ? "保存修改" : "确认预约";

  if (edit) {
    $("editId").value = edit.id;
    $("roomId").value = edit.roomId;
    $("date").value = edit.date;
    $("startTime").value = edit.startTime;
    $("endTime").value = edit.endTime;
    $("attendees").value = edit.attendees || 1;
  } else {
    $("bookingForm").reset();
    $("editId").value = "";
    $("date").value = isWeekday(filterDate) ? filterDate : nextWeekday(filterDate);
    $("roomId").value = presetRoom || "large";
    $("startTime").value = "09:30";
    $("endTime").value = "10:30";
    $("attendees").value = 2;
  }
}

function nextWeekday(dateStr) {
  let d = new Date(dateStr + "T12:00:00");
  for (let i = 0; i < 7; i++) {
    if ((d.getDay() + 6) % 7 < 5) return formatDate(d);
    d.setDate(d.getDate() + 1);
  }
  return dateStr;
}

function closeModal() {
  $("modal").hidden = true;
}

function getFormData() {
  return {
    roomId: $("roomId").value,
    date: $("date").value,
    startTime: $("startTime").value,
    endTime: $("endTime").value,
    attendees: Number($("attendees").value) || 1,
  };
}

function showFormError(msg) {
  const el = $("formAlert");
  el.hidden = false;
  el.textContent = msg;
}

function renderDayHint() {
  const el = $("dayHint");
  if (!isWeekday(filterDate)) {
    el.textContent = `${filterDate} ${weekdayName(filterDate)} · 非工作日，不可预约`;
    el.className = "day-hint warn";
  } else {
    el.textContent = `${filterDate} ${weekdayName(filterDate)} · 可约 9:30–18:00 · 红色为已占用`;
    el.className = "day-hint";
  }
}

function renderRoomCards() {
  const open = isWeekday(filterDate);
  $("roomCards").innerHTML = Object.values(ROOMS)
    .map((room) => {
      const list = dayBookings(room.id);
      let status;
      if (!open) status = { kind: "off", text: "休息日" };
      else if (isNowOccupied(room.id)) status = { kind: "busy", text: "使用中" };
      else if (list.length) status = { kind: "busy", text: `${list.length} 场已约` };
      else status = { kind: "free", text: "全天空闲" };

      const blocks = open
        ? list
            .map((b) => {
              const s = parseMinutes(b.startTime);
              const e = parseMinutes(b.endTime);
              const left = ((s - DAY_START) / TOTAL_MINS) * 100;
              const width = ((e - s) / TOTAL_MINS) * 100;
              return `<div class="mini-block" style="left:${left}%;width:${Math.max(width, 1.5)}%"></div>`;
            })
            .join("")
        : "";

      const slots = !open
        ? `<span class="empty" style="color:var(--muted)">本日不可预约</span>`
        : list.length
          ? list.map((b) => `<span class="slot">${b.startTime}–${b.endTime} · ${b.attendees || "?"}人</span>`).join("")
          : `<span class="empty">暂无预约，可立即预约</span>`;

      return `
        <article class="room-card ${room.id}" data-room="${room.id}">
          <div class="room-top">
            <div>
              <h3>${room.name}</h3>
              <div class="room-cap">最多 ${room.max} 人</div>
            </div>
            <span class="status-tag ${status.kind}">${status.text}</span>
          </div>
          <div class="mini-track ${open ? "" : "closed"}">${blocks}</div>
          <div class="mini-labels"><span>9:30</span><span>18:00</span></div>
          <div class="room-slots">${slots}</div>
        </article>`;
    })
    .join("");
}

function renderTimeline() {
  const open = isWeekday(filterDate);
  const hours = [];
  for (let m = DAY_START; m < DAY_END; m += 60) {
    hours.push(minutesToTime(m));
  }

  $("timeline").innerHTML = Object.values(ROOMS)
    .map((room) => {
      const list = dayBookings(room.id);
      const blocks = open
        ? list
            .map((b) => {
              const s = parseMinutes(b.startTime);
              const e = parseMinutes(b.endTime);
              const left = ((s - DAY_START) / TOTAL_MINS) * 100;
              const width = ((e - s) / TOTAL_MINS) * 100;
              const label = `${b.startTime}–${b.endTime}`;
              return `<div class="block" style="left:${left}%;width:${Math.max(width, 2)}%" title="${label}">${label}</div>`;
            })
            .join("")
        : "";

      const grid = hours.map((h) => `<span>${h.slice(0, 2)}</span>`).join("");

      return `
        <div class="timeline-room">
          <div class="timeline-room-title">
            <span>${room.name}</span>
            <span style="color:var(--busy);font-weight:700">${open ? list.length + " 场占用" : "休息日"}</span>
          </div>
          <div class="track ${open ? "" : "closed"}">
            <div class="track-grid">${grid}</div>
            ${blocks}
          </div>
          <div class="hour-labels"><span>9:30</span><span>18:00</span></div>
        </div>`;
    })
    .join("");
}

function renderList() {
  const open = isWeekday(filterDate);
  const list = bookings
    .filter((b) => b.date === filterDate)
    .sort((a, b) => {
      if (a.roomId !== b.roomId) return a.roomId.localeCompare(b.roomId);
      return parseMinutes(a.startTime) - parseMinutes(b.startTime);
    });

  $("bookingCount").textContent = String(list.length);
  const root = $("bookingList");

  if (!open) {
    root.innerHTML = `<div class="empty">周末及节假日不可预约<br/>请选择周一至周五</div>`;
    return;
  }
  if (!list.length) {
    root.innerHTML = `<div class="empty">当日暂无预约<br/>点击右上角「+ 新建预约」</div>`;
    return;
  }

  root.innerHTML = list
    .map((b) => {
      const room = ROOMS[b.roomId] || { name: b.roomId };
      return `
        <article class="booking-card">
          <p class="time">${b.startTime} – ${b.endTime}</p>
          <p class="meta">${room.name} · ${b.attendees || "—"} 人 · 已占用</p>
          <div class="booking-actions">
            <button type="button" class="btn-sm" data-edit="${b.id}">编辑</button>
            <button type="button" class="btn-sm danger" data-del="${b.id}">取消</button>
          </div>
        </article>`;
    })
    .join("");
}

function renderAll() {
  $("filterDate").value = filterDate;
  renderDayHint();
  renderRoomCards();
  renderTimeline();
  renderList();
}

async function refresh(showToast = true) {
  const ok = await fetchBookings();
  renderAll();
  if (showToast) toast(ok ? "已更新" : "连接失败，请确认服务已启动", ok ? "ok" : "err");
}

async function submitForm(e) {
  e.preventDefault();
  const data = getFormData();
  const editId = $("editId").value || null;

  try {
    const res = await apiFetch(editId ? `${API}/${editId}` : API, {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (!res.ok || !result.ok) {
      showFormError(result.error || "提交失败");
      return;
    }
    filterDate = data.date;
    closeModal();
    await fetchBookings();
    renderAll();
    toast(editId ? "已保存" : "预约成功 · 时段已占用", "ok");
  } catch {
    showFormError("提交失败，请稍后重试");
  }
}

async function deleteBooking(id) {
  const b = bookings.find((x) => x.id === id);
  if (!b) return;
  const room = ROOMS[b.roomId]?.name || "";
  if (!confirm(`取消预约？\n${room}\n${b.date} ${b.startTime}–${b.endTime}`)) return;
  try {
    const res = await apiFetch(`${API}/${id}`, { method: "DELETE" });
    const result = await res.json();
    if (!res.ok || !result.ok) {
      toast(result.error || "取消失败", "err");
      return;
    }
    await fetchBookings();
    renderAll();
    toast("已取消", "ok");
  } catch {
    toast("取消失败", "err");
  }
}

function shiftDate(days) {
  const d = new Date(filterDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  filterDate = formatDate(d);
  renderAll();
}

function init() {
  // 页面标题固定为系统名，不暴露技术域名
  document.title = "CPLUS预约会议系统";

  $("btnPin")?.addEventListener("click", submitPin);
  $("pinInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitPin();
  });

  $("btnNewBooking").addEventListener("click", () => openModal());
  $("btnCloseModal").addEventListener("click", closeModal);
  $("btnCancelForm").addEventListener("click", closeModal);
  $("modal").addEventListener("click", (e) => {
    if (e.target === $("modal")) closeModal();
  });
  $("bookingForm").addEventListener("submit", submitForm);
  $("btnRefresh").addEventListener("click", () => refresh(true));
  $("btnPrevDay").addEventListener("click", () => shiftDate(-1));
  $("btnNextDay").addEventListener("click", () => shiftDate(1));
  $("btnToday").addEventListener("click", () => {
    filterDate = formatDate(new Date());
    renderAll();
  });
  $("filterDate").addEventListener("change", (e) => {
    filterDate = e.target.value || formatDate(new Date());
    renderAll();
  });

  $("roomCards").addEventListener("click", (e) => {
    const card = e.target.closest("[data-room]");
    if (!card) return;
    if (!isWeekday(filterDate)) {
      toast("仅工作日可预约", "err");
      return;
    }
    openModal(null, card.getAttribute("data-room"));
  });

  $("bookingList").addEventListener("click", (e) => {
    const editId = e.target.getAttribute("data-edit");
    const delId = e.target.getAttribute("data-del");
    if (editId) {
      const b = bookings.find((x) => x.id === editId);
      if (b) openModal(b);
    }
    if (delId) deleteBooking(delId);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("modal").hidden) closeModal();
  });

  checkConfigAndPin().then(async (ok) => {
    if (ok) {
      await fetchBookings();
      renderAll();
    }
  });
  setInterval(async () => {
    if ($("pinMask") && !$("pinMask").hidden) return;
    if (await fetchBookings()) renderAll();
  }, 8000);
}

init();
