/* Rubi extras: ask an AI from the search box, the daily card (hopeful quote, poem of the day, Hafez fal),
 * "read later" links, the habit tracker and the choice of rates on the home ticker. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const dayNo = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);

	/* ---------- ask an AI ---------- */
	// q: build a link that already holds the question. Without one, the question is copied so it can be pasted.
	const AIS = [
		["claude", "Claude", "https://claude.ai/new", (q) => "https://claude.ai/new?q=" + encodeURIComponent(q)],
		["chatgpt", "ChatGPT", "https://chatgpt.com", (q) => "https://chatgpt.com/?q=" + encodeURIComponent(q)],
		["gemini", "Gemini", "https://gemini.google.com/app", null],
		["perplexity", "Perplexity", "https://www.perplexity.ai", (q) => "https://www.perplexity.ai/search?q=" + encodeURIComponent(q)],
		["deepseek", "DeepSeek", "https://chat.deepseek.com", null],
		["kimi", "Kimi", "https://www.kimi.ai/", null],
	];
	async function askAi(id) {
		const ai = AIS.find((a) => a[0] === id) || AIS[0];
		const q = $("searchInput").value.trim();
		Store.setSetting("aiPick", ai[0]);
		let url = ai[2];
		if (q && ai[3]) url = ai[3](q);
		else if (q) {
			try {
				await navigator.clipboard.writeText(q);
				toast(t("aiCopied", { name: ai[1] }));
			} catch {}
		}
		location.href = url;
	}
	$("aiBtn").setAttribute("data-menu-open", "");
	$("aiBtn").addEventListener("click", () => {
		const cur = setting("aiPick", "claude");
		H.menu($("aiBtn"), AIS.map(([id, name, home]) => ({ label: name, icon: Brands.img(home, name, 16), active: id === cur, run: () => askAi(id) })));
	});
	// Shift+Enter in the search box sends the question to the last AI used.
	$("searchInput").addEventListener("keydown", (e) => {
		if (e.key === "Enter" && e.shiftKey && $("searchInput").value.trim()) {
			e.preventDefault();
			askAi(setting("aiPick", "claude"));
		}
	});

	/* ---------- daily card ---------- */
	let hafez = null;
	const loadHafez = () => hafez || (hafez = fetch("/data/hafez.json").then((r) => r.json()));
	let tab = localStorage.getItem("kamyar_daily") || "quote";
	let shift = 0;
	function quoteList() {
		return I18n.lang === "fa" ? Quotes.fa : Quotes.en;
	}
	async function drawDaily() {
		document.querySelectorAll(".daily-tab").forEach((b) => b.classList.toggle("active", b.dataset.daily === tab));
		$("dailyNext").hidden = tab === "fal" || tab === "hist";
		const body = $("dailyBody");
		if (tab === "quote") {
			const list = quoteList();
			const [text, by] = list[(((dayNo() + shift) % list.length) + list.length) % list.length];
			body.replaceChildren(el("blockquote", { class: "daily-quote", dir: "auto" }, text), by ? el("p", { class: "daily-by", dir: "auto" }, "— " + by) : "");
		} else if (tab === "poem") {
			body.replaceChildren(el("p", { class: "muted small" }, t("loading")));
			try {
				const all = await loadHafez();
				const n = (((dayNo() * 7 + shift) % all.length) + all.length) % all.length;
				const lines = all[n][0];
				const pairs = Math.floor(lines.length / 2);
				const b = (dayNo() + shift) % Math.max(1, pairs);
				body.replaceChildren(
					el("div", { class: "beyt", dir: "rtl", lang: "fa" }, el("span", {}, lines[b * 2]), el("span", {}, lines[b * 2 + 1] || "")),
					el("p", { class: "daily-by", dir: "rtl", lang: "fa" }, "— " + t("hafezGhazal", { n: num(n + 1) }))
				);
			} catch {
				body.replaceChildren(el("p", { class: "error small" }, t("loadFail")));
			}
		} else if (tab === "hist") {
			body.replaceChildren(H.historyPreview ? H.historyPreview(3) : "", el("button", { type: "button", class: "link-btn", onclick: () => H.openHistory?.() }, "📅 " + t("histOpen") + (I18n.rtl ? " ←" : " →")));
		} else if (tab === "saying") {
			body.replaceChildren(...(H.sayingView ? H.sayingView() : []));
		} else {
			body.replaceChildren(
				el("p", { class: "fal-intro", dir: "auto" }, t("falIntro")),
				el("button", { type: "button", class: "btn fal-go", onclick: openFal }, "🔮 " + t("falGo"))
			);
		}
	}
	async function openFal() {
		const all = await loadHafez().catch(() => null);
		if (!all) return toast(t("loadFail"));
		const n = Math.floor(Math.random() * all.length);
		const [lines, meaning] = all[n];
		H.bump?.("fal");
		const beyts = [];
		for (let i = 0; i < lines.length; i += 2) beyts.push(el("div", { class: "beyt" }, el("span", {}, lines[i]), el("span", {}, lines[i + 1] || "")));
		$("falBody").replaceChildren(
			el("p", { class: "muted small", dir: "auto" }, t("hafezGhazal", { n: num(n + 1) })),
			el("div", { class: "fal-poem", dir: "rtl", lang: "fa" }, ...beyts),
			meaning ? el("div", { class: "fal-meaning", dir: "rtl", lang: "fa" }, el("strong", {}, t("falMeaning") + " "), meaning) : ""
		);
		if (!$("falDialog").open) $("falDialog").showModal();
		$("falBody").scrollTop = 0;
	}
	$("falAgain").addEventListener("click", openFal);
	H.openFal = openFal;
	document.querySelectorAll(".daily-tab").forEach((b) =>
		b.addEventListener("click", () => {
			tab = b.dataset.daily;
			shift = 0;
			localStorage.setItem("kamyar_daily", tab);
			drawDaily();
		})
	);
	$("dailyNext").addEventListener("click", () => {
		if (tab === "saying") H.sayingNext?.();
		else shift++;
		drawDaily();
	});

	/* ---------- read later ---------- */
	const host = (u) => {
		try {
			return new URL(u).hostname.replace(/^www\./, "");
		} catch {
			return u;
		}
	};
	function addLater(url, title) {
		url = String(url || "").trim();
		if (!/^https?:\/\//i.test(url)) url = "https://" + url;
		try {
			new URL(url);
		} catch {
			return false;
		}
		if (Store.list("later").some((x) => x.url === url && !x.read)) return true;
		Store.add("later", { url, title: String(title || "").slice(0, 200) || host(url), read: false });
		return true;
	}
	function drawLater() {
		const all = Store.list("later").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
		const unread = all.filter((x) => !x.read), read = all.filter((x) => x.read).slice(0, 20);
		const row = (x) =>
			el("li", { class: "later-item" + (x.read ? " read" : "") },
				el("a", { href: x.url, class: "later-link", onclick: () => Store.update(x.id, { read: true }) },
					Brands.img(x.url, x.title, 18),
					el("span", { class: "later-text" }, el("span", { class: "later-title", dir: "auto" }, x.title || host(x.url)), el("small", { class: "muted", dir: "ltr" }, host(x.url)))),
				el("button", { type: "button", class: "icon-btn small", title: t(x.read ? "markUnread" : "markRead"), onclick: () => Store.update(x.id, { read: !x.read }) }, x.read ? "↺" : "✓"),
				el("button", { type: "button", class: "icon-btn small", title: t("delete"), onclick: () => Store.remove(x.id) }, "✕"));
		$("laterList").replaceChildren(
			...(unread.length ? unread.map(row) : [el("li", { class: "later-empty muted small" }, t("laterEmpty"))]),
			...(read.length ? [el("li", { class: "later-sep muted small" }, t("laterRead") + " · " + num(read.length)), ...read.map(row)] : [])
		);
	}
	$("laterForm").addEventListener("submit", (e) => {
		e.preventDefault();
		const v = $("laterInput").value.trim();
		if (!v) return;
		if (addLater(v)) $("laterInput").value = "";
		else toast(t("invalidUrl"));
	});
	// Links saved from the right-click menu wait in local storage until a Rubi tab picks them up.
	async function drainInbox() {
		if (!globalThis.chrome?.storage?.local) return;
		const { kamyar_inbox: box } = await chrome.storage.local.get("kamyar_inbox");
		if (!box || !box.length) return;
		await chrome.storage.local.remove("kamyar_inbox");
		for (const x of box) addLater(x.url, x.title);
		toast(t("laterAdded", { n: num(box.length) }));
	}
	if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener((c, area) => area === "local" && c.kamyar_inbox && c.kamyar_inbox.newValue && drainInbox());

	/* ---------- habits ---------- */
	const SUGG = [["💧", "habitWater", 8], ["🏃", "habitExercise", 1], ["📖", "habitRead", 1], ["🧘", "habitMeditate", 1], ["😴", "habitSleep", 1]];
	function streak(h) {
		let n = 0;
		const d = new Date();
		const target = h.target || 1;
		if ((h.log?.[dayKey(d)] || 0) < target) d.setDate(d.getDate() - 1);
		while ((h.log?.[dayKey(d)] || 0) >= target) {
			n++;
			d.setDate(d.getDate() - 1);
		}
		return n;
	}
	function bump(h, k, delta) {
		const target = h.target || 1;
		const cur = h.log?.[k] || 0;
		let v = delta === undefined ? (target === 1 ? (cur ? 0 : 1) : cur >= target ? 0 : cur + 1) : Math.max(0, cur + delta);
		const log = { ...(h.log || {}) };
		if (v) log[k] = v;
		else delete log[k];
		// Keep the last 120 days so the synced data stays small.
		const keys = Object.keys(log).sort();
		while (keys.length > 120) delete log[keys.shift()];
		Store.update(h.id, { log });
	}
	function drawHabits() {
		const list = Store.list("habit");
		const days = [...Array(7)].map((_, i) => {
			const d = new Date();
			d.setDate(d.getDate() - 6 + i);
			return d;
		});
		const wd = new Intl.DateTimeFormat(I18n.locale, { weekday: "narrow" });
		const today = dayKey();
		let done = 0;
		$("habitList").replaceChildren(
			...list.map((h) => {
				const target = h.target || 1;
				if ((h.log?.[today] || 0) >= target) done++;
				const s = streak(h);
				return el("div", { class: "habit" },
					el("div", { class: "habit-top" },
						el("span", { class: "habit-emoji" }, h.emoji || "✅"),
						el("strong", { class: "habit-name", dir: "auto" }, h.title),
						s ? el("span", { class: "habit-streak", title: t("streak") }, "🔥 " + num(s)) : "",
						el("button", { type: "button", class: "icon-btn small habit-x", title: t("delete"), onclick: () => Store.remove(h.id) }, "✕")),
					el("div", { class: "habit-days" },
						...days.map((d) => {
							const k = dayKey(d), v = h.log?.[k] || 0;
							const full = v >= target;
							return el("button", {
								type: "button",
								class: "habit-day" + (full ? " full" : v ? " part" : "") + (k === today ? " today" : ""),
								title: H.fmtDate ? H.fmtDate(d, H.calOrder()[0], true) : k,
								style: !full && v ? `--p:${Math.round((v / target) * 100)}%` : null,
								onclick: () => bump(h, k),
								oncontextmenu: (e) => { e.preventDefault(); bump(h, k, -1); },
							}, el("small", {}, wd.format(d)), el("b", {}, target > 1 ? num(v) : full ? "✓" : ""));
						})));
			})
		);
		$("habitSummary").textContent = list.length ? t("habitToday", { n: num(done), all: num(list.length) }) : "";
		const have = new Set(list.map((h) => h.title));
		$("habitSugg").replaceChildren(
			...SUGG.filter(([, k]) => !have.has(t(k))).map(([emoji, k, target]) =>
				el("button", { type: "button", class: "chip", onclick: () => Store.add("habit", { title: t(k), emoji, target, log: {} }) }, emoji + " " + t(k) + (target > 1 ? " ×" + num(target) : "")))
		);
	}
	$("habitForm").addEventListener("submit", (e) => {
		e.preventDefault();
		const title = $("habitName").value.trim();
		if (!title) return;
		const target = Math.max(1, Math.min(20, Number($("habitTarget").value) || 1));
		Store.add("habit", { title, emoji: $("habitEmoji").value.trim() || "✅", target, log: {} });
		$("habitName").value = "";
		$("habitTarget").value = "1";
	});

	/* ---------- ticker rates in settings ---------- */
	function drawTickerToggles() {
		const off = setting("tickerOff", {}) || {};
		const hasKey = !!setting("navasanKey", "");
		$("tickerToggles").replaceChildren(
			...Rates.TICKER.filter(([, , iran]) => !iran || hasKey).map(([key, label]) =>
				el("label", { class: "check" }, el("input", { type: "checkbox", checked: !off[key], onchange: (e) => Store.setSetting("tickerOff", { ...(setting("tickerOff", {}) || {}), [key]: !e.target.checked }) }), " ", el("span", {}, t(label))))
		);
	}

	let lastDay = dayKey();
	H.onRefresh(() => {
		drawDaily();
		drawLater();
		drawHabits();
		if ($("settingsDialog").open) drawTickerToggles();
	});
	$("settingsBtn").addEventListener("click", drawTickerToggles);
	setInterval(() => {
		if (dayKey() !== lastDay) {
			lastDay = dayKey();
			shift = 0;
			drawDaily();
			drawHabits();
		}
	}, 60000);
	(window.hamyarReady || Promise.resolve()).then(() => {
		drawDaily();
		drawLater();
		drawHabits();
		drainInbox();
	});
	H.addLater = addLater;
	H.quoteToday = () => {
		const list = quoteList();
		return list[dayNo() % list.length];
	};
})();
