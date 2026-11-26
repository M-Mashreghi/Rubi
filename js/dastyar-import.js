/* Moving from Dastyar.
 * Rubi cannot read another extension's storage, so the person runs a short snippet once in Dastyar's own tab
 * (DevTools console). It saves Dastyar's local data, without sign-in tokens, to dastyar-export.json.
 * This file reads that export (or any similar JSON) and turns it into Rubi tasks, boards, labels, notes and bookmarks.
 * Dastyar's formats changed between versions, so the reader looks at the shape of each object rather than exact keys. */
(function () {
	"use strict";

	// The snippet the person pastes into the console of Dastyar's new tab page.
	const SNIPPET = `(async () => {
  const SECRET = /auth|token|session|password|cookie|secret|jwt/i;
  const BULKY = /^(background|background-data|forecast|weather|font|hooshang)/i;
  const clean = (v, d = 0) => {
    if (d > 40 || v == null) return v;
    if (typeof v === "string") return v.length > 200000 ? undefined : v;
    if (Array.isArray(v)) return v.map((x) => clean(x, d + 1));
    if (typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) o[k] = clean(x, d + 1);
      return o;
    }
    return v;
  };
  const store = await chrome.storage.local.get(null);
  for (const k of Object.keys(store)) if (SECRET.test(k) || BULKY.test(k)) delete store[k];
  const ls = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!SECRET.test(k) && !BULKY.test(k)) ls[k] = localStorage.getItem(k);
  }
  const out = { source: "dastyar", exportedAt: new Date().toISOString(), storage: clean(store), localStorage: clean(ls) };
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" }));
  a.download = "dastyar-export.json";
  a.click();
  console.log("dastyar-export.json saved");
})();`;

	/* ---------- dates ---------- */
	const pad = (n) => String(n).padStart(2, "0");
	const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	// Jalali (Persian) to Gregorian, from the jalaali-js algorithm.
	function j2g(jy, jm, jd) {
		const div = (a, b) => ~~(a / b);
		const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
		const gy = jy + 621;
		let leapJ = -14, jp = breaks[0], jump = 0;
		for (let i = 1; i < breaks.length; i++) {
			const jm2 = breaks[i];
			jump = jm2 - jp;
			if (jy < jm2) break;
			leapJ += div(jump, 33) * 8 + div(jump % 33, 4);
			jp = jm2;
		}
		let n = jy - jp;
		leapJ += div(n, 33) * 8 + div((n % 33) + 3, 4);
		if (jump % 33 === 4 && jump - n === 4) leapJ += 1;
		const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
		const march = 20 + leapJ - leapG;
		const g2d = (y, m, d) => {
			let x = div((y + div(m - 8, 6) + 100100) * 1461, 4) + div(153 * ((m + 9) % 12) + 2, 5) + d - 34840408;
			return x - div(div(y + 100100 + div(m - 8, 6), 100) * 3, 4) + 752;
		};
		const jdn = g2d(gy, 3, march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
		let j = 4 * jdn + 139361631;
		j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
		const i = div(j % 1461, 4) * 5 + 308;
		const d = div(i % 153, 5) + 1;
		const m = (div(i, 153) % 12) + 1;
		const y = div(j, 1461) - 100100 + div(8 - m, 6);
		return `${y}-${pad(m)}-${pad(d)}`;
	}
	const fromParts = (y, m, d) => {
		y = Number(y); m = Number(m); d = Number(d);
		if (!y || !m || !d || m > 12 || d > 31) return "";
		return y < 1700 ? j2g(y, m, d) : `${y}-${pad(m)}-${pad(d)}`;
	};
	/** Returns { due: "yyyy-mm-dd", time: "HH:MM" } from whatever date shape Dastyar used. */
	function readDate(v) {
		if (v == null || v === "") return {};
		if (typeof v === "object" && !Array.isArray(v)) {
			if (v.year != null) {
				const due = fromParts(v.year, v.month, v.day);
				const time = v.hour != null ? `${pad(v.hour)}:${pad(v.minute || 0)}` : "";
				return due ? { due, time } : {};
			}
			return readDate(v.date || v.value || v.start || v.dateTime || v.iso);
		}
		if (typeof v === "number") {
			const d = new Date(v < 1e11 ? v * 1000 : v);
			return isNaN(d) ? {} : withTime(d);
		}
		const s = String(v).trim();
		let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
		if (m) return { due: fromParts(m[1], m[2], m[3]) };
		m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(s);
		if (m && Number(m[1]) < 1700) return { due: fromParts(m[1], m[2], m[3]), time: `${pad(m[4])}:${m[5]}` };
		const d = new Date(s);
		return isNaN(d) ? {} : withTime(d);
	}
	function withTime(d) {
		const time = d.getHours() || d.getMinutes() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
		return { due: ymd(d), time };
	}
	const readTime = (v) => {
		const m = /^(\d{1,2}):(\d{2})/.exec(String(v || ""));
		return m ? `${pad(m[1])}:${m[2]}` : "";
	};

	/* ---------- field readers ---------- */
	const str = (...vals) => {
		for (const v of vals) if (typeof v === "string" && v.trim()) return v.trim();
		return "";
	};
	const COLOR_HEX = { teal: [20, 184, 166], blue: [59, 130, 246], indigo: [99, 102, 241], purple: [168, 85, 247], pink: [236, 72, 153], red: [239, 68, 68], orange: [249, 115, 22], amber: [245, 158, 11], green: [34, 197, 94], slate: [100, 116, 139] };
	function colorKey(c) {
		if (typeof c !== "string" || !c) return "";
		const lc = c.toLowerCase();
		if (COLOR_HEX[lc]) return lc;
		const alias = { yellow: "amber", violet: "purple", cyan: "teal", gray: "slate", grey: "slate", black: "slate", brown: "orange", navy: "indigo", lime: "green" };
		if (alias[lc]) return alias[lc];
		const m = /^#?([0-9a-f]{6})$/i.exec(lc);
		if (!m) return "";
		const n = parseInt(m[1], 16), rgb = [n >> 16, (n >> 8) & 255, n & 255];
		let best = "slate", bd = Infinity;
		for (const [k, v] of Object.entries(COLOR_HEX)) {
			const dd = (v[0] - rgb[0]) ** 2 + (v[1] - rgb[1]) ** 2 + (v[2] - rgb[2]) ** 2;
			if (dd < bd) { bd = dd; best = k; }
		}
		return best;
	}
	function readPriority(p) {
		if (p == null || p === "") return 0;
		if (typeof p === "string") {
			if (/high|urgent|زیاد|بالا|فوری|3/i.test(p)) return 3;
			if (/med|normal|متوسط|2/i.test(p)) return 2;
			if (/low|کم|پایین|1/i.test(p)) return 1;
			return 0;
		}
		const n = Number(p);
		return isFinite(n) ? Math.max(0, Math.min(3, Math.round(n))) : 0;
	}
	function readRepeat(o) {
		const r = JSON.stringify([o.repeat, o.recurrence, o.rrule, o.frequency, o.repeatType, o.recurring] ?? "").toLowerCase();
		if (/weekday|business/.test(r)) return "weekdays";
		if (/daily|day|روز/.test(r)) return "daily";
		if (/weekly|week|هفت/.test(r)) return "weekly";
		if (/monthly|month|ماه/.test(r)) return "monthly";
		if (/yearly|annual|year|سال/.test(r)) return "yearly";
		return "";
	}
	const isDone = (o) => !!(o.done || o.completed || o.isDone || o.isCompleted || o.checked || o.finished || /^(done|completed|finished)$/i.test(String(o.status || "")) || o.completedAt || o.doneAt);

	/* ---------- walking the export ---------- */
	// Keys whose contents are copies, queues or junk rather than the real items.
	const SKIP = /outbox|dirty|undo|occurrence|pending|failure|draft|prepared|trash|removed|deleted|auth|token|session|background|forecast|weather|hooshang|promo|banner|limit|membership|_converted$|^base$/i;
	function contextOf(key, ctx) {
		const k = key.toLowerCase();
		if (/birthday/.test(k)) return "birthday";
		if (/label|tag/.test(k)) return "label";
		if (/todo|task/.test(k)) return "todo";
		if (/note/.test(k)) return "note";
		if (/bookmark|shortcut|speed.?dial/.test(k)) return "bookmark";
		return ctx;
	}

	/* Newer Dastyar keeps shortcuts as { root: [...], <folderId>: [...] }: lists of children per parent,
	 * each child { id, type: "bookmark" | "folder", name, url, position, parentId }. This rebuilds that tree
	 * exactly (same order, folders inside folders). Returns null when the export has no such tree. */
	function findTree(v, depth = 0) {
		if (!v || typeof v !== "object" || depth > 4) return null;
		if (!Array.isArray(v) && Array.isArray(v.root) && v.root.some((x) => x && typeof x === "object" && "parentId" in x && /bookmark|folder/.test(x.type))) return v;
		for (const [k, x] of Object.entries(v)) {
			if (SKIP.test(k) || typeof x !== "object") continue;
			const t = findTree(x, depth + 1);
			if (t) return t;
		}
		return null;
	}
	function readTree(map) {
		const seenIds = new Set();
		const kids = (pid, depth) => {
			if (depth > 8) return [];
			return (map[String(pid)] || []).filter((x) => x && typeof x === "object").sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).flatMap((x) => {
				if (seenIds.has(x.id)) return [];
				seenIds.add(x.id);
				const name = str(x.name, x.title);
				if (x.type === "folder") return [{ kind: "folder", name: name || "📁", emoji: str(x.emoji), children: kids(x.id, depth + 1) }];
				const url = str(x.url, x.link);
				if (!url || !/^(https?|ftp):\/\//i.test(url)) return [];
				return [{ kind: "bookmark", name: name || url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0], url, emoji: str(x.emoji) }];
			});
		};
		return kids("root", 0);
	}
	// Dastyar's saved site icons: { "https://site.com": "data:image/png;base64,…" }
	function findFavicons(v, depth = 0) {
		if (!v || typeof v !== "object" || depth > 3) return {};
		if (v.favicons && typeof v.favicons === "object" && !Array.isArray(v.favicons)) {
			const out = {};
			for (const [k, x] of Object.entries(v.favicons)) if (/^https?:\/\//.test(k) && typeof x === "string" && /^data:image\//.test(x) && x.length < 60000) out[k.replace(/\/$/, "")] = x;
			return out;
		}
		for (const x of Object.values(v)) { const r = findFavicons(x, depth + 1); if (Object.keys(r).length) return r; }
		return {};
	}

	function collect(root) {
		const found = { todos: [], boards: [], labels: new Map(), notes: [], bookmarks: [], birthdays: [], tree: null, favicons: {} };
		const seen = new WeakSet();
		const treeMap = findTree(root);
		if (treeMap) found.tree = readTree(treeMap);
		found.favicons = findFavicons(root);

		function board(b) {
			const groups = Array.isArray(b.groups) ? b.groups : [];
			if (Array.isArray(b.ungrouped)) b.ungrouped.forEach((x) => todo(x, null));
			groups.forEach((g) => group(g));
		}
		function group(g) {
			if (!g || typeof g !== "object") return;
			const name = str(g.title, g.name, g.label);
			const key = name ? `${name}` : null;
			if (name) found.boards.push({ key, name, color: colorKey(g.color) });
			(g.todos || g.tasks || g.items || []).forEach((x) => todo(x, key));
		}
		function todo(o, boardKey) {
			if (!o || typeof o !== "object" || seen.has(o)) return;
			seen.add(o);
			const text = str(o.title, o.name, o.text, o.content, o.body);
			if (!text) return;
			const dateSrc = o.dueDate ?? o.due ?? o.date ?? o.deadline ?? o.dueAt ?? o.scheduledAt ?? o.startDate ?? o.dateTime;
			const dt = readDate(dateSrc);
			const time = dt.time || readTime(o.time || o.dueTime || o.startTime || o.reminderTime);
			const lbls = (Array.isArray(o.labels) ? o.labels : Array.isArray(o.tags) ? o.tags : []).map((l) => (typeof l === "object" && l ? (label(l), String(l.id ?? l.uuid ?? l.name ?? l.title)) : String(l)));
			found.todos.push({
				text,
				desc: str(o.description, o.desc, o.note, o.details) !== text ? str(o.description, o.desc, o.note, o.details) : "",
				done: isDone(o),
				priority: readPriority(o.priority ?? o.importance),
				due: dt.due || "",
				time: dt.due ? time : "",
				repeat: readRepeat(o),
				remind: !!(o.reminder || o.remind || o.hasReminder || o.reminderTime) && !!dt.due && !!time,
				labelRefs: lbls,
				boardKey: boardKey ?? null,
				groupRef: o.groupId ?? o.group ?? o.boardId ?? null,
				created: Number(new Date(o.createdAt || o.created_at || o.created || 0)) || 0,
			});
		}
		function label(o) {
			const name = str(o.name, o.title, o.label);
			if (!name) return;
			const ids = [o.id, o.uuid, o.serverUuid, o._id, name].filter((x) => x != null).map(String);
			const rec = { name, color: colorKey(o.color) };
			ids.forEach((id) => found.labels.set(id, rec));
		}
		function note(o) {
			const title = str(o.title, o.note_title, o.name, o.subject);
			let body = str(o.text, o.body, o.content, o.note_text, o.description, o.note);
			if (body === title) body = "";
			if (!title && !body) return;
			found.notes.push({ title, body, pinned: !!(o.pinned || o.isPinned) });
		}
		function bookmark(o, depth = 0, folder = null) {
			if (depth > 6 || !o || typeof o !== "object") return;
			const url = str(o.url, o.link, o.href, o.address);
			const emoji = str(o.emoji, Array.isArray(o.emojis) ? o.emojis[0] : o.emojis);
			if (url && /^(https?|ftp):\/\//i.test(url)) {
				found.bookmarks.push({ title: str(o.title, o.name, o.label) || url.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0], url, emoji: emoji.length <= 8 ? emoji : "", folder });
				return;
			}
			const kids = o.items || o.children || o.bookmarks || o.links;
			const name = str(o.title, o.name, o.label);
			if (Array.isArray(kids)) kids.forEach((k) => bookmark(k, depth + 1, name ? { name, emoji: emoji.length <= 8 ? emoji : "" } : folder));
		}
		function birthday(o) {
			const name = str(o.name, o.title, o.fullName);
			const dt = readDate(o.date ?? o.birthday ?? o.birthDate ?? (o.year != null || o.month != null ? { year: o.year || 2000, month: o.month, day: o.day } : null));
			if (name && dt.due) found.birthdays.push({ name, due: dt.due });
		}

		function walk(v, ctx, depth) {
			if (depth > 14 || v == null) return;
			if (typeof v === "string") {
				const s = v.trim();
				if (s.length > 1 && s.length < 3e6 && (s[0] === "{" || s[0] === "[")) {
					try {
						walk(JSON.parse(s), ctx, depth + 1);
					} catch {}
				}
				return;
			}
			if (Array.isArray(v)) return v.forEach((x) => walk(x, ctx, depth + 1));
			if (typeof v !== "object") return;
			// Dastyar's task board: { groups: [{ title, color, todos: [...] }], ungrouped: [...] }
			if (Array.isArray(v.groups) && (Array.isArray(v.ungrouped) || v.groups.some((g) => g && Array.isArray(g.todos)))) return board(v);
			if (ctx === "todo" && Array.isArray(v.todos) && str(v.title, v.name)) return group(v);
			const hasText = !!str(v.title, v.name, v.text, v.content, v.body);
			if (ctx === "label" && str(v.name, v.title) && (v.color != null || v.id != null || v.uuid != null) && !Array.isArray(v.items)) return label(v);
			// When the shortcut tree was found, older copies of the shortcuts (and pinned ads) are left out.
			if (ctx === "bookmark" && found.tree) return;
			if (ctx === "bookmark" && (str(v.url, v.link, v.href) || Array.isArray(v.items) || Array.isArray(v.children))) return bookmark(v);
			if (ctx === "todo" && hasText && ("done" in v || "completed" in v || "isDone" in v || "status" in v || "priority" in v || "dueDate" in v || "labels" in v || "groupId" in v || "orderIndex" in v)) return todo(v, null);
			if (ctx === "note" && (str(v.text, v.body, v.content, v.note_text, v.description) || (str(v.title, v.note_title) && !Array.isArray(v.notes)))) {
				if (!Object.values(v).some((x) => x && typeof x === "object" && !Array.isArray(x) && (x.text || x.body || x.title))) return note(v);
			}
			if (ctx === "birthday" && str(v.name, v.title) && (v.date || v.birthday || v.birthDate || v.month != null)) return birthday(v);
			for (const [k, x] of Object.entries(v)) {
				if (SKIP.test(k) || (found.tree && /^(bookmarks?(_new)?|pinned.*|favicons?)$/i.test(k))) continue;
				walk(x, contextOf(k, ctx), depth + 1);
			}
		}
		walk(root, null, 0);
		return found;
	}

	/** Builds the Rubi items and merges them into the store in one write. Returns counts per kind. */
	function importInto(json, opts = {}) {
		const f = collect(json);
		const data = structuredClone(Store.get());
		const now = Date.now();
		const live = (type) => Object.values(data.items).filter((i) => i.type === type && !i.deleted);
		let order = (type) => Math.max(0, ...live(type).map((i) => (i.order ?? 0) + 1));
		const put = (type, fields) => {
			const id = Store.uid();
			data.items[id] = { id, type, createdAt: now, updatedAt: now, order: order(type), ...fields };
			return data.items[id];
		};
		const n = { todos: 0, boards: 0, labels: 0, notes: 0, bookmarks: 0, birthdays: 0 };
		const norm = (s) => String(s || "").trim().toLowerCase();

		// boards
		const boardIds = new Map(live("board").map((b) => [norm(b.name), b.id]));
		const boardOf = (key) => {
			if (!key) return "";
			const k = norm(key);
			if (/^(default|پیش‌?فرض|ungrouped)$/.test(k)) return "";
			if (!boardIds.has(k)) {
				const src = f.boards.find((b) => norm(b.key) === k) || { name: key, color: "" };
				const keys = Object.keys(COLOR_HEX);
				boardIds.set(k, put("board", { name: src.name, color: src.color || keys[(boardIds.size + 1) % keys.length] }).id);
				n.boards++;
			}
			return boardIds.get(k);
		};
		f.boards.forEach((b) => boardOf(b.key));

		// labels
		const labelIds = new Map(live("label").map((l) => [norm(l.name), l.id]));
		const labelOf = (ref) => {
			const rec = f.labels.get(String(ref));
			if (!rec) return null;
			const k = norm(rec.name);
			if (!labelIds.has(k)) {
				labelIds.set(k, put("label", { name: rec.name, color: rec.color || "blue" }).id);
				n.labels++;
			}
			return labelIds.get(k);
		};

		// tasks
		const haveTodo = new Set(live("todo").map((x) => norm(x.text) + "|" + (x.due || "") + "|" + !!x.done));
		const groupBoards = new Map(); // Dastyar groupId → board name, when tasks point at groups by id
		// The same task can appear in an old and a new Dastyar format; keep the copy that says the most.
		const score = (x) => (x.boardKey || x.groupRef != null ? 8 : 0) + (x.labelRefs.length ? 4 : 0) + (x.desc ? 2 : 0) + (x.time ? 1 : 0);
		const best = new Map();
		f.todos.forEach((x) => {
			const key = norm(x.text) + "|" + x.due + "|" + x.done;
			if (!best.has(key) || score(x) > score(best.get(key))) best.set(key, x);
		});
		f.todos.filter((x) => best.get(norm(x.text) + "|" + x.due + "|" + x.done) === x).sort((a, b) => a.created - b.created).forEach((x) => {
			const key = norm(x.text) + "|" + x.due + "|" + x.done;
			if (haveTodo.has(key)) return;
			haveTodo.add(key);
			const lbls = [...new Set(x.labelRefs.map(labelOf).filter(Boolean))];
			put("todo", {
				text: x.text, desc: x.desc, done: x.done, doneAt: x.done ? now : undefined, priority: x.priority,
				due: x.due, time: x.time, repeat: x.repeat, remind: x.remind, labels: lbls,
				board: boardOf(x.boardKey || groupBoards.get(String(x.groupRef))),
			});
			n.todos++;
		});
		// birthdays become yearly tasks
		f.birthdays.forEach((b) => {
			const text = (I18n.lang === "fa" ? "تولد " : "🎂 ") + b.name;
			const today = new Date();
			let [, mm, dd] = b.due.split("-");
			let due = `${today.getFullYear()}-${mm}-${dd}`;
			if (new Date(due + "T23:59") < today) due = `${today.getFullYear() + 1}-${mm}-${dd}`;
			const key = norm(text) + "|" + due + "|false";
			if (haveTodo.has(key)) return;
			haveTodo.add(key);
			put("todo", { text, desc: "", done: false, priority: 0, due, time: "", repeat: "yearly", remind: false, labels: [], board: "" });
			n.birthdays++;
		});
		// notes
		const haveNote = new Set(live("note").map((x) => norm(x.title) + "|" + norm(x.body)));
		f.notes.forEach((x) => {
			const key = norm(x.title) + "|" + norm(x.body);
			if (haveNote.has(key)) return;
			haveNote.add(key);
			put("note", x);
			n.notes++;
		});
		// shortcuts, the newer way: the same tree as in Dastyar
		const created = [], replaced = [];
		if (f.tree && f.tree.length) {
			const urlKey = (u) => norm(u).replace(/\/$/, "");
			if (opts.replace) {
				// Start from a clean grid: today's shortcuts and folders are removed (they can be brought back with Undo).
				[...live("bookmark"), ...live("folder")].forEach((x) => { replaced.push(structuredClone(x)); data.items[x.id] = { id: x.id, type: x.type, deleted: true, updatedAt: now }; });
			} else {
				// Dastyar's shortcuts go first; what was already on the grid moves after them.
				const shift = f.tree.length;
				[...live("bookmark"), ...live("folder")].filter((x) => !x.folder).forEach((x) => { x.order = (x.order ?? 0) + shift; x.updatedAt = now; });
			}
			const place = (nodes, parent) => nodes.forEach((node, i) => {
				const here = live(node.kind).filter((x) => (x.folder || "") === parent);
				if (node.kind === "folder") {
					let fo = here.find((x) => norm(x.title) === norm(node.name));
					if (!fo) { fo = put("folder", { title: node.name, emoji: node.emoji || "📁", folder: parent, order: i }); created.push(fo.id); n.bookmarks++; }
					else { fo.order = i; fo.updatedAt = now; }
					place(node.children, fo.id);
					return;
				}
				const same = here.find((x) => urlKey(x.url) === urlKey(node.url));
				if (same) { same.order = i; same.updatedAt = now; return; }
				created.push(put("bookmark", { title: node.name, url: node.url, emoji: node.emoji || "", folder: parent, order: i }).id);
				n.bookmarks++;
			});
			place(f.tree, "");
		}
		if (Object.keys(f.favicons).length && chrome.storage) {
			chrome.storage.local.get("kamyar_favicons").then((r) => chrome.storage.local.set({ kamyar_favicons: { ...(r.kamyar_favicons || {}), ...f.favicons } })).catch(() => {});
			window.Brands && Brands.addIcons && Brands.addIcons(f.favicons);
		}
		// bookmarks, the older ways (lists, or folders with items)
		const haveUrl = new Set(live("bookmark").map((x) => norm(x.url).replace(/\/$/, "")));
		const folderIds = new Map(live("folder").map((f) => [norm(f.title), f.id]));
		f.bookmarks.forEach((x) => {
			const key = norm(x.url).replace(/\/$/, "");
			if (haveUrl.has(key)) return;
			haveUrl.add(key);
			let folder = "";
			if (x.folder) {
				const fk = norm(x.folder.name);
				if (!folderIds.has(fk)) folderIds.set(fk, put("folder", { title: x.folder.name, emoji: x.folder.emoji || "📁" }).id);
				folder = folderIds.get(fk);
			}
			put("bookmark", { title: x.title, url: x.url, emoji: x.emoji || "", folder });
			n.bookmarks++;
		});
		// labels that weren't used by any task still come across
		new Set([...f.labels.values()]).forEach((rec) => {
			const k = norm(rec.name);
			if (!labelIds.has(k)) {
				labelIds.set(k, put("label", { name: rec.name, color: rec.color || "blue" }).id);
				n.labels++;
			}
		});
		Object.values(data.items).forEach((i) => i.doneAt === undefined && delete i.doneAt);
		Store.replace(data, "local");
		// Undo puts the shortcuts back the way they were and takes the new ones away.
		if (opts.replace && replaced.length) n.undo = () => {
			const d = structuredClone(Store.get());
			const t = Date.now();
			created.forEach((id) => { const it = d.items[id]; if (it) d.items[id] = { id, type: it.type, deleted: true, updatedAt: t }; });
			replaced.forEach((x) => { d.items[x.id] = { ...x, updatedAt: t }; });
			Store.replace(d, "local");
		};
		n.tree = !!(f.tree && f.tree.length);
		return n;
	}

	/** True when the parsed file looks like a Dastyar export rather than a Rubi backup. */
	const isDastyar = (json) => !!json && typeof json === "object" && (json.source === "dastyar" || !("items" in json));

	window.DastyarImport = { SNIPPET, collect, importInto, isDastyar, readDate, j2g };
})();
