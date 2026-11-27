/* Badges and achievements: earned from what you already do in Rubi (focus sessions, tasks, habits, Hafez fals,
 * the gratitude journal, games, celebrations…). Earned badges are kept in your own synced settings; each one can
 * be shared as a story-sized picture drawn in the page. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const pad = (n) => String(n).padStart(2, "0");
	const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const back = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
	let pomo = {};
	const st = () => H.funStats();

	/* ---------- what counts ---------- */
	function streakOf(has) {
		let n = 0;
		for (let i = has(dstr(back(0))) ? 0 : 1; i < 400 && has(dstr(back(i))); i++) n++;
		return n;
	}
	function bestStreak(keys) {
		const set = new Set(keys);
		let best = 0;
		for (const k of set) {
			const d = new Date(k + "T12:00:00");
			d.setDate(d.getDate() - 1);
			if (set.has(dstr(d))) continue;
			let n = 0;
			const x = new Date(k + "T12:00:00");
			while (set.has(dstr(x))) { n++; x.setDate(x.getDate() + 1); }
			best = Math.max(best, n);
		}
		return best;
	}
	const M = {
		focusStreak: () => Math.max(bestStreak(Object.keys(pomo).filter((k) => pomo[k] > 0)), st().focusStreakMax || 0),
		focusTotal: () => Object.values(pomo).reduce((a, b) => a + b, 0),
		fal: () => st().fal || 0,
		tasks: () => Math.max(Store.list("todo").filter((x) => x.done).length, st().tasksMax || 0),
		habitStreak: () => Math.max(0, st().habitStreakMax || 0, ...Store.list("habit").map((h) => bestStreak(Object.keys(h.log || {}).filter((k) => (h.log[k] || 0) >= (h.target || 1))))),
		journal: () => Store.list("journal").length,
		visits: () => st().visitDays || 0,
		hist: () => st().histDays || 0,
		story: () => st().story || 0,
		t2048: () => st().g2048_tile || 0,
		snake: () => st().snake_best || 0,
		games: () => st().gamesPlayed || 0,
		bday: () => st().cele_birthday || 0,
		nowruz: () => st().cele_nowruz || 0,
		yalda: () => st().cele_yalda || 0,
		suri: () => st().suriJump || 0,
		early: () => st().early || 0,
		owl: () => st().owl || 0,
		pet: () => st().petLevel || 0,
		voice: () => st().voice || 0,
		astro: () => st().astroDays || 0,
		notes: () => Store.list("note").length
	};
	// [id, icon, metric, goal, tier 0 bronze · 1 silver · 2 gold]
	const LIST = [
		["focus3", "🔥", "focusStreak", 3, 0], ["focus7", "🔥", "focusStreak", 7, 1], ["focus30", "🔥", "focusStreak", 30, 2],
		["pomo10", "🍅", "focusTotal", 10, 0], ["pomo50", "🍅", "focusTotal", 50, 1], ["pomo200", "🍅", "focusTotal", 200, 2],
		["fal1", "🔮", "fal", 1, 0], ["fal30", "🔮", "fal", 30, 1], ["fal100", "🔮", "fal", 100, 2],
		["task10", "✅", "tasks", 10, 0], ["task100", "✅", "tasks", 100, 1], ["task500", "✅", "tasks", 500, 2],
		["habit7", "💧", "habitStreak", 7, 1], ["habit30", "💧", "habitStreak", 30, 2],
		["journal7", "🙏", "journal", 7, 0], ["journal30", "🙏", "journal", 30, 1], ["journal100", "🙏", "journal", 100, 2],
		["visit7", "📅", "visits", 7, 0], ["visit30", "📅", "visits", 30, 1], ["visit100", "📅", "visits", 100, 2],
		["hist7", "📜", "hist", 7, 0], ["hist30", "📜", "hist", 30, 1],
		["story1", "📸", "story", 1, 0], ["story10", "📸", "story", 10, 1],
		["t512", "🧩", "t2048", 512, 0], ["t2048", "🧩", "t2048", 2048, 2],
		["snake20", "🐍", "snake", 20, 0], ["snake50", "🐍", "snake", 50, 2],
		["games10", "🎮", "games", 10, 0],
		["bday", "🎂", "bday", 1, 1], ["nowruz", "🌱", "nowruz", 1, 1], ["yalda", "🍉", "yalda", 1, 1], ["suri", "🔥", "suri", 1, 0],
		["early", "🌅", "early", 1, 0], ["owl", "🦉", "owl", 1, 0],
		["pet5", "🐾", "pet", 5, 1], ["pet10", "🐾", "pet", 10, 2],
		["voice", "🎙️", "voice", 1, 0], ["astro7", "🔭", "astro", 7, 0],
		["notes20", "🗒️", "notes", 20, 0]
	];
	const TIER = [["#cd7f32", "#f4c39a", "#8a4f1e"], ["#a8b3c2", "#f1f5f9", "#64748b"], ["#f5b301", "#fff3b0", "#b45309"]];
	const name = (id) => t("bd_" + id);
	const desc = (b) => t("bdd_" + b[2], { n: num(b[3]) });

	/* ---------- daily bookkeeping: days with Rubi open, early bird and night owl ---------- */
	function daily() {
		const today = H.dayKey(), s = st(), h = new Date().getHours();
		const next = { ...s };
		let changed = false;
		if (s.lastVisit !== today) { next.lastVisit = today; next.visitDays = (s.visitDays || 0) + 1; changed = true; }
		if (h >= 4 && h < 6 && !s.early) { next.early = 1; changed = true; }
		if (h >= 0 && h < 4 && !s.owl) { next.owl = 1; changed = true; }
		let seen = null;
		try { seen = localStorage.getItem("rubi_hist_seen"); } catch {}
		if (seen === today && s.histLast !== today) { next.histLast = today; next.histDays = (s.histDays || 0) + 1; changed = true; }
		if (changed) Store.setSetting("funStats", next);
	}

	/* ---------- checking and unlocking ---------- */
	const earned = () => setting("badges", {}) || {};
	let ready = false, checking = false;
	function check() {
		if (!ready || checking) return;
		checking = true;
		try {
			const have = earned();
			const fresh = LIST.filter((b) => !have[b[0]] && M[b[2]]() >= b[3]);
			if (!fresh.length) return;
			const now = Date.now();
			Store.setSetting("badges", { ...have, ...Object.fromEntries(fresh.map((b) => [b[0], now])) });
			// The first check after this update may find many earned badges at once: one quiet message then.
			if (fresh.length > 2 && !Object.keys(have).length) toast(t("bdMany", { n: num(fresh.length) }), { label: t("bdSee"), run: open });
			else fresh.forEach((b, i) => setTimeout(() => announce(b), i * 2600));
		} finally { checking = false; }
	}
	function announce(b) {
		if (document.getElementById("celebrate")) return toast("🏅 " + name(b[0]));
		const card = el("div", { class: "care-card badge-pop t" + b[4], role: "status" },
			el("span", { class: "badge-medal small t" + b[4] }, b[1]),
			el("div", { class: "grow" }, el("strong", {}, t("bdNew")), el("div", {}, name(b[0])), el("small", { class: "muted" }, desc(b)),
				el("div", { class: "fun-row", style: "gap:6px;margin-top:8px" },
					el("button", { type: "button", class: "btn small", onclick: () => { shareBadge(b); } }, "📤 " + t("bdShare")),
					el("button", { type: "button", class: "btn btn-ghost small", onclick: () => { card.remove(); open(); } }, t("bdSee")))),
			el("button", { class: "care-x", type: "button", "aria-label": t("close"), onclick: () => card.remove() }, "✕"));
		$("careStack").append(card);
		requestAnimationFrame(() => card.classList.add("in"));
		const r = card.getBoundingClientRect();
		Fx.confetti({ x: r.left + 30, y: r.top + 20, count: 80, power: 520, colors: b[4] === 2 ? "gold" : "party" });
		setTimeout(() => { card.classList.add("out"); setTimeout(() => card.remove(), 400); }, 12000);
	}

	/* ---------- the badge page ---------- */
	function medal(b, got) {
		return el("div", { class: "badge" + (got ? " got" : ""), title: desc(b) },
			el("span", { class: "badge-medal t" + b[4] }, b[1]),
			el("strong", {}, name(b[0])),
			el("small", { class: "muted" }, desc(b)));
	}
	function grid(full) {
		const have = earned();
		const items = LIST.map((b) => {
			const got = !!have[b[0]];
			const v = Math.min(b[3], M[b[2]]());
			const m = medal(b, got);
			if (got) {
				m.append(el("small", { class: "badge-when" }, H.fmtDate(new Date(have[b[0]]), H.calOrder()[0], false)));
				m.append(el("button", { type: "button", class: "link-btn small", onclick: () => shareBadge(b) }, "📤 " + t("bdShare")));
			} else m.append(el("div", { class: "badge-bar", title: num(v) + " / " + num(b[3]) }, el("i", { style: `width:${Math.round((v / b[3]) * 100)}%` })), el("small", { class: "badge-prog" }, num(v) + " / " + num(b[3])));
			return [got, m];
		});
		const list = full ? items : items.filter(([g]) => g).slice(-6).concat(items.filter(([g]) => !g).slice(0, Math.max(0, 6 - items.filter(([g]) => g).slice(-6).length)));
		return el("div", { class: "badge-grid" + (full ? " full" : "") }, ...list.sort((a, b) => b[0] - a[0]).map(([, m]) => m));
	}
	function dlg() {
		let d = $("badgeDialog");
		if (!d) {
			d = el("dialog", { id: "badgeDialog", class: "dialog badge-dlg" },
				el("div", { class: "dialog-body" },
					el("div", { class: "page-head" }, el("h3", {}, "🏅 " + t("bdTitle")), el("span", { id: "bdCount", class: "muted small" }), el("span", { class: "grow" }), el("button", { class: "icon-btn small", type: "button", title: t("close"), onclick: () => d.close() }, "✕")),
					el("div", { id: "badgeBody", class: "badge-body" })));
			d.addEventListener("click", (e) => e.target === d && d.close());
			document.body.append(d);
		}
		return d;
	}
	function open() {
		const d = dlg();
		$("badgeBody").replaceChildren(grid(true));
		$("bdCount").textContent = " · " + t("bdCount", { n: num(Object.keys(earned()).filter((k) => LIST.some((b) => b[0] === k)).length), all: num(LIST.length) });
		if (!d.open) d.showModal();
	}
	H.openBadges = open;

	/* ---------- share picture ---------- */
	async function shareBadge(b) {
		const cv = document.createElement("canvas");
		const W = 1080, Hh = 1920;
		cv.width = W; cv.height = Hh;
		const cx = cv.getContext("2d");
		try { await Promise.all([document.fonts.load("700 60px Vazirmatn"), document.fonts.load("400 40px Vazirmatn")]); } catch {}
		const [c1, c2, c3] = TIER[b[4]];
		const g = cx.createLinearGradient(0, 0, W, Hh);
		g.addColorStop(0, "#1e1b4b"); g.addColorStop(0.6, "#4c1d95"); g.addColorStop(1, "#831843");
		cx.fillStyle = g; cx.fillRect(0, 0, W, Hh);
		// rays
		cx.save(); cx.translate(W / 2, 760);
		for (let i = 0; i < 24; i++) { cx.rotate(Math.PI / 12); cx.fillStyle = `rgba(255,255,255,${i % 2 ? 0.035 : 0.07})`; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(-90, -1100); cx.lineTo(90, -1100); cx.closePath(); cx.fill(); }
		cx.restore();
		// confetti dots
		for (let i = 0; i < 70; i++) { cx.fillStyle = ["#ff5d8f", "#ffc93c", "#4ade80", "#38bdf8", "#a78bfa"][i % 5]; cx.save(); cx.translate((i * 157) % W, (i * 271) % Hh); cx.rotate(i); cx.fillRect(-8, -3, 16, 6); cx.restore(); }
		// ribbon
		cx.fillStyle = "#e11d48"; cx.beginPath(); cx.moveTo(W / 2 - 150, 360); cx.lineTo(W / 2 - 40, 360); cx.lineTo(W / 2 - 20, 700); cx.lineTo(W / 2 - 170, 640); cx.closePath(); cx.fill();
		cx.fillStyle = "#2563eb"; cx.beginPath(); cx.moveTo(W / 2 + 150, 360); cx.lineTo(W / 2 + 40, 360); cx.lineTo(W / 2 + 20, 700); cx.lineTo(W / 2 + 170, 640); cx.closePath(); cx.fill();
		// medal
		const mg = cx.createRadialGradient(W / 2 - 80, 680, 30, W / 2, 780, 260);
		mg.addColorStop(0, c2); mg.addColorStop(0.55, c1); mg.addColorStop(1, c3);
		cx.fillStyle = mg; cx.beginPath(); cx.arc(W / 2, 780, 250, 0, 6.28); cx.fill();
		cx.strokeStyle = "rgba(255,255,255,.55)"; cx.lineWidth = 10; cx.beginPath(); cx.arc(W / 2, 780, 210, 0, 6.28); cx.stroke();
		cx.textAlign = "center"; cx.textBaseline = "middle";
		cx.font = "200px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
		cx.fillText(b[1], W / 2, 790);
		cx.direction = I18n.rtl ? "rtl" : "ltr";
		cx.fillStyle = "#fff";
		cx.font = "700 46px Vazirmatn";
		cx.fillText(t("bdEarned"), W / 2, 1120);
		cx.font = "800 84px Vazirmatn";
		H.wrapText(cx, name(b[0]), W - 200).forEach((l, i) => cx.fillText(l, W / 2, 1240 + i * 100));
		cx.font = "400 42px Vazirmatn"; cx.fillStyle = "rgba(255,255,255,.85)";
		H.wrapText(cx, desc(b), W - 240).forEach((l, i) => cx.fillText(l, W / 2, 1400 + i * 60));
		const who = setting("name", "");
		const when = earned()[b[0]] ? H.fmtDate(new Date(earned()[b[0]]), H.calOrder()[0], false) : "";
		cx.font = "400 36px Vazirmatn";
		cx.fillText([who, when].filter(Boolean).join(" · "), W / 2, 1560);
		const logo = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "icons/icon-128.png"; });
		cx.font = "700 34px Vazirmatn"; cx.fillStyle = "rgba(255,255,255,.8)";
		if (logo) cx.drawImage(logo, W / 2 - 150, Hh - 210, 56, 56);
		cx.fillText("روبی · Rubi", W / 2 + 30, Hh - 182);
		H.sharePng(cv, "rubi-badge-" + b[0] + ".png", name(b[0]));
	}
	H.shareBadge = (id) => { const b = LIST.find((x) => x[0] === id); if (b) shareBadge(b); };

	/* ---------- fun page card ---------- */
	const body = el("div", { class: "fun-badges" });
	function drawCard() {
		const n = Object.keys(earned()).filter((k) => LIST.some((b) => b[0] === k)).length;
		body.replaceChildren(el("p", { class: "muted small" }, t("bdCount", { n: num(n), all: num(LIST.length) })), grid(false), el("button", { class: "btn", type: "button", onclick: open }, "🏅 " + t("bdAll")));
	}
	H.funCard("badges", { icon: "🏅", title: "bdTitle", order: 40, body });

	let sig = "";
	function refresh() {
		const s = JSON.stringify([earned(), st(), Store.list("todo").filter((x) => x.done).length, Store.list("journal").length, I18n.lang, Object.keys(pomo).length]);
		if (s === sig) return;
		sig = s;
		check();
		drawCard();
		if ($("badgeDialog")?.open) open();
	}
	H.onRefresh(refresh);
	addEventListener("rubi-stat", () => setTimeout(() => { if (ready) daily(); refresh(); }, 50));
	chrome.storage.onChanged.addListener((c, area) => { if (area === "local" && c.kamyar_pomo_log) { pomo = c.kamyar_pomo_log.newValue || {}; refresh(); } });
	(async () => {
		pomo = (await chrome.storage.local.get("kamyar_pomo_log")).kamyar_pomo_log || {};
		await window.hamyarReady;
		ready = true;
		daily();
		refresh();
		setInterval(() => document.visibilityState === "visible" && daily(), 10 * 60000);
	})();
	window.Badges = { LIST, M, check, open };
})();
