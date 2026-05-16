const app = document.querySelector("#app");

const state = {
  db: null,
  modal: null,
  adminToken: window.localStorage.getItem("adminToken") || "",
  toast: "",
  error: ""
};

const cardTypeLabel = {
  lesson: "课时卡",
  time: "时间卡"
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function api(path, options = {}) {
  const { admin = false, headers = {}, body, ...fetchOptions } = options;
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(admin && state.adminToken ? { "x-admin-token": state.adminToken } : {}),
      ...headers
    },
    ...fetchOptions,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || "请求失败");
  }
  return data;
}

async function loadData() {
  state.db = await api("/api/bootstrap");
  if (state.adminToken) {
    try {
      await api("/api/admin/status", { admin: true });
    } catch {
      state.adminToken = "";
      window.localStorage.removeItem("adminToken");
    }
  }
}

function showToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2200);
}

function setError(message) {
  state.error = message;
  render();
}

function go(hash) {
  window.location.hash = hash;
}

function currentRoute() {
  return window.location.hash.replace(/^#/, "") || "home";
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(`${value}T00:00:00+08:00`));
}

function toDateTimeInput(value) {
  if (!value) return "";
  return value.slice(0, 16);
}

function fromDateTimeInput(value) {
  if (!value) return "";
  return `${value}:00+08:00`;
}

function todayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysUntil(dateString) {
  if (!dateString) return null;
  const end = new Date(`${dateString}T00:00:00+08:00`);
  const ms = end - todayStart();
  return Math.ceil(ms / 86400000);
}

function getStudent(studentId) {
  return state.db.students.find((student) => student.id === studentId);
}

