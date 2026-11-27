/* One-screen layout: side rail views, notes/tasks switch, clock card (short date, timer menu, mini weather,
 * rates ticker), search engine picker, calendar footer and note quick-add. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	const ls = {
		get: (k, d) => {
			try {
				return localStorage.getItem(k) ?? d;
			} catch {
				return d;
			}
		},
		set: (k, v) => {
			try {
				localStorage.setItem(k, v);
			} catch {}
		}
	};

	/* ---------- views (home / tools) ---------- */
	const VIEWS = ["home", "apps", "tools", "plan", "fun"];
	let view = VIEWS.includes(ls.get("hamyar_view", "home")) ? ls.get("hamyar_view", "home") : "home";
	function showView(v) {
		view = v;
		ls.set("hamyar_view", v);
		$("viewHome").hidden = v !== "home";
		$("viewTools").hidden = v !== "tools";
		$("viewApps").hidden = v !== "apps";
		$("viewPlan").hidden = v !== "plan";
		$("viewFun").hidden = v !== "fun";
		// One tasks / notes panel, shown on the home page or beside the week planner.
		const panel = document.querySelector(".side-panel");
		const home = document.querySelector(".col-c");
		if (v === "plan" && panel.parentNode !== $("planSide")) $("planSide").append(panel);
		else if (v !== "plan" && panel.parentNode !== home) home.append(panel);
		if (v === "plan") Plan.show();
		if (v === "apps" && window.Services) Services.render();
		if (v === "apps") Services.render();
		document.querySelectorAll(".rail-btn[data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === v));
		document.documentElement.dataset.view = v;
	}
	document.querySelectorAll(".rail-btn[data-go]").forEach((b) =>
		b.addEventListener("click", () => {
			const go = b.dataset.go;
			if (VIEWS.includes(go)) return showView(go);
			if (go === "cal") return Events.openEditor(null);
		})
	);
	function toolTab(name) {
		showView("tools");
		const b = document.querySelector(`.tools-tabs .seg-btn[data-tool="${name}"]`);
		if (b) b.click();
		const w = document.querySelector(`[data-widget="${name === "pomodoro" ? "pomodoro" : "tools"}"]`);
		if (w) {
			w.classList.remove("flash");
			void w.offsetWidth;
			w.classList.add("flash");
		}
	}
	H.showView = showView;

	/* ---------- AI sites in the rail ---------- */
	const AI = [["Claude", "https://claude.ai"], ["ChatGPT", "https://chatgpt.com"], ["Gemini", "https://gemini.google.com"], ["Qwen", "https://chat.qwen.ai"], ["DeepSeek", "https://chat.deepseek.com"], ["NotebookLM", "https://notebooklm.google.com"]];
	$("railAi").replaceChildren(...AI.map(([name, url]) => el("a", { class: "rail-btn rail-site", href: url, "data-label": name, "aria-label": name }, H.siteImg(url, name, 22))));

	/* ---------- rail labels (tooltips) ---------- */
	function labelRail() {
		document.querySelectorAll("[data-tip]").forEach((b) => {
			const s = t(b.dataset.tip);
			b.setAttribute("aria-label", s);
			b.dataset.label = s;
		});
		$("syncChip").dataset.label = $("syncText").textContent;
	}
	new MutationObserver(() => ($("syncChip").dataset.label = $("syncText").textContent)).observe($("syncText"), { childList: true, characterData: true, subtree: true });

	/* ---------- notes / tasks switch ---------- */
	let side = ["note", "later"].includes(ls.get("hamyar_side", "todo")) ? ls.get("hamyar_side", "todo") : "todo";
	function showSide(v) {
		side = v;
		ls.set("hamyar_side", v);
		document.querySelectorAll(".side-tab").forEach((b) => {
			b.classList.toggle("active", b.dataset.side === v);
			b.setAttribute("aria-selected", String(b.dataset.side === v));
		});
		document.querySelector(".side-todo").hidden = v !== "todo";
		document.querySelector(".side-note").hidden = v !== "note";
		document.querySelector(".side-later").hidden = v !== "later";
	}
	document.querySelectorAll(".side-tab").forEach((b) => b.addEventListener("click", () => {
		showSide(b.dataset.side);
		$(side === "todo" ? "todoInput" : side === "later" ? "laterInput" : "noteQuick").focus();
	}));
	$("noteForm").addEventListener("submit", (e) => {
		e.preventDefault();
		const text = $("noteQuick").value.trim();
		if (!text) return H.openNote(Store.add("note", { title: "", body: "" }).id);
		Store.add("note", { title: text.slice(0, 80), body: text.length > 80 ? text : "" });
		$("noteQuick").value = "";
	});
	H.showSide = showSide;

	/* ---------- clock card ---------- */
	$("clockMenuBtn").setAttribute("data-menu-open", "");
	$("clockMenuBtn").addEventListener("click", (e) =>
		H.menu(e.currentTarget, [
			{ icon: "⏲", label: t("tTimer"), run: () => toolTab("timer") },
			{ icon: "⏱", label: t("tWatch"), run: () => toolTab("watch") },
			{ icon: "🍅", label: t("wPomodoro"), run: () => toolTab("pomodoro") },
			{ icon: "⏳", label: t("tCountdown"), run: () => toolTab("count") },
			{ icon: "🔁", label: t("tConvert"), run: () => toolTab("convert") },
			{ icon: "🎂", label: t("tAge"), run: () => toolTab("age") }
		])
	);
	function drawWx() {
		const w = H.wx;
		const box = $("wxMini");
		box.hidden = !H.widgetOn("weather");
		if (!w) {
			box.replaceChildren(el("span", { class: "wx-m-icon" }, "⛅"), el("span", { class: "wx-m-city muted" }, t("enterCity")));
			return;
		}
		box.replaceChildren(
			el("span", { class: "wx-m-icon" }, w.icon),
			el("span", { class: "wx-m-temp" }, w.temp + "°"),
			el("span", { class: "wx-m-label" }, w.label),
			el("span", { class: "wx-m-city muted", dir: "auto" }, `${w.city} · ${w.hi}° / ${w.lo}°`),
			...(w.aq && H.aqiLevel ? [(() => { const lv = H.aqiLevel(w.aq.aqi); return el("span", { class: "wx-m-aq" + (lv.bad ? " bad" : ""), style: `--aq:${lv.color}`, title: t("aqTitle") + ": " + t(lv.key) }, "AQI " + num(Math.round(w.aq.aqi))); })()] : [])
		);
	}
	$("wxMini").addEventListener("click", () => {
		showView("tools");
		if (!setting("city")) $("wxEdit").click();
	});
	function occRows() {
		return Occasions.forDay(new Date(), { iran: setting("iranHolidays", true), world: setting("worldDays", true), cats: setting("occCats", {}) || {} }).map((o) =>
			el("li", { class: "tk-occ" + (o.off ? " off" : ""), title: t("todayIs") }, el("span", { class: "tk-emoji" }, o.emoji), el("span", { class: "tk-occ-name" }, o.name)));
	}
	function drawTicker() {
		const list = H.widgetOn("rates") ? H.ticker || [] : [];
		const ul = $("tickerList");
		const occ = occRows();
		if (!list.length) return ul.replaceChildren(...occ, ...(H.widgetOn("rates") ? [el("li", { class: "muted small" }, t("loading"))] : []));
		ul.replaceChildren(
			...occ,
			...list.map((r) =>
				el("li", { class: "tk" + (r.change > 0 ? " up" : r.change < 0 ? " down" : "") },
					el("span", { class: "tk-label" }, r.label, r.code ? el("small", { class: "muted" }, " " + r.code) : null),
					el("span", { class: "tk-val" }, r.value, r.unit ? el("small", { class: "muted" }, " " + r.unit) : null),
					el("span", { class: "tk-chg" }, r.pct != null && isFinite(r.pct) ? (r.pct >= 0 ? "▲" : "▼") + num(Math.abs(r.pct), { maximumFractionDigits: 1 }) + "%" : r.change > 0 ? "▲" : r.change < 0 ? "▼" : ""))
			)
		);
	}
	window.addEventListener("hamyar-wx", drawWx);
	window.addEventListener("hamyar-rates", drawTicker);
	$("tickerList").addEventListener("click", (e) => !e.target.closest(".tk-occ") && showView("tools"));

	/* ---------- search engine picker ---------- */
	const engineHome = (id) => new URL(H.ENGINES[id][1]).origin;
	function favicon(url) {
		const b = Brands.find(url);
		if (b) return "icons/brands/" + b[0];
		const u = new URL(chrome.runtime.getURL("/_favicon/"));
		u.searchParams.set("pageUrl", url);
		u.searchParams.set("size", "32");
		return u.toString();
	}
	function drawEngine() {
		const id = H.ENGINES[setting("engine", "google")] ? setting("engine", "google") : "google";
		$("engineIcon").src = favicon(engineHome(id));
		$("engineBtn").title = H.ENGINES[id][0];
	}
	$("engineBtn").setAttribute("data-menu-open", "");
	$("engineBtn").addEventListener("click", (e) =>
		H.menu(
			e.currentTarget,
			Object.keys(H.ENGINES).map((id) => ({ icon: el("img", { src: favicon(engineHome(id)), alt: "", width: "16", height: "16" }), label: H.ENGINES[id][0], active: setting("engine", "google") === id, run: () => { Store.setSetting("engine", id); $("searchInput").focus(); } }))
		)
	);

	/* ---------- calendar footer ---------- */
	function drawCalFoot() {
		$("calFoot").replaceChildren(
			el("a", { class: "cal-foot-btn", href: "https://calendar.google.com/" }, el("span", {}, "📅"), t("gcalOpen")),
			el("button", { class: "cal-foot-btn", type: "button", onclick: () => $("calTitle").click() }, el("span", {}, "◉"), t("today")),
			el("button", { class: "cal-foot-btn", type: "button", onclick: () => H.openShare && H.openShare() }, el("span", {}, "👨‍👩‍👧"), t("shShort"))
		);
	}

	let sig = "";
	H.onRefresh(() => {
		labelRail();
		drawEngine();
		const s = JSON.stringify([I18n.lang, H.widgetOn("weather"), H.widgetOn("rates"), setting("iranHolidays", true), setting("worldDays", true), setting("occCats", {}), new Date().toDateString()]);
		if (s === sig) return;
		sig = s;
		drawWx();
		drawTicker();
		drawCalFoot();
	});
	let today = new Date().toDateString();
	setInterval(() => {
		if (new Date().toDateString() === today) return;
		today = new Date().toDateString();
		drawTicker();
	}, 60000);
	showView(view);
	showSide(side);
})();
