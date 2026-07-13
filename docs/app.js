/**
 * CPLUS 会议室预约 — 云端版（Supabase）
 * 老板/客户随时扫码；数据在云数据库，不经过你私人电脑
 */

const DAY_START = 9 * 60 + 30;
const DAY_END = 18 * 60;
const TOTAL_MINS = DAY_END - DAY_START;
const PIN_KEY = "cplus_access_pin";

const ROOMS = {
  large: { id: "large", name: "大会议室", max: 10 },
  medium: { id: "medium", name: "中会议室", max: 4 },
  small: { id: "small", name: "小会议室", max: 2 },
};

const CFG = window.CPLUS_CONFIG || {};
let bookings = [];
let filterDate = formatDate(new Date());
let accessPin = sessionStorage.getItem(PIN_KEY) || "";

const $ = (id) => document.getElementById(id);

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMinutes(t) {
  const [h, m] = String(t).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

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

function configReady() {
  const url = (CFG.supabaseUrl || "").trim();
  const key = (CFG.supabaseAnonKey || "").trim();
  if (!url || !key || url.includes("PASTE_") || key.includes("PASTE_")) {
    return false;
  }
  return true;
}

function sbHeaders(extra = {}) {
  const key = CFG.supabaseAnonKey.trim();
  return {
    apikey: key,
    Authorization: "Bearer " + key,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

function sbUrl(pathQuery) {
  const base = CFG.supabaseUrl.replace(/\/$/, "");
  return base + "/rest/v1/" + pathQuery;
}

function rowToBooking(r) {
  return {
    id: r.id,
    roomId: r.room_id,
    date: r.date,
    startTime: r.start_time.length === 5 ? r.start_time : String(r.start_time).slice(0, 5),
    endTime: r.end_time.length === 5 ? r.end_time : String(r.end_time).slice(0, 5),
    attendees: r.attendees,
    createdAt: r.created_at,
  };
}

function bookingToRow(b) {
  return {
    id: b.id,
    room_id: b.roomId,
    date: b.date,
    start_time: b.startTime,
    end_time: b.endTime,
    attendees: b.attendees,
    created_at: b.createdAt || Date.now(),
  };
}

function overlaps(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}

function validateLocal(data, excludeId = null) {
  if (!data.roomId || !ROOMS[data.roomId]) return "请选择会议室";
  if (!data.date) return "请选择日期";
  if (!isWeekday(data.date)) return "仅周一至周五可预约";
  if (!data.startTime || !data.endTime) return "请填写时间";
  const s = parseMinutes(data.startTime);
  const e = parseMinutes(data.endTime);
  if (e <= s) return "结束时间必须晚于开始时间";
  if (e - s < 15) return "会议时长至少 15 分钟";
  if (s < DAY_START || e > DAY_END) return "可预约时段为 9:30 – 18:00";
  const people = Number(data.attendees) || 0;
  if (people < 1) return "人数至少为 1";
  const max = ROOMS[data.roomId].max;
  if (people > max) return `${ROOMS[data.roomId].name}最多 ${max} 人`;

  const conflict = bookings.find((b) => {
    if (excludeId && b.id === excludeId) return false;
    if (b.roomId !== data.roomId || b.date !== data.date) return false;
    return overlaps(s, e, parseMinutes(b.startTime), parseMinutes(b.endTime));
  });
  if (conflict) {
    return `该时段已被占用：${ROOMS[data.roomId].name} ${conflict.startTime}–${conflict.endTime}（先到先得）`;
  }
  return null;
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

function needPin() {
  return !!(CFG.accessPin && String(CFG.accessPin).length > 0);
}

function pinOk() {
  if (!needPin()) return true;
  return accessPin === String(CFG.accessPin);
}

async function fetchBookings() {
  if (!configReady()) {
    toast("请先在 config.js 填入 Supabase 配置", "err");
    return false;
  }
  try {
    const res = await fetch(sbUrl("bookings?select=*&order=date.asc,start_time.asc"), {
      headers: sbHeaders(),
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(t);
      toast("读取预约失败，请检查 config / 数据表", "err");
      return false;
    }
    const rows = await res.json();
    bookings = (rows || []).map(rowToBooking);
    return true;
  } catch (e) {
    console.error(e);
    toast("网络错误，请稍后重试", "err");
    return false;
  }
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
          ? list
              .map((b) => `<span class="slot">${b.startTime}–${b.endTime} · ${b.attendees || "?"}人</span>`)
              .join("")
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
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(minutesToTime(m));

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
              return `<div class="block" style="left:${left}%;width:${Math.max(width, 2)}%">${label}</div>`;
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
    root.innerHTML = `<div class="empty">周末不可预约<br/>请选择周一至周五</div>`;
    return;
  }
  if (!list.length) {
    root.innerHTML = `<div class="empty">当日暂无预约<br/>点击「+ 新建预约」</div>`;
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

async function submitForm(e) {
  e.preventDefault();
  const data = getFormData();
  const editId = $("editId").value || null;
  const err = validateLocal(data, editId);
  if (err) {
    showFormError(err);
    return;
  }

  try {
    if (editId) {
      const row = bookingToRow({ ...data, id: editId, createdAt: Date.now() });
      const res = await fetch(sbUrl(`bookings?id=eq.${encodeURIComponent(editId)}`), {
        method: "PATCH",
        headers: sbHeaders(),
        body: JSON.stringify({
          room_id: row.room_id,
          date: row.date,
          start_time: row.start_time,
          end_time: row.end_time,
          attendees: row.attendees,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
    } else {
      const id = "b_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const row = bookingToRow({ ...data, id, createdAt: Date.now() });
      const res = await fetch(sbUrl("bookings"), {
        method: "POST",
        headers: sbHeaders(),
        body: JSON.stringify(row),
      });
      if (!res.ok) throw new Error(await res.text());
    }
    filterDate = data.date;
    closeModal();
    await fetchBookings();
    renderAll();
    toast(editId ? "已保存" : "预约成功 · 时段已占用", "ok");
  } catch (err) {
    console.error(err);
    showFormError("提交失败，请检查网络或稍后重试");
  }
}

async function deleteBooking(id) {
  const b = bookings.find((x) => x.id === id);
  if (!b) return;
  const room = ROOMS[b.roomId]?.name || "";
  if (!confirm(`取消预约？\n${room}\n${b.date} ${b.startTime}–${b.endTime}`)) return;
  try {
    const res = await fetch(sbUrl(`bookings?id=eq.${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: sbHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());
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

function submitPin() {
  accessPin = ($("pinInput").value || "").trim();
  if (!pinOk()) {
    $("pinErr").hidden = false;
    $("pinErr").textContent = "访问码不正确";
    return;
  }
  sessionStorage.setItem(PIN_KEY, accessPin);
  showPinGate(false);
  boot();
}

async function boot() {
  if (!configReady()) {
    document.body.innerHTML = `
      <div style="max-width:480px;margin:40px auto;padding:24px;font-family:sans-serif;line-height:1.6">
        <h1 style="color:#0b3d5c">CPLUS预约会议系统</h1>
        <p>云数据库尚未配置完成。</p>
        <p>请按桌面说明完成 Supabase 配置，并填写 <code>docs/config.js</code>。</p>
      </div>`;
    return;
  }
  await fetchBookings();
  renderAll();
}

function init() {
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
  $("btnRefresh").addEventListener("click", async () => {
    const ok = await fetchBookings();
    renderAll();
    toast(ok ? "已更新" : "刷新失败", ok ? "ok" : "err");
  });
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

  if (needPin() && !pinOk()) {
    showPinGate(true);
  } else {
    showPinGate(false);
    boot();
  }

  setInterval(async () => {
    if ($("pinMask") && !$("pinMask").hidden) return;
    if (!configReady()) return;
    if (await fetchBookings()) renderAll();
  }, 8000);
}

init();