function getRecords(studentId) {
  return state.db.records
    .filter((record) => record.studentId === studentId)
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

function getSchedules(studentId) {
  return state.db.schedules
    .filter((schedule) => schedule.studentId === studentId)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
}

function getUpcomingSchedules(studentId) {
  const now = Date.now();
  return getSchedules(studentId).filter((schedule) => new Date(schedule.startsAt).getTime() >= now - 3600000);
}

function getNextSchedule(studentId) {
  return getUpcomingSchedules(studentId)[0] || null;
}

function cardBalance(student) {
  if (student.cardType === "time") {
    const left = daysUntil(student.expiresAt);
    return {
      main: `${Math.max(left ?? 0, 0)} 天`,
      sub: `${student.cardName} · 有效期至 ${formatDate(student.expiresAt)}`,
      percent: Math.max(0, Math.min(100, ((left ?? 0) / 31) * 100))
    };
  }

  const total = Math.max(Number(student.totalLessons || 0), Number(student.remainingLessons || 0), 1);
  const remaining = Number(student.remainingLessons || 0);
  return {
    main: `${remaining} 节`,
    sub: `${student.cardName} · 有效期至 ${formatDate(student.expiresAt)}`,
    percent: Math.max(0, Math.min(100, (remaining / total) * 100))
  };
}

function alertsForStudent(student) {
  const alerts = [];
  const next = getNextSchedule(student.id);
  if (next) {
    alerts.push({
      tone: "info",
      title: "下次上课",
      text: `${formatDateTime(next.startsAt)} · ${next.courseName} · ${next.location}`
    });
  }

  if (student.cardType === "lesson" && Number(student.remainingLessons || 0) <= 2) {
    alerts.push({
      tone: "warn",
      title: "课时不足",
      text: `剩余 ${student.remainingLessons} 节，可提醒学员规划续课。`
    });
  }

  const left = daysUntil(student.expiresAt);
  if (left !== null && left < 0) {
    alerts.push({
      tone: "danger",
      title: "已到期",
      text: `${student.cardName} 已超过有效期。`
    });
  } else if (left !== null && left <= 14) {
    alerts.push({
      tone: "danger",
      title: "即将到期",
      text: `${student.cardName} 还有 ${left} 天到期。`
    });
  }

  return alerts;
}

function allUpcomingSchedules(limit = 6) {
  return state.db.schedules
    .filter((schedule) => new Date(schedule.startsAt).getTime() >= Date.now() - 3600000)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .slice(0, limit);
}

function lowLessonStudents() {
  return state.db.students.filter((student) => student.cardType === "lesson" && Number(student.remainingLessons || 0) <= 2);
}

function expiringStudents() {
  return state.db.students.filter((student) => {
    const left = daysUntil(student.expiresAt);
    return left !== null && left <= 14;
  });
}

function header(title, options = {}) {
  const back = options.back ? `<button class="icon-btn" type="button" data-action="go" data-target="${options.back}" aria-label="返回">‹</button>` : `<span></span>`;
  const right = options.right || `<span></span>`;
  return `
    <header class="topbar">
      ${back}
      <div>
        <p class="eyebrow">${escapeHtml(state.db.gym.name)}</p>
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${right}
    </header>
  `;
}

function renderHome() {
  return `
    <main class="screen">
      <section class="home-head">
        <p class="eyebrow">${escapeHtml(state.db.gym.location)}</p>
        <h1>${escapeHtml(state.db.gym.name)}</h1>
        <p>课时、排课和训练记录演示台</p>
      </section>

      <section class="entry-grid">
        <button class="entry-card student-entry" type="button" data-action="go" data-target="student-login">
          <span class="entry-icon">学</span>
          <strong>学员端</strong>
          <small>查看下次上课、剩余课时和训练记录</small>
        </button>
        <button class="entry-card coach-entry" type="button" data-action="go" data-target="admin">
          <span class="entry-icon">教</span>
          <strong>教练后台</strong>
          <small>维护学员、排课、扣课和训练备注</small>
        </button>
      </section>
    </main>
  `;
}

function renderLogin() {
  const demoStudents = state.db.students
    .map((student) => `<button type="button" class="chip" data-action="fill-phone" data-phone="${escapeHtml(student.phone)}">${escapeHtml(student.name)}</button>`)
    .join("");

  return `
    <main class="screen">
      ${header("学员登录", { back: "home" })}
      <section class="card login-card">
        <form id="student-login-form" class="form">
          <label>
            手机号
            <input name="phone" inputmode="tel" placeholder="请输入手机号" autocomplete="tel" required />
          </label>
          <label>
            验证码
            <input name="code" inputmode="numeric" placeholder="演示验证码 123456" required />
          </label>
          ${state.error ? `<p class="form-error">${escapeHtml(state.error)}</p>` : ""}
          <button class="primary-btn" type="submit">进入学员端</button>
        </form>
      </section>
      <section class="card">
        <div class="section-title">
          <h2>演示学员</h2>
        </div>
        <div class="chip-row">${demoStudents}</div>
      </section>
    </main>
  `;
}

function renderStudentDashboard(studentId) {
  const student = getStudent(studentId);
  if (!student) {
    return `
      <main class="screen">
        ${header("学员端", { back: "student-login" })}
        <section class="empty-card">未找到学员</section>
      </main>
    `;
  }

  const next = getNextSchedule(student.id);
  const balance = cardBalance(student);
  const alerts = alertsForStudent(student);
  const records = getRecords(student.id).slice(0, 5);

  return `
    <main class="screen">
      ${header("学员端", {
        back: "home",
        right: `<button class="text-btn" type="button" data-action="go" data-target="student-login">切换</button>`
      })}

      <section class="profile-card">
        <div>
          <p class="eyebrow">绑定教练 · ${escapeHtml(student.coach)}</p>
          <h2>${escapeHtml(student.name)}</h2>
          <p>${escapeHtml(student.phone)}</p>
        </div>
        <span class="badge">${cardTypeLabel[student.cardType]}</span>
      </section>

      <section class="card next-card">
        <div class="section-title">
          <h2>下次上课</h2>
          ${next ? `<span>${escapeHtml(next.coach)}</span>` : ""}
        </div>
        ${
          next
            ? `<div class="next-time">${formatDateTime(next.startsAt)}</div>
               <div class="next-meta">
                 <span>${escapeHtml(next.courseName)}</span>
                 <span>${escapeHtml(next.location)}</span>
               </div>`
            : `<div class="empty-inline">暂无上课安排</div>`
        }
      </section>

      <section class="card balance-card">
        <div class="section-title">
          <h2>剩余课时/卡时</h2>
          <span>${escapeHtml(student.cardName)}</span>
        </div>
        <div class="balance-main">${escapeHtml(balance.main)}</div>
        <p>${escapeHtml(balance.sub)}</p>
        <div class="progress"><span style="width:${balance.percent}%"></span></div>
      </section>

      <section class="card">
        <div class="section-title">
          <h2>提醒</h2>
        </div>
        ${renderAlerts(alerts)}
      </section>

      <section class="card">
        <div class="section-title">
          <h2>最近训练记录</h2>
        </div>
        ${
          records.length
            ? `<div class="record-list">${records.map(renderRecordItem).join("")}</div>`
            : `<div class="empty-inline">暂无训练记录</div>`
        }
      </section>
    </main>
  `;
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    return `<div class="empty-inline">当前状态正常</div>`;
  }
  return `
    <div class="alert-list">
      ${alerts
        .map(
          (alert) => `
            <div class="alert ${alert.tone}">
              <strong>${escapeHtml(alert.title)}</strong>
              <span>${escapeHtml(alert.text)}</span>
            </div>
          `
        )
        .join("")}
    </div>
  `;
}

