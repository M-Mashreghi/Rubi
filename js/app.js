(function () {
	"use strict";
	const $ = (id) => document.getElementById(id);
	const el = (tag, attrs = {}, ...children) => {
		const n = document.createElement(tag);
		for (const [k, v] of Object.entries(attrs)) {
			if (v == null || v === false) continue;
			if (k === "class") n.className = v;
			else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
			else if (v === true) n.setAttribute(k, "");
			else if (v !== false && v != null) n.setAttribute(k, v);
		}
		for (const c of children) if (c != null) n.append(c);
		return n;
	};
	const nf = (opts) => new Intl.NumberFormat(I18n.locale, opts);
	const num = (n, opts) => nf(opts).format(n);
	const setting = (k, def) => {
		const v = Store.get().settings[k];
		return v === undefined ? def : v;
	};
	const WIDGETS = ["calendar", "weather", "rates", "prayer", "daily", "tools", "habits", "expenses", "sounds", "alerts", "snippets", "pomodoro", "focusStats", "care", "goals", "journal", "worldclock", "football", "trip"];
	const widgetOn = (w) => (setting("widgets", {}) || {})[w] !== false;

	/* ---------- shared helpers for the widget scripts ---------- */
	const changeHandlers = new Set();
	window.H = { $, el, num, setting, widgetOn, onRefresh: (fn) => changeHandlers.add(fn) };

	/* ---------- toast ---------- */
	let toastTimer;
	function toast(msg, action) {
		const tEl = $("toast");
		tEl.replaceChildren(el("span", {}, msg));
		if (action) tEl.append(el("button", { class: "link-btn", type: "button", onclick: () => { action.run(); tEl.hidden = true; } }, action.label || t("undo")));
		tEl.hidden = false;
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => (tEl.hidden = true), action ? 6000 : 3000);
	}
	H.toast = toast;

	/* ---------- popup menus (tile ⋯, engine picker, side panel tools) ---------- */
	let menuEl = null;
	function closeMenu() {
		if (menuEl) menuEl.remove();
		menuEl = null;
	}
	// items: [{label, icon, run, danger, sub: [...items], active}] or "-" for a divider.
	function menu(anchor, items, opts = {}) {
		closeMenu();
		const build = (list) =>
			el("div", { class: "menu", role: "menu" }, ...list.map((it) =>
				it === "-" ? el("hr", {}) :
				el("div", { class: "menu-item-wrap" + (it.sub ? " has-sub" : "") },
					el("button", { type: "button", role: "menuitem", class: "menu-item" + (it.danger ? " danger" : "") + (it.active ? " active" : ""), onclick: it.sub ? (e) => e.currentTarget.parentNode.classList.toggle("open") : () => { closeMenu(); it.run(); } },
						el("span", { class: "mi-icon" }, it.icon || ""), el("span", { class: "mi-label", dir: "auto" }, it.label), it.sub ? el("span", { class: "mi-arrow" }, "‹") : null),
					it.sub ? build(it.sub) : null)));
		menuEl = build(items);
		menuEl.classList.add("menu-root");
		if (opts.className) menuEl.classList.add(opts.className);
		document.body.append(menuEl);
		const r = anchor.getBoundingClientRect(), m = menuEl.getBoundingClientRect();
		let top = r.bottom + 6, left = document.dir === "rtl" ? r.right - m.width : r.left;
		if (top + m.height > innerHeight - 8) top = Math.max(8, r.top - m.height - 6);
		left = Math.min(Math.max(8, left), innerWidth - m.width - 8);
		menuEl.style.top = top + "px";
		menuEl.style.left = left + "px";
		menuEl.querySelector(".menu-item").focus();
	}
	document.addEventListener("pointerdown", (e) => menuEl && !menuEl.contains(e.target) && !e.target.closest("[data-menu-open]") && closeMenu());
	document.addEventListener("keydown", (e) => e.key === "Escape" && menuEl && (closeMenu(), e.stopPropagation()), true);
	window.addEventListener("resize", closeMenu);
	window.addEventListener("blur", closeMenu);
	H.menu = menu;
	H.closeMenu = closeMenu;

	/* ---------- dates (all three calendars) ---------- */
	// Builds "weekday day month year" for any calendar; Chrome's own ordering for fa-persian is odd.
	function fmtDate(d, cal, withWeekday = true) {
		const f = new Intl.DateTimeFormat(`${I18n.locale}-u-ca-${cal}`, { weekday: withWeekday ? "long" : undefined, day: "numeric", month: "long", year: "numeric" });
		if (I18n.lang !== "fa") return f.format(d);
		const p = {};
		for (const x of f.formatToParts(d)) p[x.type] = x.value;
		return [p.weekday, p.day, p.month, p.year, cal === "islamic-umalqura" ? "ق" : ""].filter(Boolean).join(" ");
	}
	H.fmtDate = fmtDate;
	const CALS = ["persian", "gregory", "islamic-umalqura"];
	H.calOrder = () => {
		const main = setting("calendar", I18n.lang === "fa" ? "persian" : "gregory");
		return [main, ...CALS.filter((c) => c !== main)];
	};

	/* ---------- clock & greeting ---------- */
	function tick() {
		const d = new Date();
		$("time").textContent = new Intl.DateTimeFormat(I18n.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
		const [main, second] = H.calOrder();
		$("date").textContent = `${fmtDate(d, main)} · ${fmtDate(d, second, false)}`;
		const dp = {};
		for (const x of new Intl.DateTimeFormat(`${I18n.locale}-u-ca-${main}`, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).formatToParts(d)) dp[x.type] = x.value;
		$("dateShort").textContent = `${dp.weekday} ${dp.day} ${dp.month}`;
		$("dateYear").textContent = dp.year + (main === "islamic-umalqura" && I18n.lang === "fa" ? " ق" : "");
		const h = d.getHours();
		const part = t(h < 5 ? "gNight" : h < 12 ? "gMorning" : h < 17 ? "gDay" : h < 21 ? "gEvening" : "gNight");
		const name = setting("name", "");
		const bd = setting("birthday", "");
		const bdToday = bd && bd.date && window.EvCore && EvCore.matches({ date: bd.date, repeat: "yearly", cal: bd.cal || "gregory" }, new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12));
		$("greeting").textContent = bdToday ? t(name ? "happyBirthdayName" : "happyBirthday", { name }) : name ? t("greetName", { part, name }) : part;
		$("greeting").classList.toggle("bday", !!bdToday);
	}

	/* ---------- search ---------- */
	const ENGINES = {
		google: ["Google", "https://www.google.com/search?q=", "https://www.google.com/search?tbm=isch&q="],
		bing: ["Bing", "https://www.bing.com/search?q=", "https://www.bing.com/images/search?q="],
		duckduckgo: ["DuckDuckGo", "https://duckduckgo.com/?q=", "https://duckduckgo.com/?ia=images&iax=images&q="],
		brave: ["Brave", "https://search.brave.com/search?q=", "https://search.brave.com/images?q="],
		yandex: ["Yandex", "https://yandex.com/search/?text=", "https://yandex.com/images/search?text="]
	};
	const engine = () => ENGINES[setting("engine", "google")] || ENGINES.google;
	H.ENGINES = ENGINES;
	const isUrl = (q) => !/\s/.test(q) && /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/i.test(q);
	// Search history stays on this device only, and only when turned on in Settings.
	const HIST = "hamyar_search_hist";
	const hist = () => {
		try {
			return JSON.parse(localStorage.getItem(HIST) || "[]");
		} catch {
			return [];
		}
	};
	const saveHist = (h) => {
		try {
			localStorage.setItem(HIST, JSON.stringify(h.slice(0, 30)));
		} catch {}
	};
	function go(q) {
		if (!q) return;
		if (setting("searchHistory", false)) saveHist([q, ...hist().filter((x) => x !== q)]);
		location.href = isUrl(q) ? (/^https?:\/\//i.test(q) ? q : "https://" + q) : engine()[1] + encodeURIComponent(q);
	}
	$("searchForm").addEventListener("submit", (e) => {
		e.preventDefault();
		go($("searchInput").value.trim());
	});
	let histSel = -1;
	function renderHist() {
		const q = $("searchInput").value.trim().toLowerCase();
		const list = setting("searchHistory", false) ? hist().filter((x) => !q || x.toLowerCase().includes(q)).slice(0, 8) : [];
		const ul = $("searchHist");
		ul.hidden = !list.length || document.activeElement !== $("searchInput");
		histSel = Math.min(histSel, list.length - 1);
		ul.replaceChildren(...list.map((x, i) => el("li", { role: "option", class: i === histSel ? "sel" : null, "aria-selected": String(i === histSel) },
			el("button", { type: "button", class: "hist-q", dir: "auto", onmousedown: (e) => { e.preventDefault(); go(x); } }, "🕘 ", x),
			el("button", { type: "button", class: "hist-x", title: t("delete"), "aria-label": t("delete"), onmousedown: (e) => { e.preventDefault(); saveHist(hist().filter((y) => y !== x)); renderHist(); } }, "✕")
		)));
		return list;
	}
	$("searchInput").addEventListener("focus", renderHist);
	$("searchInput").addEventListener("input", () => { histSel = -1; renderHist(); });
	$("searchInput").addEventListener("blur", () => setTimeout(() => ($("searchHist").hidden = true), 100));
	$("searchInput").addEventListener("keydown", (e) => {
		const list = renderHist();
		if (!list.length) return;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			e.preventDefault();
			if (e.key === "ArrowDown") histSel = histSel + 1 >= list.length ? -1 : histSel + 1;
			else histSel = histSel - 1 < -1 ? list.length - 1 : histSel - 1;
			$("searchInput").value = histSel >= 0 ? list[histSel] : $("searchInput").value;
			renderHist();
		} else if (e.key === "Escape") $("searchHist").hidden = true;
	});

	// Image search: upload to Google Lens, or search by image link / keyword.
	$("imageBtn").addEventListener("click", () => { $("imageUrl").value = ""; $("imageDialog").showModal(); });
	$("imageClose").addEventListener("click", () => $("imageDialog").close());
	$("lensFile").addEventListener("change", () => {
		if (!$("lensFile").files.length) return;
		$("lensUpload").submit();
		$("imageDialog").close();
		setTimeout(() => ($("lensFile").value = ""), 1000);
	});
	const dz = $("lensUpload");
	dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
	dz.addEventListener("dragleave", () => dz.classList.remove("over"));
	dz.addEventListener("drop", (e) => {
		e.preventDefault();
		dz.classList.remove("over");
		const f = [...(e.dataTransfer.files || [])].find((x) => x.type.startsWith("image/"));
		if (!f) return;
		const dt = new DataTransfer();
		dt.items.add(f);
		$("lensFile").files = dt.files;
		$("lensFile").dispatchEvent(new Event("change"));
	});
	$("imageUrlForm").addEventListener("submit", (e) => {
		e.preventDefault();
		const v = $("imageUrl").value.trim();
		if (!v) return;
		const url = /^https?:\/\//i.test(v) ? "https://lens.google.com/uploadbyurl?url=" + encodeURIComponent(v) : engine()[2] + encodeURIComponent(v);
		$("imageDialog").close();
		location.href = url;
	});

	// Voice search (Chrome's speech recognition). The new-tab page can't show the microphone prompt itself,
	// so the first time we open a small page that asks for it.
	const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
	$("voiceBtn").hidden = !Rec;
	let rec = null;
	const voiceStatus = (msg) => { $("voiceStatus").textContent = msg || ""; $("voiceStatus").hidden = !msg; };
	$("voiceBtn").addEventListener("click", () => {
		if (rec) return rec.stop();
		rec = new Rec();
		rec.lang = I18n.locale === "en-GB" ? "en-US" : I18n.locale;
		rec.interimResults = true;
		rec.onstart = () => { $("voiceBtn").classList.add("on"); voiceStatus(t("listening")); };
		rec.onresult = (e) => {
			const r = [...e.results].map((x) => x[0].transcript).join("");
			$("searchInput").value = r;
			if (e.results[e.results.length - 1].isFinal) go(r.trim());
		};
		rec.onerror = (e) => {
			if (e.error === "not-allowed" || e.error === "service-not-allowed") {
				voiceStatus(t("micNeeded"));
				chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") });
			} else voiceStatus(e.error === "no-speech" ? t("noSpeech") : t("voiceError"));
		};
		rec.onend = () => { $("voiceBtn").classList.remove("on"); rec = null; setTimeout(() => $("voiceStatus").textContent === t("listening") && voiceStatus(""), 50); };
		try {
			rec.start();
		} catch {
			rec = null;
		}
	});

	/* ---------- bookmarks ---------- */
	function favicon(url) {
		const u = new URL(chrome.runtime.getURL("/_favicon/"));
		u.searchParams.set("pageUrl", url);
		u.searchParams.set("size", "64");
		return u.toString();
	}
	function normalizeUrl(raw) {
		let s = raw.trim();
		if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
		const u = new URL(s);
		if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("protocol");
		if (!u.hostname.includes(".") && u.hostname !== "localhost") throw new Error("host");
		return u.toString();
	}
	let editingBm = null;
	let bmKind = "bookmark";
	const folders = () => Store.list("folder");
	// Folders can sit inside folders: a folder's own "folder" field is its parent.
	const alive = (id) => { const f = id && Store.get().items[id]; return !!(f && !f.deleted); };
	const parentOf = (x) => (alive(x.folder) ? x.folder : "");
	function descendants(id) {
		const out = new Set([id]);
		let grew = true;
		while (grew) {
			grew = false;
			for (const f of folders()) if (!out.has(f.id) && out.has(f.folder)) { out.add(f.id); grew = true; }
		}
		return out;
	}
	// Folders as "Parent / Child" labels for pickers, leaving out a folder and everything under it.
	function folderOptions(skip) {
		const bad = skip ? descendants(skip) : new Set();
		const path = (f) => { const p = []; let x = f, n = 0; while (x && n++ < 12) { p.unshift((x.emoji ? x.emoji + " " : "") + x.title); x = alive(x.folder) ? Store.get().items[x.folder] : null; } return p.join(" / "); };
		return folders().filter((f) => !bad.has(f.id)).map((f) => ({ id: f.id, label: path(f), f })).sort((a, b) => a.label.localeCompare(b.label));
	}
	const childrenOf = (id) => [...Store.list("bookmark").filter((x) => x.folder === id), ...folders().filter((x) => x.folder === id)].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
	function renderBmKind() {
		document.querySelectorAll("#bmKind .seg-btn").forEach((b) => b.classList.toggle("active", b.dataset.kind === bmKind));
		document.querySelectorAll("#bmDialog .bm-only").forEach((n) => (n.hidden = bmKind === "folder"));
		$("bmFolderLabel").textContent = t(bmKind === "folder" ? "parentFolder" : "kFolder");
		$("bmUrl").required = bmKind === "bookmark";
		$("bmDialogTitle").textContent = t(editingBm ? (bmKind === "folder" ? "editFolder" : "editShortcut") : bmKind === "folder" ? "newFolder" : "newShortcut");
	}
	function openBmDialog(bm, folderId = "", kind = "bookmark") {
		editingBm = bm || null;
		bmKind = bm ? bm.type : kind;
		$("bmKind").hidden = !!bm;
		$("bmName").value = bm ? bm.title : "";
		$("bmUrl").value = bm && bm.url ? bm.url : "";
		$("bmEmoji").value = bm && bm.emoji ? bm.emoji : "";
		$("bmFolder").replaceChildren(el("option", { value: "" }, t("noFolder")), ...folderOptions(bm && bm.type === "folder" ? bm.id : null).map((o) => el("option", { value: o.id }, o.label)));
		$("bmFolder").value = bm ? parentOf(bm) : folderId;
		$("bmDelete").hidden = !bm;
		$("bmImport").hidden = !!bm;
		$("bmError").hidden = true;
		renderBmKind();
		$("bmDialog").showModal();
		$(bm || bmKind === "folder" ? "bmName" : "bmUrl").focus();
	}
	document.querySelectorAll("#bmKind .seg-btn").forEach((b) => b.addEventListener("click", () => { bmKind = b.dataset.kind; renderBmKind(); }));
	$("bmForm").addEventListener("submit", (e) => {
		if (e.submitter && e.submitter.value !== "save") return;
		const emoji = $("bmEmoji").value.trim();
		if (bmKind === "folder") {
			const title = $("bmName").value.trim();
			if (!title) return e.preventDefault();
			const parent = $("bmFolder").value || "";
			if (editingBm) Store.update(editingBm.id, { title, emoji, folder: descendants(editingBm.id).has(parent) ? "" : parent });
			else Store.add("folder", { title, emoji: emoji || "📁", folder: parent, order: Store.list("bookmark").length + folders().length });
			if (editingBm && openFolderId === editingBm.id) renderFolder();
			return;
		}
		let url;
		try {
			url = normalizeUrl($("bmUrl").value);
		} catch {
			e.preventDefault();
			$("bmError").textContent = t("invalidUrl");
			$("bmError").hidden = false;
			return;
		}
		const title = $("bmName").value.trim() || new URL(url).hostname.replace(/^www\./, "");
		const folder = $("bmFolder").value || "";
		if (editingBm) Store.update(editingBm.id, { title, url, emoji, folder });
		else Store.add("bookmark", { title, url, emoji, folder });
	});
	$("bmUrl").addEventListener("blur", () => {
		if ($("bmName").value.trim()) return;
		try {
			$("bmName").value = new URL(normalizeUrl($("bmUrl").value)).hostname.replace(/^www\./, "").split(".")[0];
		} catch {}
	});
	$("bmDelete").addEventListener("click", () => {
		if (!editingBm) return;
		const snap = { ...editingBm };
		delete snap.id;
		$("bmDialog").close();
		if (snap.type === "folder") {
			// What was inside a deleted folder (shortcuts and folders) moves up one level.
			const up = parentOf(editingBm);
			const inside = childrenOf(editingBm.id);
			inside.forEach((x) => Store.update(x.id, { folder: up }));
			Store.remove(editingBm.id);
			if (openFolderId === editingBm.id) {
				if (up) { openFolderId = up; renderFolder(); }
				else if ($("folderDialog").open) $("folderDialog").close();
			}
			toast(t("folderDeleted"), { run: () => { const f = Store.add("folder", snap); inside.forEach((x) => Store.update(x.id, { folder: f.id })); } });
		} else {
			Store.remove(editingBm.id);
			toast(t("shortcutDeleted"), { run: () => Store.add("bookmark", snap) });
		}
	});

	// A folder's face: a tidy 2×2 grid of what is inside (always four cells, so it looks balanced),
	// with "+N" in the last cell when there is more. An empty folder shows its own emoji.
	function folderPreview(item, inside, cls = "") {
		if (!inside.length) return el("span", { class: "bm-icon folder-icon empty " + cls }, el("span", { class: "fold-emoji" }, item.emoji || "📁"));
		const more = inside.length > 4 ? inside.length - 3 : 0;
		const cells = inside.slice(0, more ? 3 : 4).map((b) => el("span", { class: "fcell" }, b.type === "folder" || b.emoji ? el("span", { class: "mini-emoji" }, b.emoji || "📁") : Brands.img(b.url, b.title, 16)));
		if (more) cells.push(el("span", { class: "fcell more" }, "+" + more));
		while (cells.length < 4) cells.push(el("span", { class: "fcell blank" }));
		return el("span", { class: "bm-icon folder-icon " + cls }, ...cells);
	}
	// Main grid holds shortcuts outside folders plus the folders; both share one order.
	let dragId = null;
	function tile(item, siblings) {
		const isFolder = item.type === "folder";
		const inside = isFolder ? childrenOf(item.id) : [];
		const icon = isFolder
			? folderPreview(item, inside)
			: el("span", { class: "bm-icon" }, item.emoji ? el("span", { class: "bm-emoji" }, item.emoji) : Brands.img(item.url, item.title, 28));
		const main = isFolder
			? el("button", { type: "button", class: "bm-open", onclick: () => openFolder(item.id) }, icon, el("span", { class: "bm-name", dir: "auto" }, item.title))
			: el("a", { href: item.url, title: item.url, onclick: () => bmClick(item), onauxclick: (e) => e.button === 1 && bmClick(item) }, icon, el("span", { class: "bm-name", dir: "auto" }, item.title));
		return el(
			"li",
			{
				class: "bm",
				"data-id": item.id,
				draggable: "true",
				ondragstart: () => (dragId = item.id),
				oncontextmenu: (e) => { e.preventDefault(); tileMenu(e.currentTarget.querySelector(".bm-edit"), item); },
				ondragover: (e) => e.preventDefault(),
				ondrop: (e) => {
					e.preventDefault();
					if (!dragId || dragId === item.id) return;
					const dragged = Store.get().items[dragId];
					// Dropping a shortcut or another folder on a folder moves it into the folder.
					if (isFolder && dragged && dragged.type === "bookmark") return Store.update(dragId, { folder: item.id });
					if (isFolder && dragged && dragged.type === "folder" && !descendants(dragId).has(item.id)) return Store.update(dragId, { folder: item.id });
					const all = siblings();
					const from = all.findIndex((x) => x.id === dragId);
					if (from < 0) return;
					const [moved] = all.splice(from, 1);
					all.splice(all.findIndex((x) => x.id === item.id), 0, moved);
					all.forEach((x, i) => x.order !== i && Store.update(x.id, { order: i }));
				}
			},
			main,
			el("button", { class: "bm-edit", type: "button", "data-menu-open": true, "aria-haspopup": "menu", "aria-label": t("moreOptions") + " " + item.title, title: t("moreOptions"), onclick: (e) => { e.preventDefault(); tileMenu(e.currentTarget, item); } }, "⋯")
		);
	}
	function tileMenu(anchor, item) {
		if (item.type === "folder") {
			const fMove = [{ icon: "", label: t("noFolder"), active: !parentOf(item), run: () => Store.update(item.id, { folder: "" }) }, ...folderOptions(item.id).map((o) => ({ icon: "", label: o.label, active: item.folder === o.id, run: () => Store.update(item.id, { folder: o.id }) }))];
			return menu(anchor, [
				{ icon: "📂", label: t("open"), run: () => openFolder(item.id) },
				{ icon: "↗", label: t("openAllTabs"), run: () => Store.list("bookmark").filter((x) => x.folder === item.id).forEach((b) => chrome.tabs.create({ url: b.url, active: false })) },
				{ icon: "✎", label: t("edit"), run: () => openBmDialog(item) },
				{ icon: "📁", label: t("moveTo"), sub: fMove },
				"-",
				{ icon: "🗑", label: t("delete"), danger: true, run: () => { openBmDialog(item); $("bmDelete").click(); } }
			]);
		}
		const moveTo = [{ icon: "", label: t("noFolder"), active: !item.folder, run: () => Store.update(item.id, { folder: "" }) }, ...folderOptions(null).map((o) => ({ icon: "", label: o.label, active: item.folder === o.id, run: () => Store.update(item.id, { folder: o.id }) }))];
		menu(anchor, [
			{ icon: "↗", label: t("open"), run: () => (location.href = item.url) },
			{ icon: "⧉", label: t("openNewTab"), run: () => chrome.tabs.create({ url: item.url, active: false }) },
			{ icon: "✎", label: t("edit"), run: () => openBmDialog(item) },
			{ icon: "📁", label: t("moveTo"), sub: moveTo },
			{ icon: "🔗", label: t("copyLink"), run: async () => { try { await navigator.clipboard.writeText(item.url); toast(t("copied")); } catch {} } },
			"-",
			{ icon: "🗑", label: t("delete"), danger: true, run: () => { const snap = { ...item }; delete snap.id; Store.remove(item.id); toast(t("shortcutDeleted"), { run: () => Store.add("bookmark", snap) }); } }
		]);
	}
	/* Smart shortcuts: count clicks per part of the day (kept on this device) and, when turned on,
	 * show the shortcuts used most at this time of day first. Folders count their shortcuts' clicks. */
	const BM_CLICKS = "kamyar_bm_clicks";
	const bucket = (h = new Date().getHours()) => (h >= 5 && h < 12 ? "m" : h >= 12 && h < 17 ? "a" : h >= 17 && h < 23 ? "e" : "n");
	const readClicks = () => { try { return JSON.parse(localStorage.getItem(BM_CLICKS) || "{}"); } catch { return {}; } };
	function bmClick(item) {
		const c = readClicks();
		const b = bucket();
		const r = (c[item.id] ||= {});
		r[b] = (r[b] || 0) + 1;
		r.last = Date.now();
		if (item.folder) { const f = (c[item.folder] ||= {}); f[b] = (f[b] || 0) + 1; }
		try { localStorage.setItem(BM_CLICKS, JSON.stringify(c)); } catch {}
	}
	function smartSort(list) {
		const c = readClicks(), b = bucket();
		// This part of the day counts most; the rest of the day a little, so new habits still show.
		const score = (x) => { const r = c[x.id] || {}; return (r[b] || 0) * 3 + ["m", "a", "e", "n"].reduce((s, k) => s + (r[k] || 0), 0) * 0.5; };
		return list.map((x, i) => [x, score(x), i]).sort((p, q) => q[1] - p[1] || p[2] - q[2]).map((p) => p[0]);
	}
	H.bmBucket = bucket;
	const topItems = () => [...Store.list("bookmark"), ...folders()].filter((x) => !parentOf(x)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
	function renderBookmarks() {
		const list = setting("smartBm", false) ? smartSort(topItems()) : topItems();
		const items = list.map((x) => tile(x, topItems));
		items.push(el("li", { class: "bm" }, el("button", { class: "bm-add", type: "button", onclick: () => openBmDialog() }, el("span", { class: "bm-icon" }, "+"), el("span", { class: "bm-name" }, t("add")))));
		$("bookmarkList").replaceChildren(...items);
		if (openFolderId) renderFolder();
	}
	let openFolderId = null;
	function openFolder(id) {
		openFolderId = id;
		renderFolder();
		const dlg = $("folderDialog");
		if (dlg.open) return;
		// The folder grows out of its own tile, so it is clear which folder opened.
		const tileEl = document.querySelector(`[data-id="${CSS.escape(id)}"]`);
		dlg.showModal();
		if (tileEl && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
			const a = tileEl.getBoundingClientRect(), b = dlg.getBoundingClientRect();
			const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
			dlg.animate([{ transform: `translate(${dx}px, ${dy}px) scale(.15)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
		}
	}
	function renderFolder() {
		const f = Store.get().items[openFolderId];
		if (!f || f.deleted) return $("folderDialog").open && $("folderDialog").close();
		// Breadcrumb: Main / Parent / This folder; each part opens that level.
		const trail = [];
		for (let x = f, n = 0; x && n < 12; n++, x = alive(x.folder) ? Store.get().items[x.folder] : null) trail.unshift(x);
		$("folderTitle").replaceChildren(...trail.flatMap((x, i) => [
			i ? el("span", { class: "crumb-sep" }, " / ") : "",
			i < trail.length - 1 ? el("button", { type: "button", class: "crumb", onclick: () => openFolder(x.id) }, (x.emoji ? x.emoji + " " : "") + x.title) : el("span", {}, x.title)
		]));
		$("folderBack").hidden = !parentOf(f);
		const id = openFolderId;
		const inside = () => childrenOf(id);
		$("folderFace").replaceChildren(folderPreview(f, inside(), "big"));
		const nIn = inside().length;
		$("folderCount").textContent = nIn ? t("folderCount", { n: H.num ? H.num(nIn) : nIn }) : t("folderEmpty");
		const items = inside().map((x) => tile(x, inside));
		items.push(el("li", { class: "bm" }, el("button", { class: "bm-add", type: "button", onclick: () => openBmDialog(null, id) }, el("span", { class: "bm-icon" }, "+"), el("span", { class: "bm-name" }, t("add")))));
		$("folderList").replaceChildren(...items);
	}
	H.openBmDialog = openBmDialog;
	H.openNote = (id) => openNote(id);
	$("folderClose").addEventListener("click", () => $("folderDialog").close());
	$("folderBack").addEventListener("click", () => { const f = Store.get().items[openFolderId]; if (f && parentOf(f)) openFolder(f.folder); });
	$("folderDialog").addEventListener("close", () => (openFolderId = null));
	$("folderEdit").addEventListener("click", () => openBmDialog(Store.get().items[openFolderId]));

	/* Import from the browser: most-visited sites and bookmarks (asks for permission first). */
	let ibItems = [];
	const ibPicked = new Set();
	function renderIb() {
		const q = $("ibFilter").value.trim().toLowerCase();
		const have = new Set(Store.list("bookmark").map((b) => b.url.replace(/\/$/, "")));
		const rows = [];
		let group = null;
		for (const it of ibItems) {
			if (q && !(it.title + " " + it.url).toLowerCase().includes(q)) continue;
			if (it.group !== group) {
				group = it.group;
				rows.push(el("div", { class: "ib-group" }, it.group));
			}
			const exists = have.has(it.url.replace(/\/$/, ""));
			rows.push(el("label", { class: "ib-row" + (exists ? " exists" : "") },
				el("input", { type: "checkbox", disabled: exists, checked: ibPicked.has(it.url), onchange: (e) => { e.target.checked ? ibPicked.add(it.url) : ibPicked.delete(it.url); $("ibCount").textContent = ibPicked.size ? t("nSelected", { n: num(ibPicked.size) }) : ""; } }),
				el("img", { src: favicon(it.url), alt: "", width: "16", height: "16", loading: "lazy" }),
				el("span", { class: "ib-t", dir: "auto" }, it.title || it.url),
				el("span", { class: "ib-u", dir: "ltr" }, it.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 48))
			));
			if (rows.length > 600) break;
		}
		$("ibList").replaceChildren(...(rows.length ? rows : [el("p", { class: "muted small" }, t("nothingFound"))]));
	}
	$("bmImport").addEventListener("click", async () => {
		let ok = false;
		try {
			ok = await chrome.permissions.request({ permissions: ["bookmarks", "topSites"] });
		} catch {}
		if (!ok) return toast(t("needPermission"));
		$("bmDialog").close();
		ibItems = [];
		ibPicked.clear();
		try {
			for (const s of await chrome.topSites.get()) ibItems.push({ group: t("mostVisited"), title: s.title, url: s.url });
		} catch {}
		try {
			const walk = (nodes, path) => {
				for (const n of nodes) {
					if (n.url && /^https?:/.test(n.url)) ibItems.push({ group: path || t("browserBookmarks"), title: n.title, url: n.url });
					if (n.children) walk(n.children, n.title && n.parentId && n.parentId !== "0" ? (path ? path + " / " : "") + n.title : path);
				}
			};
			walk(await chrome.bookmarks.getTree(), "");
		} catch {}
		$("ibFilter").value = "";
		$("ibCount").textContent = "";
		renderIb();
		$("importBmDialog").showModal();
	});
	$("ibFilter").addEventListener("input", renderIb);
	$("importBmDialog").addEventListener("close", () => {
		if ($("importBmDialog").returnValue !== "add") return;
		const picked = ibItems.filter((it, i, a) => ibPicked.has(it.url) && a.findIndex((x) => x.url === it.url) === i);
		const folderIds = {};
		picked.forEach((it) => {
			let folder = "";
			if (it.group !== t("mostVisited") && it.group !== t("browserBookmarks")) {
				const name = it.group.split(" / ").pop();
				folder = folderIds[name] ||= (folders().find((f) => f.title === name) || Store.add("folder", { title: name, emoji: "📁" })).id;
			}
			Store.add("bookmark", { title: (it.title || new URL(it.url).hostname).slice(0, 60), url: it.url, folder });
		});
		if (picked.length) toast(t("addedN", { n: num(picked.length) }));
	});

	/* ---------- notes ---------- */
	let openNoteId = null;
	let noteSaveTimer = null;
	function openNote(id) {
		const n = Store.get().items[id];
		if (!n) return;
		openNoteId = id;
		$("noteTitleInput").value = n.title || "";
		$("noteBodyInput").value = n.body || "";
		$("noteSaved").textContent = "";
		$("noteDialog").showModal();
		$(n.body ? "noteBodyInput" : "noteTitleInput").focus();
	}
	function saveNoteSoon() {
		clearTimeout(noteSaveTimer);
		$("noteSaved").textContent = "…";
		noteSaveTimer = setTimeout(saveNoteNow, 400);
	}
	function saveNoteNow() {
		clearTimeout(noteSaveTimer);
		if (!openNoteId) return;
		const n = Store.get().items[openNoteId];
		const title = $("noteTitleInput").value, body = $("noteBodyInput").value;
		if (n && (n.title !== title || n.body !== body)) Store.update(openNoteId, { title, body });
		$("noteSaved").textContent = t("saved");
	}
	$("noteTitleInput").addEventListener("input", saveNoteSoon);
	$("noteBodyInput").addEventListener("input", saveNoteSoon);
	$("noteDialog").addEventListener("close", () => {
		saveNoteNow();
		const n = openNoteId && Store.get().items[openNoteId];
		if (n && !n.deleted && !(n.title || "").trim() && !(n.body || "").trim()) Store.remove(n.id);
		openNoteId = null;
	});
	$("newNote").addEventListener("click", () => openNote(Store.add("note", { title: "", body: "" }).id));
	$("deleteNote").addEventListener("click", () => {
		const n = Store.get().items[openNoteId];
		if (!n) return;
		const snap = { ...n, title: $("noteTitleInput").value, body: $("noteBodyInput").value };
		openNoteId = null;
		Store.remove(n.id);
		$("noteDialog").close();
		toast(t("noteDeleted"), { run: () => Store.add("note", { title: snap.title, body: snap.body, pinned: snap.pinned }) });
	});
	$("noteSearch").addEventListener("input", () => renderNotes());
	function renderNotes() {
		const q = $("noteSearch").value.trim().toLowerCase();
		const when = new Intl.DateTimeFormat(`${I18n.locale}-u-ca-${H.calOrder()[0]}`, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
		const notes = Store.list("note")
			.filter((n) => (n.title || "").trim() || (n.body || "").trim())
			.filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q))
			.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
		const rows = notes.map((n) => {
			const title = (n.title || "").trim();
			const body = (n.body || "").trim();
			return el(
				"li",
				{ class: "note" + (n.pinned ? " pinned" : "") },
				el(
					"button",
					{ class: "note-open", type: "button", onclick: () => openNote(n.id) },
					el("strong", { dir: "auto" }, title || body.split("\n")[0].slice(0, 60)),
					el("span", { class: "note-snippet", dir: "auto" }, (title ? body : body.split("\n").slice(1).join(" ")).slice(0, 120)),
					el("span", { class: "muted small" }, when.format(new Date(n.updatedAt)))
				),
				el("button", { class: "icon-btn small pin", type: "button", "aria-pressed": String(!!n.pinned), title: t(n.pinned ? "unpin" : "pin"), "aria-label": t("pin"), onclick: () => Store.update(n.id, { pinned: !n.pinned }) }, "📌")
			);
		});
		if (!rows.length) rows.push(el("li", { class: "empty" }, t(q ? "notesNoMatch" : "notesEmpty")));
		$("noteList").replaceChildren(...rows);
	}

	/* ---------- settings ---------- */
	function applyTheme() {
		try {
			localStorage.setItem("hamyar_font", setting("font", "vazir"));
		} catch {}
		Themes.apply(setting("theme", "dark"), setting("accent", ""));
	}
	// "Day & night" switches by the clock, so check it every minute.
	setInterval(() => setting("theme", "dark") === "daynight" && applyTheme(), 60000);
	Themes.rotate().catch(() => {});
	function renderThemeGrid() {
		const cur = setting("theme", "dark");
		$("themeGrid").replaceChildren(
			...Themes.list.map((th) => {
				const prev = th.id === "auto" || th.id === "daynight"
					? el("span", { class: "tp tp-auto" + (th.id === "daynight" ? " tp-dn" : "") }, th.id === "daynight" ? el("em", {}, "☀️", el("span", {}, "🌙")) : "")
					: el("span", { class: "tp", style: `background:${th.bg}` }, el("i", { style: `background:${th.surface};border-color:${th.border}` }), el("b", { style: `background:${th.accent}` }));
				return el("button", { type: "button", class: "theme-card", role: "radio", "aria-checked": String(th.id === cur), title: th.names[I18n.lang] || th.names.en, onclick: () => { Store.setSetting("theme", th.id); renderThemeGrid(); } }, prev, el("span", { class: "tn" }, th.names[I18n.lang] || th.names.en));
			})
		);
		const acc = setting("accent", "");
		$("accentInput").value = acc || (Themes.byId[cur] || Themes.byId.auto).accent;
		$("accentReset").hidden = !acc;
		$("wallRemove").hidden = !Themes.hasWall();
		$("wallDimRow").hidden = !(Themes.hasWall() || Themes.hasVideo());
		$("wallDim").value = Themes.dim();
		$("boxAlphaNoWall").hidden = Themes.hasWall() || Themes.hasVideo();
		drawBoxAlpha();
		renderWalls();
	}
	$("accentInput").addEventListener("change", (e) => { Store.setSetting("accent", e.target.value); renderThemeGrid(); });
	$("accentReset").addEventListener("click", () => { Store.setSetting("accent", ""); renderThemeGrid(); });
	async function renderWalls() {
		let list = await Themes.walls().catch(() => []);
		// A wallpaper chosen before collections existed joins the collection.
		if (!list.length && Themes.hasWall() && !/^[bc]-/.test(String(Themes.activeWall() || ""))) {
			try {
				const id = await Themes.addWall(localStorage.getItem("hamyar_wall"));
				localStorage.setItem("hamyar_wall_id", id);
				list = await Themes.walls();
			} catch {}
		}
		const active = Themes.hasWall() ? Themes.activeWall() : null;
		$("colorWalls").replaceChildren(...Themes.colors().map((w) => el("div", { class: "wall-th color" + (w.id === active ? " on" : "") },
			el("button", { type: "button", class: "wall-pick", "aria-pressed": String(w.id === active), title: t("useWallpaper"), onclick: async () => { await Themes.useWall(w.id); Store.setSetting("wallBuiltin", w.id); renderThemeGrid(); } }, el("img", { src: w.thumb, alt: "" })))));
		$("builtinWalls").replaceChildren(...Themes.BUILTIN.map((w) => el("div", { class: "wall-th" + (w.id === active ? " on" : "") },
			el("button", { type: "button", class: "wall-pick", "aria-pressed": String(w.id === active), title: t("useWallpaper"), onclick: async () => { await Themes.useWall(w.id); Store.setSetting("wallBuiltin", w.id); renderThemeGrid(); } }, el("img", { src: w.thumb, alt: "", loading: "lazy" })))));
		$("wallGrid").replaceChildren(
			...list.map((w) => el("div", { class: "wall-th" + (w.id === active ? " on" : "") },
				el("button", { type: "button", class: "wall-pick", "aria-pressed": String(w.id === active), title: t("useWallpaper"), onclick: async () => { await Themes.useWall(w.id); renderThemeGrid(); } }, el("img", { src: w.data, alt: "" })),
				el("button", { type: "button", class: "wall-x", title: t("delete"), "aria-label": t("delete"), onclick: async () => {
					await Themes.removeWall(w.id);
					if (w.id === active) {
						const rest = await Themes.walls();
						if (rest.length) await Themes.useWall(rest[0].id);
						else Themes.setWallpaper(null);
					}
					renderThemeGrid();
				} }, "✕")
			)),
			el("button", { type: "button", class: "wall-add", title: t("addPictures"), onclick: () => $("wallInput").click() }, "+", el("small", {}, t("addPictures")))
		);
		$("wallRotate").value = Themes.rotation();
	}
	$("wallInput").addEventListener("change", async (e) => {
		const files = [...e.target.files];
		e.target.value = "";
		let first = null, bad = 0;
		for (const f of files) {
			try {
				const id = await Themes.addWall(await Themes.readWallpaper(f));
				first ||= id;
			} catch {
				bad++;
			}
		}
		if (first && !(await Themes.useWall(first))) toast(t("wallTooBig"));
		if (bad) toast(t("wallBad"));
		renderThemeGrid();
	});
	$("wallRotate").addEventListener("change", (e) => Themes.rotation(e.target.value));
	$("fontSelect").addEventListener("change", (e) => Store.setSetting("font", e.target.value));
	$("weekStartSelect").addEventListener("change", (e) => Store.setSetting("weekStart", e.target.value));
	$("searchHistChk").addEventListener("change", (e) => { Store.setSetting("searchHistory", e.target.checked); if (!e.target.checked) saveHist([]); });
	$("clearHist").addEventListener("click", () => { saveHist([]); toast(t("historyCleared")); });
	$("wallDim").addEventListener("input", (e) => Themes.setDim(Number(e.target.value)));
	function drawBoxAlpha() {
		const [a, h] = Themes.boxAlpha();
		$("boxAlpha").value = a;
		$("boxAlphaH").value = h;
		$("boxAlphaOut").textContent = num(a) + (I18n.lang === "fa" ? "٪" : "%");
		$("boxAlphaHOut").textContent = num(h) + (I18n.lang === "fa" ? "٪" : "%");
	}
	$("boxAlpha").addEventListener("input", (e) => { Themes.setBoxAlpha(Number(e.target.value), null); drawBoxAlpha(); });
	$("boxAlphaH").addEventListener("input", (e) => { Themes.setBoxAlpha(null, Number(e.target.value)); drawBoxAlpha(); });
	$("boxAlphaReset").addEventListener("click", () => { Themes.setBoxAlpha(60, 85); drawBoxAlpha(); });
	// The box opacity and a ready-made wallpaper choice also travel with the data (Drive / Chrome Sync).
	const saveAlpha = () => Store.setSetting("boxAlpha", Themes.boxAlpha());
	$("boxAlpha").addEventListener("change", saveAlpha);
	$("boxAlphaH").addEventListener("change", saveAlpha);
	$("boxAlphaReset").addEventListener("click", saveAlpha);
	H.onRefresh(() => {
		const ba = setting("boxAlpha", null);
		if (Array.isArray(ba) && String(ba) !== String(Themes.boxAlpha())) Themes.setBoxAlpha(ba[0], ba[1]);
		const wb = setting("wallBuiltin", "");
		const localAt = Number(localStorage.getItem("hamyar_wall_at") || 0);
		if (wb && wb !== Themes.activeWall() && Store.settingTime("wallBuiltin") > localAt) Themes.useWall(wb).catch(() => {});
	});
	$("langSelect").replaceChildren(...I18n.langs.map((l) => el("option", { value: l }, I18n.names[l])));
	const widgetLabel = { calendar: "wCalendar", weather: "wWeather", rates: "wRates", prayer: "wPrayer", pomodoro: "wPomodoro", tools: "wTools", daily: "wDaily", habits: "wHabits", expenses: "wExpenses", sounds: "wSounds", alerts: "wAlerts", snippets: "wSnippets", focusStats: "wFocusStats", care: "wCare", goals: "wGoals", journal: "wJournal", worldclock: "wWorldClock", football: "wFootball", trip: "wTrip" };
	H.WIDGETS = WIDGETS;
	H.widgetLabel = widgetLabel;
	function renderWidgetToggles() {
		$("widgetToggles").replaceChildren(
			...WIDGETS.map((w) =>
				el("label", { class: "check" }, el("input", { type: "checkbox", checked: widgetOn(w), onchange: (e) => Store.setSetting("widgets", { ...(setting("widgets", {}) || {}), [w]: e.target.checked }) }), " ", el("span", {}, t(widgetLabel[w])))
			)
		);
	}
	$("settingsBtn").addEventListener("click", async () => {
		$("nameInput").value = setting("name", "");
		renderThemeGrid();
		$("fontSelect").value = setting("font", "vazir");
		$("weekStartSelect").value = setting("weekStart", "");
		$("searchHistChk").checked = setting("searchHistory", false);
		$("langSelect").value = I18n.lang;
		$("calSelect").value = H.calOrder()[0];
		$("engineSelect").value = setting("engine", "google");
		$("baseSelect").value = setting("base", "USD");
		$("iranHol").checked = setting("iranHolidays", true);
		$("worldDays").checked = setting("worldDays", true);
		$("navasanInput").value = setting("navasanKey", "");
		$("stocksInput").value = setting("stocks", Rates.DEF_STOCKS) ?? Rates.DEF_STOCKS;
		$("settingsMsg").textContent = "";
		renderWidgetToggles();
		renderChromeSyncInfo();
		await renderDriveInfo();
		if (window.GCal) await GCal.renderSettings();
		$("settingsDialog").showModal();
	});
	$("nameInput").addEventListener("change", (e) => Store.setSetting("name", e.target.value.trim()));
	$("langSelect").addEventListener("change", (e) => Store.setSetting("lang", e.target.value));
	$("calSelect").addEventListener("change", (e) => Store.setSetting("calendar", e.target.value));
	$("engineSelect").addEventListener("change", (e) => Store.setSetting("engine", e.target.value));
	$("baseSelect").addEventListener("change", (e) => Store.setSetting("base", e.target.value));
	$("iranHol").addEventListener("change", (e) => Store.setSetting("iranHolidays", e.target.checked));
	$("worldDays").addEventListener("change", (e) => Store.setSetting("worldDays", e.target.checked));
	$("navasanInput").addEventListener("change", (e) => Store.setSetting("navasanKey", e.target.value.trim()));
	$("stocksInput").addEventListener("change", (e) => Store.setSetting("stocks", e.target.value.trim()));
	$("exportBtn").addEventListener("click", () => {
		const blob = new Blob([JSON.stringify(Store.get(), null, 2)], { type: "application/json" });
		const a = el("a", { href: URL.createObjectURL(blob), download: `kamyar-backup-${new Date().toISOString().slice(0, 10)}.json` });
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 1000);
	});
	$("importInput").addEventListener("change", async (e) => {
		const f = e.target.files[0];
		e.target.value = "";
		if (!f) return;
		try {
			const json = JSON.parse(await f.text());
			if (window.DastyarImport && DastyarImport.isDastyar(json)) {
				const res = DastyarImport.importInto(json, { replace: true });
				$("settingsMsg").textContent = dastyarSummary(res);
				if (res.undo) H.toast(t("dastyarReplaced"), { label: t("undo"), run: res.undo });
				return;
			}
			const incoming = Store.normalize(json);
			const n = Object.values(incoming.items).filter((i) => !i.deleted).length;
			Store.replace(Store.merge(Store.get(), incoming), "local");
			$("settingsMsg").textContent = t("importedN", { n: num(n) });
		} catch {
			$("settingsMsg").textContent = t("importBad");
		}
	});

	/* ---------- moving from Dastyar ---------- */
	function dastyarSummary(n) {
		const parts = [["todos", "kTasks"], ["boards", "kBoards"], ["labels", "kLabels"], ["notes", "kNotes"], ["bookmarks", "kShortcuts"], ["birthdays", "kBirthdays"]]
			.filter(([k]) => n[k])
			.map(([k, key]) => t(key, { n: num(n[k]) }));
		return parts.length ? t("dastyarDone", { list: parts.join(I18n.lang === "fa" ? "، " : ", ") }) : t("dastyarNothing");
	}
	$("dastyarBtn").addEventListener("click", () => {
		$("dastyarCode").value = DastyarImport.SNIPPET;
		$("dastyarMsg").textContent = "";
		$("dastyarMsg").className = "dastyar-msg";
		$("dastyarDialog").showModal();
	});
	$("dastyarCopy").addEventListener("click", async () => {
		try {
			await navigator.clipboard.writeText(DastyarImport.SNIPPET);
		} catch {
			$("dastyarCode").select();
			document.execCommand("copy");
		}
		$("dastyarCopy").textContent = t("copied");
		setTimeout(() => ($("dastyarCopy").textContent = t("copyCode")), 2000);
	});
	$("dastyarFile").addEventListener("change", async (e) => {
		const f = e.target.files[0];
		e.target.value = "";
		if (!f) return;
		const msg = $("dastyarMsg");
		try {
			const res = DastyarImport.importInto(JSON.parse(await f.text()), { replace: $("dastyarReplace").checked });
			msg.textContent = dastyarSummary(res);
			msg.className = "dastyar-msg ok";
			if (res.undo) H.toast(t("dastyarReplaced"), { label: t("undo"), run: res.undo });
		} catch {
			msg.textContent = t("importBad");
			msg.className = "dastyar-msg bad";
		}
	});

	/* ---------- keyboard shortcuts ---------- */
	const KEYS = [
		["/", "kbSearch", () => $("searchInput").focus()],
		["t", "kbTask", () => Todos.openEditor(null)],
		["k", "kbTasksPage", () => $("openTasksPage").click()],
		["n", "kbNote", () => $("newNote").click()],
		["e", "kbEvent", () => Events.openEditor(null)],
		["b", "kbShortcut", () => openBmDialog()],
		["v", "kbVoice", () => !$("voiceBtn").hidden && $("voiceBtn").click()],
		["i", "kbImage", () => $("imageBtn").click()],
		["l", "kbTranslate", () => H.openTranslator && H.openTranslator()],
		[",", "kbSettings", () => $("settingsBtn").click()],
		["?", "kbHelp", () => showKeys()],
	];
	function showKeys() {
		$("keysList").replaceChildren(...KEYS.flatMap(([k, label]) => [el("dt", {}, el("kbd", {}, k)), el("dd", {}, t(label))]));
		if ($("settingsDialog").open) $("settingsDialog").close();
		$("keysDialog").showModal();
	}
	$("showKeys").addEventListener("click", showKeys);
	document.addEventListener("keydown", (e) => {
		if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
		const tg = e.target;
		if (tg && (tg.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName))) return;
		if (document.querySelector("dialog[open]")) return;
		const hit = KEYS.find(([k]) => k === e.key.toLowerCase() || k === e.key);
		if (!hit) return;
		e.preventDefault();
		hit[2]();
	});

	/* ---------- Drive sync ---------- */
	const sync = { state: "local", email: "", busy: false, pending: false, last: 0 };
	const oauthReady = () => {
		const id = ((chrome.runtime.getManifest().oauth2 || {}).client_id || "");
		return !!id && !id.startsWith("PASTE_");
	};
	function renderSyncChip() {
		const chip = $("syncChip");
		if (sync.state === "local") {
			// No Drive: show Chrome Sync, which needs no setup.
			const cs = ChromeSync.status;
			const state = cs.state === "full" ? "error" : cs.state === "error" ? "error" : cs.email ? "ok" : "local";
			chip.dataset.state = state;
			$("syncText").textContent = t(cs.state === "full" ? "syncFull" : cs.state === "error" ? "syncError" : cs.email ? "syncChrome" : "syncChromeNoAccount");
			chip.title = cs.email ? t("account", { email: cs.email }) : "";
			return;
		}
		chip.dataset.state = sync.state;
		const key = { syncing: "syncing", ok: "syncOk", offline: "syncOffline", error: "syncError", auth: "syncAuth" }[sync.state];
		let txt = t(key);
		if (sync.state === "ok" && sync.last) txt += " · " + new Intl.DateTimeFormat(I18n.locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(sync.last));
		$("syncText").textContent = txt;
		chip.title = sync.email ? t("account", { email: sync.email }) : "";
	}
	function renderChromeSyncInfo() {
		const cs = ChromeSync.status;
		$("chromeSyncInfo").textContent = cs.email ? t("chromeSyncInfo", { email: cs.email }) : t("chromeSyncNoAccount");
		$("chromeSyncUsage").textContent = cs.bytes ? t("chromeSyncUsage", { used: num(Math.max(1, Math.round(cs.bytes / 1024))) + (I18n.lang === "fa" ? " کیلوبایت" : " KB") }) : "";
		document.querySelectorAll("[data-needs-oauth]").forEach((n) => (n.hidden = !oauthReady()));
	}
	ChromeSync.onStatus(() => {
		renderSyncChip();
		if ($("settingsDialog").open) renderChromeSyncInfo();
	});
	async function renderDriveInfo() {
		const on = await Drive.isEnabled();
		$("driveBtn").textContent = t(on ? "disconnect" : "connectDrive");
		$("driveBtn").classList.toggle("btn-ghost", on);
		$("driveInfo").textContent = on ? t("driveOn", { who: sync.email ? t("driveOnWho", { email: sync.email }) : "" }).replace("  ", " ") : t("driveOptional");
	}
	async function runSync(interactive = false) {
		if (!(await Drive.isEnabled()) && !interactive) return;
		if (sync.busy) {
			sync.pending = true;
			return;
		}
		if (!navigator.onLine) {
			sync.state = "offline";
			return renderSyncChip();
		}
		sync.busy = true;
		sync.state = "syncing";
		renderSyncChip();
		try {
			const before = JSON.stringify(Store.get());
			const merged = interactive ? await Drive.connect() : await Drive.sync(Store.get());
			if (JSON.stringify(merged) !== before) Store.replace(Store.merge(Store.get(), merged), "drive");
			sync.state = "ok";
			sync.last = Date.now();
			sync.email = await Drive.getEmail();
		} catch (e) {
			console.warn("[Rubi] sync failed", e);
			sync.state = !navigator.onLine ? "offline" : e && e.status === 401 ? "auth" : "error";
			if (interactive) throw e;
		} finally {
			sync.busy = false;
			renderSyncChip();
			if (sync.pending) {
				sync.pending = false;
				scheduleSync(500);
			}
		}
	}
	let syncTimer;
	function scheduleSync(ms = 2500) {
		clearTimeout(syncTimer);
		syncTimer = setTimeout(() => runSync(false), ms);
	}
	H.oauthError = (e) => {
		const msg = String((e && e.message) || e);
		return /client|oauth2|OAuth2/i.test(msg) ? t("oauthMissing") : t("connectFailed", { msg: msg.slice(0, 120) });
	};
	H.oauthReady = oauthReady;
	H.driveConnect = () => runSync(true);
	$("driveBtn").addEventListener("click", async () => {
		const btn = $("driveBtn");
		btn.disabled = true;
		try {
			if (await Drive.isEnabled()) {
				await Drive.disconnect();
				sync.state = "local";
				sync.email = "";
				$("settingsMsg").textContent = t("disconnected");
			} else {
				await runSync(true);
				$("settingsMsg").textContent = t("connected");
			}
		} catch (e) {
			$("settingsMsg").textContent = H.oauthError(e);
		} finally {
			btn.disabled = false;
			renderSyncChip();
			renderDriveInfo();
		}
	});
	$("syncChip").addEventListener("click", async () => {
		if (sync.state === "local") {
			ChromeSync.pull();
			return $("settingsBtn").click();
		}
		if (sync.state === "auth") {
			try {
				await runSync(true);
			} catch {}
			return;
		}
		runSync(false);
	});
	window.addEventListener("online", () => scheduleSync(300));
	window.addEventListener("offline", () => {
		if (sync.state !== "local") {
			sync.state = "offline";
			renderSyncChip();
		}
	});
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") scheduleSync(300);
		else {
			Store.flush();
			ChromeSync.flush();
		}
	});

	/* ---------- wiring ---------- */
	function renderAll() {
		const lang = setting("lang", null);
		if (lang && lang !== I18n.lang) I18n.set(lang); // triggers renderAll again via onChange
		applyTheme();
		document.title = t("brandFull");
		$("searchInput").placeholder = t("searchPh", { engine: engine()[0] });
		document.querySelectorAll("[data-widget]").forEach((w) => (w.hidden = !widgetOn(w.dataset.widget)));
		tick();
		renderBookmarks();
		renderNotes();
		renderSyncChip();
		if ($("settingsDialog").open) renderWidgetToggles();
		changeHandlers.forEach((fn) => {
			try {
				fn();
			} catch (e) {
				console.error(e);
			}
		});
	}
	I18n.onChange(() => renderAll());

	window.hamyarReady = (async function init() {
		await Store.load();
		if (!Store.list("bookmark").length && !setting("seeded", false)) {
			[["Google", "https://www.google.com"], ["Gmail", "https://mail.google.com"], ["YouTube", "https://www.youtube.com"], ["Drive", "https://drive.google.com"]].forEach(([title, url]) => Store.add("bookmark", { title, url, seed: true }));
			Store.setSetting("seeded", true);
		}
		// 2.3: the new one-screen look starts in the dark navy theme; a later choice in Settings is kept.
		if (!setting("look23", false)) {
			if (setting("theme", "dark") === "auto") Store.setSetting("theme", "dark");
			Store.setSetting("look23", true);
		}
		renderAll();
		setInterval(tick, 10 * 1000);
		Store.subscribe((_, source) => {
			renderAll();
			if (source === "local") scheduleSync();
			if (source !== "other-tab") ChromeSync.schedulePush();
		});
		await ChromeSync.pull();
		ChromeSync.schedulePush(800);
		if (await Drive.isEnabled()) {
			sync.last = await Drive.lastSync();
			sync.state = "ok";
			renderSyncChip();
			runSync(false);
		}
		$("searchInput").focus();
	})();
})();
