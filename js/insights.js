/* Rubi: daily focus report (finished 25-minute Pomodoro sessions) and the weekly summary. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const pad = (n) => String(n).padStart(2, "0");
	const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	const daysBack = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; };
	const hasLocal = () => !!globalThis.chrome?.storage?.local;
	let log = {};

	async function loadLog() {
		if (hasLocal()) log = (await chrome.storage.local.get("kamyar_pomo_log")).kamyar_pomo_log || {};
	}
	const minutes = (n) => {
		const m = n * 25;
		return m >= 60 ? t("hoursMin", { h: num(Math.floor(m / 60)), m: num(m % 60) }) : t("minOnly", { m: num(m) });
	};

	/* ---------- focus report ---------- */
	function drawStats() {
		const goal = Math.max(1, Number(setting("pomoGoal", 4)) || 4);
		const today = log[dstr(new Date())] || 0;
		const last7 = [...Array(7)].map((_, i) => daysBack(6 - i));
		const last30 = [...Array(30)].map((_, i) => log[dstr(daysBack(i))] || 0);
		const week = last7.reduce((a, d) => a + (log[dstr(d)] || 0), 0);
		const prevWeek = [...Array(7)].reduce((a, _, i) => a + (log[dstr(daysBack(7 + i))] || 0), 0);
		const best = Object.entries(log).sort((a, b) => b[1] - a[1])[0];
		let streak = 0;
		for (let i = today ? 0 : 1; log[dstr(daysBack(i))] > 0; i++) streak++;
		const max = Math.max(goal, ...last7.map((d) => log[dstr(d)] || 0));
		const wd = new Intl.DateTimeFormat(I18n.locale, { weekday: "short" });
		const pct = Math.min(100, Math.round((today / goal) * 100));
		const trend = prevWeek ? Math.round(((week - prevWeek) / prevWeek) * 100) : null;
		const msg = today >= goal ? t("fsGoalDone") : today ? t("fsKeepGoing", { n: num(goal - today) }) : t("fsStart");
		$("focusStats").replaceChildren(
			el("div", { class: "fs-today" },
				el("div", { class: "fs-ring", style: `--p:${pct}` }, el("div", {}, el("strong", {}, num(today)), el("small", {}, "/ " + num(goal)))),
				el("div", { class: "fs-today-text" },
					el("strong", {}, t("fsToday", { n: num(today) })),
					el("span", { class: "muted small" }, minutes(today) + " · " + t("fsFocus")),
					el("span", { class: "small" }, msg),
					el("label", { class: "fs-goal small muted" }, t("fsGoal") + " ",
						el("input", { type: "number", min: "1", max: "24", value: String(goal), onchange: (e) => Store.setSetting("pomoGoal", Math.max(1, Math.min(24, Number(e.target.value) || 4))) })))),
			el("div", { class: "fs-chart", role: "img", "aria-label": t("fsLast7") },
				...last7.map((d) => {
					const n = log[dstr(d)] || 0;
					return el("div", { class: "fs-col" + (dstr(d) === dstr(new Date()) ? " today" : "") + (n >= goal ? " hit" : ""), title: `${wd.format(d)}: ${num(n)} · ${minutes(n)}` },
						el("span", { class: "fs-n" }, n ? num(n) : ""),
						el("span", { class: "fs-bar" }, el("i", { style: `height:${Math.round((n / max) * 100)}%` })),
						el("small", {}, wd.format(d)));
				}),
				el("span", { class: "fs-goal-line", style: `bottom:calc(18px + ${Math.round((goal / max) * 100)}% * 0.8)` })),
			el("div", { class: "fs-facts" },
				el("div", {}, el("small", { class: "muted" }, t("fsWeek")), el("strong", {}, num(week)), el("small", {}, minutes(week)), trend != null ? el("small", { class: trend >= 0 ? "up" : "down" }, (trend >= 0 ? "▲ " : "▼ ") + num(Math.abs(trend)) + "%") : ""),
				el("div", {}, el("small", { class: "muted" }, t("fsMonth")), el("strong", {}, num(last30.reduce((a, b) => a + b, 0))), el("small", {}, t("fsAvg", { n: num(Math.round((last30.reduce((a, b) => a + b, 0) / 30) * 10) / 10) }))),
				el("div", {}, el("small", { class: "muted" }, t("streak")), el("strong", {}, "🔥 " + num(streak)), el("small", {}, t("fsDays"))),
				el("div", {}, el("small", { class: "muted" }, t("fsBest")), el("strong", {}, best ? num(best[1]) : "—"), el("small", {}, best ? H.fmtDate(new Date(best[0] + "T12:00"), H.calOrder()[0], false) : "")))
		);
	}

	/* ---------- weekly summary ---------- */
	function sec(icon, title, ...body) {
		return el("section", { class: "brief-sec" }, el("h4", {}, icon + " " + title), ...body);
	}
	function drawWeek() {
		const from = daysBack(6), fromKey = dstr(from), fromMs = new Date(fromKey + "T00:00").getTime();
		const [main] = H.calOrder();
		const range = H.fmtDate(from, main, false) + " – " + H.fmtDate(new Date(), main, false);
		const out = [el("p", { class: "muted" }, range)];
		// Tasks done
		const done = Store.list("todo").filter((x) => x.done && x.doneAt && x.doneAt >= fromMs);
		const open = Store.list("todo").filter((x) => !x.done && x.due && x.due < dstr(new Date()));
		out.push(sec("✅", t("wkTasks", { n: num(done.length) }),
			done.length ? el("ul", { class: "brief-list" }, ...done.sort((a, b) => b.doneAt - a.doneAt).slice(0, 6).map((x) => el("li", {}, el("span", { dir: "auto" }, x.text)))) : el("p", { class: "muted small" }, t("wkNoTasks")),
			open.length ? el("p", { class: "small", style: "color:var(--danger)" }, t("wkOverdue", { n: num(open.length) })) : ""));
		// Focus
		const days = [...Array(7)].map((_, i) => log[dstr(daysBack(i))] || 0);
		const total = days.reduce((a, b) => a + b, 0);
		out.push(sec("🍅", t("wkFocus"), el("p", { class: "small" }, total ? t("wkFocusText", { n: num(total), time: minutes(total), days: num(days.filter(Boolean).length) }) : t("wkNoFocus"))));
		// Habits
		const habits = Store.list("habit");
		if (habits.length)
			out.push(sec("💧", t("wHabits"), el("ul", { class: "brief-list" }, ...habits.map((h) => {
				const hit = [...Array(7)].filter((_, i) => (h.log?.[dstr(daysBack(i))] || 0) >= (h.target || 1)).length;
				return el("li", {}, el("span", {}, (h.emoji || "✅") + " "), el("span", { dir: "auto", style: "flex:1" }, h.title), el("strong", {}, num(hit) + " / " + num(7)));
			}))));
		// Spending
		const ex = Store.list("expense").filter((x) => x.date && x.date >= fromKey);
		if (ex.length) {
			const byCur = {};
			for (const x of ex) byCur[x.cur] = (byCur[x.cur] || 0) + Number(x.amount || 0);
			const fmt = (v, c) => (c === "IRT" ? num(Math.round(v)) + " " + t("toman") : new Intl.NumberFormat(I18n.locale, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(v));
			const main = Object.keys(byCur)[0];
			const byCat = {};
			for (const x of ex) if (x.cur === main) byCat[x.cat] = (byCat[x.cat] || 0) + Number(x.amount || 0);
			const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
			out.push(sec("💸", t("wkSpend"), el("p", { class: "small" }, Object.entries(byCur).map(([c, v]) => fmt(v, c)).join(" · ")), top ? el("p", { class: "muted small" }, t("wkTopCat", { cat: t("ex_" + top[0]), v: fmt(top[1], main) })) : ""));
		}
		if (H.quoteToday) {
			const [q, by] = H.quoteToday();
			out.push(el("blockquote", { class: "brief-quote", dir: "auto" }, q, by ? el("small", { class: "muted" }, " — " + by) : ""));
		}
		$("weekBody").replaceChildren(...out);
		$("weekAuto").checked = setting("weekAuto", true) !== false;
	}
	function openWeek() {
		drawWeek();
		if (!$("weekDialog").open) $("weekDialog").showModal();
	}
	H.openWeek = openWeek;
	$("weekBtn").addEventListener("click", openWeek);
	$("weekAuto").addEventListener("change", (e) => Store.setSetting("weekAuto", e.target.checked));

	// Shown once a week on the evening of the last day of the week (Friday with Iranian holidays, otherwise Sunday).
	function weekId(d) {
		const x = new Date(d);
		x.setHours(12, 0, 0, 0);
		x.setDate(x.getDate() - x.getDay());
		return dstr(x);
	}
	function maybeAutoWeek() {
		const d = new Date();
		const endDay = setting("iranHolidays", true) ? 5 : 0;
		if (setting("weekAuto", true) === false || d.getDay() !== endDay || d.getHours() < 18) return;
		let shown = null;
		try { shown = localStorage.getItem("kamyar_week_shown"); } catch {}
		if (shown === weekId(d) || document.querySelector("dialog[open]") || document.getElementById("celebrate") || H.tourOpen?.() || document.documentElement.classList.contains("focus-on")) return;
		try { localStorage.setItem("kamyar_week_shown", weekId(d)); } catch {}
		openWeek();
	}

	if (hasLocal() && chrome.storage.onChanged)
		chrome.storage.onChanged.addListener((c, area) => {
			if (area === "local" && c.kamyar_pomo_log) {
				log = c.kamyar_pomo_log.newValue || {};
				drawStats();
			}
		});
	H.onRefresh(() => {
		drawStats();
		if ($("weekDialog").open) drawWeek();
	});
	(window.hamyarReady || Promise.resolve()).then(async () => {
		await loadLog();
		drawStats();
		let busy = false;
		document.addEventListener("pointerdown", () => (busy = true), { once: true, capture: true });
		setTimeout(() => !busy && maybeAutoWeek(), 2500);
	});
})();