function renderRecordItem(record, editable = false) {
  const student = getStudent(record.studentId);
  return `
    <article class="record-item">
      <div>
        <div class="record-head">
          <strong>${escapeHtml(record.courseName)}</strong>
          <span>${formatDateTime(record.at)}</span>
        </div>
        <p>${escapeHtml(record.note)}</p>
        <small>${escapeHtml(record.coach)}${student ? ` · ${escapeHtml(student.name)}` : ""}${record.usedLessons ? ` · 扣 ${record.usedLessons} 节` : ""}</small>
      </div>
      ${
        editable
          ? `<button class="mini-btn" type="button" data-action="open-modal" data-modal="record" data-id="${escapeHtml(record.id)}">编辑</button>`
          : ""
      }
    </article>
  `;
}

function renderAdmin() {
  if (!state.adminToken) {
    return renderAdminLogin();
  }

  const upcoming = allUpcomingSchedules(6);
  const lowStudents = lowLessonStudents();
  const expiring = expiringStudents();
  const alertStudents = [...new Set([...lowStudents, ...expiring])];

  return `
    <main class="screen admin-screen">
      ${header("教练后台", {
        back: "home",
        right: `
          <div class="admin-top-actions">
            <button class="text-btn" type="button" data-action="admin-logout">退出</button>
            <button class="text-btn" type="button" data-action="open-modal" data-modal="student">新增</button>
          </div>
        `
      })}

      <section class="admin-stats">
        ${statCard("学员", state.db.students.length)}
        ${statCard("近期课", upcoming.length)}
        ${statCard("课时低", lowStudents.length)}
        ${statCard("将到期", expiring.length)}
      </section>

      <section class="card">
        <div class="section-title">
          <h2>近期上课</h2>
          <button class="mini-btn" type="button" data-action="open-modal" data-modal="schedule">排课</button>
        </div>
        ${
          upcoming.length
            ? `<div class="schedule-list">${upcoming.map(renderScheduleItem).join("")}</div>`
            : `<div class="empty-inline">暂无近期课程</div>`
        }
      </section>

      <section class="card">
        <div class="section-title">
          <h2>重点提醒</h2>
        </div>
        ${
          alertStudents.length
            ? `<div class="student-alert-list">${alertStudents.map(renderCompactStudentAlert).join("")}</div>`
            : `<div class="empty-inline">暂无重点提醒</div>`
        }
      </section>

      <section class="card">
        <div class="section-title">
          <h2>学员列表</h2>
          <span>${state.db.students.length} 人</span>
        </div>
        <div class="student-list">
          ${state.db.students.map(renderStudentAdminCard).join("")}
        </div>
      </section>

      <section class="card">
        <div class="section-title">
          <h2>最近扣课</h2>
          <button class="mini-btn" type="button" data-action="open-modal" data-modal="record">扣课</button>
        </div>
        <div class="record-list">
          ${state.db.records
            .slice()
            .sort((a, b) => new Date(b.at) - new Date(a.at))
            .slice(0, 6)
            .map((record) => renderRecordItem(record, true))
            .join("")}
        </div>
      </section>
    </main>
  `;
}

function renderAdminLogin() {
  return `
    <main class="screen">
      ${header("教练后台", { back: "home" })}
      <section class="card login-card">
        <div class="section-title">
          <h2>后台口令</h2>
        </div>
        <form id="admin-login-form" class="form">
          <label>
            访问口令
            <input name="password" type="password" placeholder="请输入后台口令" autocomplete="current-password" required />
          </label>
          ${state.error ? `<p class="form-error">${escapeHtml(state.error)}</p>` : ""}
          <button class="primary-btn" type="submit">进入后台</button>
        </form>
      </section>
    </main>
  `;
}

function statCard(label, value) {
  return `
    <div class="stat-card">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `;
}

