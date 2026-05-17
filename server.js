const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, "data");
const dataFile = path.join(dataDir, "db.json");
const bundledDataFile = path.join(rootDir, "data", "db.json");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || "haobai2026";
const adminSessionToken = crypto.randomBytes(32).toString("hex");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function seedData() {
  return {
    gym: {
      name: "浩柏健身",
      location: "",
      demoCode: "123456"
    },
    coaches: ["陈教练", "周教练", "刘教练"],
    courseNames: ["力量训练", "体态矫正", "燃脂训练", "功能训练", "私教复训"],
    students: [
      {
        id: "stu_zhangyu",
        name: "张雨",
        phone: "13800010001",
        coach: "陈教练",
        cardType: "lesson",
        cardName: "私教 20 节卡",
        remainingLessons: 12,
        totalLessons: 20,
        expiresAt: "2026-08-31",
        createdAt: "2026-05-01T09:00:00.000Z"
      },
      {
        id: "stu_linke",
        name: "林可",
        phone: "13800010002",
        coach: "周教练",
        cardType: "lesson",
        cardName: "私教 10 节卡",
        remainingLessons: 2,
        totalLessons: 10,
        expiresAt: "2026-06-30",
        createdAt: "2026-05-03T10:20:00.000Z"
      },
      {
        id: "stu_wangchen",
        name: "王晨",
        phone: "13800010003",
        coach: "刘教练",
        cardType: "time",
        cardName: "月卡",
        remainingLessons: null,
        totalLessons: null,
        expiresAt: "2026-05-23",
        createdAt: "2026-05-05T12:30:00.000Z"
      }
    ],
    schedules: [
      {
        id: "sch_zhangyu_next",
        studentId: "stu_zhangyu",
        startsAt: "2026-05-18T19:00:00+08:00",
        courseName: "力量训练",
        coach: "陈教练",
        location: "A 区力量训练区",
        note: ""
      },
      {
        id: "sch_linke_next",
        studentId: "stu_linke",
        startsAt: "2026-05-17T18:30:00+08:00",
        courseName: "体态矫正",
        coach: "周教练",
        location: "B 区私教室",
        note: ""
      },
      {
        id: "sch_wangchen_next",
        studentId: "stu_wangchen",
        startsAt: "2026-05-20T20:00:00+08:00",
        courseName: "燃脂训练",
        coach: "刘教练",
        location: "C 区有氧区",
        note: ""
      }
    ],
    records: [
      {
        id: "rec_zhangyu_1",
        studentId: "stu_zhangyu",
        usedLessons: 1,
        at: "2026-05-14T19:00:00+08:00",
        courseName: "下肢力量",
        coach: "陈教练",
        note: "深蹲 4 组，硬拉 3 组，核心稳定训练；体重 62.4kg。"
      },
      {
        id: "rec_zhangyu_2",
        studentId: "stu_zhangyu",
        usedLessons: 1,
        at: "2026-05-10T10:00:00+08:00",
        courseName: "上肢力量",
        coach: "陈教练",
        note: "卧推技术调整，划船 4 组，肩胛控制练习。"
      },
      {
        id: "rec_linke_1",
        studentId: "stu_linke",
        usedLessons: 1,
        at: "2026-05-15T18:30:00+08:00",
        courseName: "体态矫正",
        coach: "周教练",
        note: "肩颈放松，髋屈肌拉伸，弹力带激活训练。"
      },
      {
        id: "rec_wangchen_1",
        studentId: "stu_wangchen",
        usedLessons: 0,
        at: "2026-05-13T20:00:00+08:00",
        courseName: "燃脂循环",
        coach: "刘教练",
        note: "椭圆机热身 10 分钟，循环训练 5 轮，心率控制良好。"
      }
    ]
  };
}

async function ensureDataFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    let initialData = seedData();
    if (path.resolve(dataFile) !== path.resolve(bundledDataFile)) {
      try {
        initialData = JSON.parse(await fs.readFile(bundledDataFile, "utf8"));
      } catch {
        initialData = seedData();
      }
    }
    await fs.writeFile(dataFile, JSON.stringify(initialData, null, 2), "utf8");
  }
}