function renderScheduleItem(schedule) {
  const student = getStudent(schedule.studentId);
  return `
    <article class="schedule-item">
      <div class="date-pill">
        <strong>${new Date(schedule.startsAt).getDate()}</strong>
        <span>${new Date(schedule.startsAt).toLocaleDateString("zh-CN", { month: "2-digit" })}</span>
      </div>
      <div>
        <strong>${escapeHtml(schedule.courseName)}</strong>
        <p>${formatDateTime(schedule.startsAt)} · ${escapeHtml(schedule.location)}</p>
        <small>${escapeHtml(student?.name || "未知学员")} · ${escapeHtml(schedule.coach)}</small>
      </div>
      <button class="mini-btn" type="button" data-action="open-modal" data-modal="schedule" data-id="${escapeHtml(schedule.id)}">编辑</button>
    </article>
  `;
}

function renderCompactStudentAlert(student) {
  const alerts = alertsForStudent(student).filter((alert) => alert.tone !== "info");
  const balance = cardBalance(student);
  return `
    <article class="compact-alert">
      <div>
        <strong>${escapeHtml(student.name)}</strong>
        <p>${escapeHtml(balance.main)} · ${escapeHtml(student.cardName)}</p>
      </div>
      <span>${alerts.map((alert) => escapeHtml(alert.title)).join(" / ")}</span>
    </article>
  `;
}

function renderStudentAdminCard(student) {
  const balance = cardBalance(student);
  const next = getNextSchedule(student.id);
  const records = getRecords(student.id).slice(0, 2);
  return `
    <article class="student-card">
      <div class="student-card-head">
        <div>
          <strong>${escapeHtml(student.name)}</strong>
          <p>${escapeHtml(student.phone)} · ${escapeHtml(student.coach)}</p>
        </div>
        <span class="badge">${escapeHtml(balance.main)}</span>
      </div>
      <div class="student-card-body">
        <p>${escapeHtml(student.cardName)} · 到期 ${formatDate(student.expiresAt)}</p>
        <p>${next ? `下次 ${formatDateTime(next.startsAt)} · ${escapeHtml(next.courseName)}` : "暂无下次课程"}</p>
      </div>
      <div class="action-row">
        <button class="mini-btn" type="button" data-action="open-modal" data-modal="student" data-id="${escapeHtml(student.id)}">编辑</button>
        <button class="mini-btn" type="button" data-action="open-modal" data-modal="schedule" data-student-id="${escapeHtml(student.id)}">排课</button>
        <button class="mini-btn" type="button" data-action="open-modal" data-modal="record" data-student-id="${escapeHtml(student.id)}">扣课</button>
        <button class="mini-btn" type="button" data-action="go" data-target="student/${escapeHtml(student.id)}">学员端</button>
      </div>
      ${
        records.length
          ? `<div class="inline-records">${records.map((record) => `<span>${escapeHtml(record.courseName)} · ${formatDateTime(record.at)}</span>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function renderModal() {
  if (!state.modal) return "";
  const content = state.modal.type === "student" ? renderStudentForm() : state.modal.type === "schedule" ? renderScheduleForm() : renderRecordForm();
  return `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal-sheet" role="dialog" aria-modal="true" onclick="event.stopPropagation()">
        ${content}
      </section>
    </div>
  `;
}

function inputValue(value) {
  return escapeHtml(value ?? "");
}

function renderStudentOptions(selectedId = "") {
  return state.db.students
    .map((student) => `<option value="${escapeHtml(student.id)}" ${student.id === selectedId ? "selected" : ""}>${escapeHtml(student.name)} · ${escapeHtml(student.phone)}</option>`)
    .join("");
}

function renderCoachOptions(selected = "") {
  return state.db.coaches
    .map((coach) => `<option value="${escapeHtml(coach)}" ${coach === selected ? "selected" : ""}>${escapeHtml(coach)}</option>`)
    .join("");
}

function renderCourseOptions() {
  return `<datalist id="course-options">${state.db.courseNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>`;
}

function renderStudentForm() {
  const student = state.modal.id ? getStudent(state.modal.id) : null;
  const isEdit = Boolean(student);
  const data = student || {
    name: "",
    phone: "",
    coach: state.db.coaches[0],
    cardType: "lesson",
    cardName: "私教 10 节卡",
    remainingLessons: 10,
    totalLessons: 10,
    expiresAt: "2026-08-31"
  };

  return `
    <form id="student-form" class="form modal-form" data-id="${escapeHtml(student?.id || "")}">
      <div class="modal-head">
        <h2>${isEdit ? "编辑学员" : "新增学员"}</h2>
        <button class="icon-btn" type="button" data-action="close-modal" aria-label="关闭">×</button>
      </div>
      <label>姓名<input name="name" value="${inputValue(data.name)}" required /></label>
      <label>手机号<input name="phone" inputmode="tel" value="${inputValue(data.phone)}" required /></label>
      <label>绑定教练<select name="coach">${renderCoachOptions(data.coach)}</select></label>
      <label>
        卡种类型
        <select name="cardType">
          <option value="lesson" ${data.cardType === "lesson" ? "selected" : ""}>课时卡</option>
          <option value="time" ${data.cardType === "time" ? "selected" : ""}>时间卡</option>
        </select>
      </label>
      <label>卡种名称<input name="cardName" value="${inputValue(data.cardName)}" required /></label>
      <div class="form-grid">
        <label>剩余课时<input name="remainingLessons" type="number" min="0" step="1" value="${inputValue(data.remainingLessons ?? 0)}" /></label>
        <label>总课时<input name="totalLessons" type="number" min="0" step="1" value="${inputValue(data.totalLessons ?? 0)}" /></label>
      </div>
      <label>到期时间<input name="expiresAt" type="date" value="${inputValue(data.expiresAt)}" required /></label>
      <button class="primary-btn" type="submit">${isEdit ? "保存学员" : "创建学员"}</button>
    </form>
  `;
}

function renderScheduleForm() {
  const schedule = state.modal.id ? state.db.schedules.find((item) => item.id === state.modal.id) : null;
  const student = state.modal.studentId ? getStudent(state.modal.studentId) : null;
  const data = schedule || {
    studentId: student?.id || state.db.students[0]?.id || "",
    startsAt: "",
    courseName: "",
    coach: student?.coach || state.db.coaches[0],
    location: "A 区力量训练区",
    note: ""
  };

  return `
    <form id="schedule-form" class="form modal-form" data-id="${escapeHtml(schedule?.id || "")}">
      ${renderCourseOptions()}
      <div class="modal-head">
        <h2>${schedule ? "编辑上课安排" : "添加上课安排"}</h2>
        <button class="icon-btn" type="button" data-action="close-modal" aria-label="关闭">×</button>
      </div>
      <label>学员<select name="studentId">${renderStudentOptions(data.studentId)}</select></label>
      <label>上课时间<input name="startsAt" type="datetime-local" value="${inputValue(toDateTimeInput(data.startsAt))}" required /></label>
      <label>课程名称<input name="courseName" list="course-options" value="${inputValue(data.courseName)}" required /></label>
      <label>教练<select name="coach">${renderCoachOptions(data.coach)}</select></label>
      <label>上课地点<input name="location" value="${inputValue(data.location)}" required /></label>
      <button class="primary-btn" type="submit">${schedule ? "保存安排" : "添加安排"}</button>
    </form>
  `;
}

function renderRecordForm() {
  const record = state.modal.id ? state.db.records.find((item) => item.id === state.modal.id) : null;
  const student = state.modal.studentId ? getStudent(state.modal.studentId) : record ? getStudent(record.studentId) : state.db.students[0];
  const data = record || {
    studentId: student?.id || "",
    usedLessons: student?.cardType === "lesson" ? 1 : 0,
    at: "",
    courseName: "",
    coach: student?.coach || state.db.coaches[0],
    note: ""
  };

  return `
    <form id="record-form" class="form modal-form" data-id="${escapeHtml(record?.id || "")}">
      ${renderCourseOptions()}
      <div class="modal-head">
        <h2>${record ? "编辑扣课记录" : "新增扣课记录"}</h2>
        <button class="icon-btn" type="button" data-action="close-modal" aria-label="关闭">×</button>
      </div>
      <label>学员<select name="studentId">${renderStudentOptions(data.studentId)}</select></label>
      <div class="form-grid">
        <label>扣课数量<input name="usedLessons" type="number" min="0" step="1" value="${inputValue(data.usedLessons)}" /></label>
        <label>扣课时间<input name="at" type="datetime-local" value="${inputValue(toDateTimeInput(data.at))}" required /></label>
      </div>
      <label>课程名称<input name="courseName" list="course-options" value="${inputValue(data.courseName)}" required /></label>
      <label>教练<select name="coach">${renderCoachOptions(data.coach)}</select></label>
      <label>训练内容/身体数据备注<textarea name="note" rows="4" required>${escapeHtml(data.note)}</textarea></label>
      <button class="primary-btn" type="submit">${record ? "保存记录" : "扣课并记录"}</button>
    </form>
  `;
}

function render() {
  if (!state.db) {
    app.innerHTML = `<div class="loading-screen">加载中...</div>`;
    return;
  }

  const route = currentRoute();
  let html = "";
  if (route === "student-login") {
    html = renderLogin();
  } else if (route.startsWith("student/")) {
    html = renderStudentDashboard(route.split("/")[1]);
  } else if (route === "admin") {
    html = renderAdmin();
  } else {
    html = renderHome();
  }

  app.innerHTML = `
    ${html}
    ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    ${renderModal()}
  `;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function refreshAndRender() {
  await loadData();
  render();
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  if (action === "go") {
    go(target.dataset.target || "home");
  }

  if (action === "fill-phone") {
    const input = document.querySelector("input[name='phone']");
    const code = document.querySelector("input[name='code']");
    if (input) input.value = target.dataset.phone || "";
    if (code) code.value = state.db.gym.demoCode;
  }

  if (action === "open-modal") {
    state.modal = {
      type: target.dataset.modal,
      id: target.dataset.id || "",
      studentId: target.dataset.studentId || ""
    };
    render();
  }

  if (action === "close-modal") {
    state.modal = null;
    render();
  }

  if (action === "admin-logout") {
    state.adminToken = "";
    window.localStorage.removeItem("adminToken");
    state.modal = null;
    showToast("已退出后台");
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;

  try {
    if (form.id === "admin-login-form") {
      state.error = "";
      const result = await api("/api/admin/login", {
        method: "POST",
        body: formData(form)
      });
      state.adminToken = result.token;
      window.localStorage.setItem("adminToken", result.token);
      showToast("已进入后台");
      return;
    }

    if (form.id === "student-login-form") {
      state.error = "";
      const result = await api("/api/student/login", {
        method: "POST",
        body: formData(form)
      });
      go(`student/${result.studentId}`);
      return;
    }

    if (form.id === "student-form") {
      const id = form.dataset.id;
      const body = formData(form);
      body.remainingLessons = Number(body.remainingLessons || 0);
      body.totalLessons = Number(body.totalLessons || 0);
      await api(id ? `/api/students/${id}` : "/api/students", {
        method: id ? "PUT" : "POST",
        admin: true,
        body
      });
      state.modal = null;
      await refreshAndRender();
      showToast(id ? "学员已保存" : "学员已创建");
      return;
    }

    if (form.id === "schedule-form") {
      const id = form.dataset.id;
      const body = formData(form);
      body.startsAt = fromDateTimeInput(body.startsAt);
      await api(id ? `/api/schedules/${id}` : "/api/schedules", {
        method: id ? "PUT" : "POST",
        admin: true,
        body
      });
      state.modal = null;
      await refreshAndRender();
      showToast(id ? "上课安排已保存" : "上课安排已添加");
      return;
    }

    if (form.id === "record-form") {
      const id = form.dataset.id;
      const body = formData(form);
      body.usedLessons = Number(body.usedLessons || 0);
      body.at = fromDateTimeInput(body.at);
      await api(id ? `/api/records/${id}` : "/api/records", {
        method: id ? "PUT" : "POST",
        admin: true,
        body
      });
      state.modal = null;
      await refreshAndRender();
      showToast(id ? "扣课记录已保存" : "扣课已完成");
    }
  } catch (error) {
    if (error.message.includes("后台口令") || error.message.includes("请先输入")) {
      state.adminToken = "";
      window.localStorage.removeItem("adminToken");
      state.modal = null;
    }

    if (form.id === "student-login-form" || form.id === "admin-login-form") {
      setError(error.message);
    } else {
      showToast(error.message);
    }
  }
});

document.addEventListener("change", (event) => {
  const select = event.target.closest("select[name='studentId']");
  if (!select) return;
  const student = getStudent(select.value);
  if (!student) return;
  const form = select.closest("form");
  const coach = form?.querySelector("select[name='coach']");
  const usedLessons = form?.querySelector("input[name='usedLessons']");
  if (coach) coach.value = student.coach;
  if (usedLessons && !form.dataset.id) usedLessons.value = student.cardType === "lesson" ? "1" : "0";
});

window.addEventListener("hashchange", () => {
  state.error = "";
  state.modal = null;
  render();
});

loadData()
  .then(render)
  .catch((error) => {
    app.innerHTML = `<div class="loading-screen">启动失败：${escapeHtml(error.message)}</div>`;
  });