async function readDb() {
  await ensureDataFile();
  const raw = await fs.readFile(dataFile, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  await fs.writeFile(dataFile, JSON.stringify(db, null, 2), "utf8");
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.status = 400;
    throw error;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function readAdminToken(req) {
  return String(req.headers["x-admin-token"] || "").trim();
}

function isAdminRequest(req) {
  return readAdminToken(req) === adminSessionToken;
}

function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  sendJson(res, 401, { message: "请先输入后台口令" });
  return false;
}

function normalizeStudent(input) {
  const cardType = input.cardType === "time" ? "time" : "lesson";
  const remainingLessons = cardType === "lesson" ? Math.max(0, Number(input.remainingLessons || 0)) : null;
  const totalLessons = cardType === "lesson" ? Math.max(remainingLessons, Number(input.totalLessons || remainingLessons || 0)) : null;

  return {
    name: String(input.name || "").trim(),
    phone: String(input.phone || "").trim(),
    coach: String(input.coach || "").trim(),
    cardType,
    cardName: String(input.cardName || (cardType === "lesson" ? "私教课时卡" : "时间卡")).trim(),
    remainingLessons,
    totalLessons,
    expiresAt: String(input.expiresAt || "").trim()
  };
}

function validateStudent(student) {
  if (!student.name) return "请填写学员姓名";
  if (!/^1\d{10}$/.test(student.phone)) return "请填写 11 位手机号";
  if (!student.coach) return "请填写绑定教练";
  if (!student.cardName) return "请填写卡种名称";
  if (!student.expiresAt) return "请填写到期时间";
  return null;
}

function normalizeSchedule(input) {
  return {
    studentId: String(input.studentId || "").trim(),
    startsAt: String(input.startsAt || "").trim(),
    courseName: String(input.courseName || "").trim(),
    coach: String(input.coach || "").trim(),
    location: String(input.location || "").trim(),
    note: String(input.note || "").trim()
  };
}

function validateSchedule(schedule, db) {
  if (!db.students.some((student) => student.id === schedule.studentId)) return "请选择学员";
  if (!schedule.startsAt) return "请选择上课时间";
  if (!schedule.courseName) return "请填写课程名称";
  if (!schedule.coach) return "请填写教练";
  if (!schedule.location) return "请填写上课地点";
  return null;
}

function normalizeRecord(input) {
  return {
    studentId: String(input.studentId || "").trim(),
    usedLessons: Math.max(0, Number(input.usedLessons || 0)),
    at: String(input.at || "").trim(),
    courseName: String(input.courseName || "").trim(),
    coach: String(input.coach || "").trim(),
    note: String(input.note || "").trim()
  };
}

function validateRecord(record, db) {
  if (!db.students.some((student) => student.id === record.studentId)) return "请选择学员";
  if (!record.at) return "请选择扣课时间";
  if (!record.courseName) return "请填写课程名称";
  if (!record.coach) return "请填写教练";
  if (!record.note) return "请填写训练内容/身体数据备注";
  return null;
}

function applyLessonDelta(db, studentId, delta) {
  const student = db.students.find((item) => item.id === studentId);
  if (!student || student.cardType !== "lesson") return;
  student.remainingLessons = Math.max(0, Number(student.remainingLessons || 0) + delta);
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  const db = await readDb();

  if (method === "POST" && url.pathname === "/api/admin/login") {
    const body = await parseJsonBody(req);
    if (String(body.password || "") !== adminPassword) {
      return sendJson(res, 401, { message: "后台口令不正确" });
    }
    return sendJson(res, 200, { token: adminSessionToken });
  }

  if (method === "GET" && url.pathname === "/api/admin/status") {
    return sendJson(res, isAdminRequest(req) ? 200 : 401, {
      authenticated: isAdminRequest(req)
    });
  }

  if (method === "GET" && url.pathname === "/api/bootstrap") {
    return sendJson(res, 200, db);
  }

  if (method === "POST" && url.pathname === "/api/student/login") {
    const body = await parseJsonBody(req);
    const phone = String(body.phone || "").trim();
    const code = String(body.code || "").trim();
    if (code !== db.gym.demoCode) {
      return sendJson(res, 401, { message: "验证码不正确" });
    }
    const student = db.students.find((item) => item.phone === phone);
    if (!student) {
      return sendJson(res, 404, { message: "未找到该手机号对应的学员" });
    }
    return sendJson(res, 200, { studentId: student.id });
  }

  if (method === "POST" && url.pathname === "/api/students") {
    if (!requireAdmin(req, res)) return;
    const student = normalizeStudent(await parseJsonBody(req));
    const error = validateStudent(student);
    if (error) return sendJson(res, 400, { message: error });
    if (db.students.some((item) => item.phone === student.phone)) {
      return sendJson(res, 409, { message: "该手机号已存在" });
    }
    const created = {
      id: createId("stu"),
      ...student,
      createdAt: new Date().toISOString()
    };
    db.students.push(created);
    await writeDb(db);
    return sendJson(res, 201, created);
  }

  const studentMatch = url.pathname.match(/^\/api\/students\/([^/]+)$/);
  if (method === "PUT" && studentMatch) {
    if (!requireAdmin(req, res)) return;
    const studentId = studentMatch[1];
    const index = db.students.findIndex((item) => item.id === studentId);
    if (index === -1) return sendJson(res, 404, { message: "学员不存在" });
    const normalized = normalizeStudent(await parseJsonBody(req));
    const error = validateStudent(normalized);
    if (error) return sendJson(res, 400, { message: error });
    if (db.students.some((item) => item.phone === normalized.phone && item.id !== studentId)) {
      return sendJson(res, 409, { message: "该手机号已存在" });
    }
    db.students[index] = {
      ...db.students[index],
      ...normalized
    };
    await writeDb(db);
    return sendJson(res, 200, db.students[index]);
  }

  if (method === "POST" && url.pathname === "/api/schedules") {
    if (!requireAdmin(req, res)) return;
    const schedule = normalizeSchedule(await parseJsonBody(req));
    const error = validateSchedule(schedule, db);
    if (error) return sendJson(res, 400, { message: error });
    const created = { id: createId("sch"), ...schedule };
    db.schedules.push(created);
    await writeDb(db);
    return sendJson(res, 201, created);
  }

  const scheduleMatch = url.pathname.match(/^\/api\/schedules\/([^/]+)$/);
  if (method === "PUT" && scheduleMatch) {
    if (!requireAdmin(req, res)) return;
    const scheduleId = scheduleMatch[1];
    const index = db.schedules.findIndex((item) => item.id === scheduleId);
    if (index === -1) return sendJson(res, 404, { message: "上课安排不存在" });
    const schedule = normalizeSchedule(await parseJsonBody(req));
    const error = validateSchedule(schedule, db);
    if (error) return sendJson(res, 400, { message: error });
    db.schedules[index] = { id: scheduleId, ...schedule };
    await writeDb(db);
    return sendJson(res, 200, db.schedules[index]);
  }

  if (method === "POST" && url.pathname === "/api/records") {
    if (!requireAdmin(req, res)) return;
    const record = normalizeRecord(await parseJsonBody(req));
    const error = validateRecord(record, db);
    if (error) return sendJson(res, 400, { message: error });
    const created = { id: createId("rec"), ...record };
    db.records.push(created);
    applyLessonDelta(db, record.studentId, -record.usedLessons);
    await writeDb(db);
    return sendJson(res, 201, created);
  }

  const recordMatch = url.pathname.match(/^\/api\/records\/([^/]+)$/);
  if (method === "PUT" && recordMatch) {
    if (!requireAdmin(req, res)) return;
    const recordId = recordMatch[1];
    const index = db.records.findIndex((item) => item.id === recordId);
    if (index === -1) return sendJson(res, 404, { message: "扣课记录不存在" });
    const current = db.records[index];
    const next = normalizeRecord(await parseJsonBody(req));
    const error = validateRecord(next, db);
    if (error) return sendJson(res, 400, { message: error });
    applyLessonDelta(db, current.studentId, Number(current.usedLessons || 0));
    applyLessonDelta(db, next.studentId, -next.usedLessons);
    db.records[index] = { id: recordId, ...next };
    await writeDb(db);
    return sendJson(res, 200, db.records[index]);
  }

  return sendJson(res, 404, { message: "API not found" });
}

async function serveStatic(req, res, url) {
  const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(publicDir, safePath === "/" ? "index.html" : safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    const fallback = await fs.readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fallback);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url);
  } catch (error) {
    const status = error.status || 500;
    sendJson(res, status, { message: error.message || "Server error" });
  }
});

ensureDataFile().then(() => {
  server.listen(port, host, () => {
    console.log(`Gym MVP running at http://${host}:${port}`);
    console.log(`Data file: ${dataFile}`);
  });
});
