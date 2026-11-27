/* Water and eye-break reminders (the timing runs in the service worker; this page shows the cards at its edge),
 * plus the "new version available" bar and the "updated" note. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const hasLocal = () => !!globalThis.chrome?.storage?.local;
	const DEF = { water: { on: true, every: 60 }, eye: { on: true, every: 20 }, sys: true, side: "end", quiet: true, goal: 8 };
	const cfg = () => {
		const c = setting("care", {}) || {};
		return { ...DEF, ...c, water: { ...DEF.water, ...(c.water || {}) }, eye: { ...DEF.eye, ...(c.eye || {}) } };
	};
	const saveCfg = (patch) => Store.setSetting("care", { ...cfg(), ...patch });
	const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	let water = {};

	/* ---------- edge cards ---------- */
	function side() {
		$("careStack").classList.toggle("start", cfg().side === "start");
	}
	function close(card) {
		card.classList.add("out");
		setTimeout(() => card.remove(), 250);
	}
	async function drink() {
		const k = dkey();
		water = { ...water, [k]: (water[k] || 0) + 1 };
		if (hasLocal()) await chrome.storage.local.set({ kamyar_water: water });
		draw();
		const n = water[k], goal = cfg().goal;
		toast(n >= goal ? t("careGoalDone", { n: num(n) }) : t("careCount", { n: num(n), goal: num(goal) }));
	}
	async function snooze(kind, min = 10) {
		if (!hasLocal()) return;
		const st = (await chrome.storage.local.get("kamyar_care_state")).kamyar_care_state || {};
		const every = cfg()[kind].every;
		await chrome.storage.local.set({ kamyar_care_state: { ...st, [kind]: Date.now() - Math.max(0, every - min) * 60000 } });
	}
	function show(kind) {
		side();
		$("careStack").querySelectorAll(".care-card." + kind).forEach((c) => c.remove());
		const x = el("button", { type: "button", class: "care-x", title: t("close"), "aria-label": t("close"), onclick: () => close(card) }, "✕");
		const body = el("div", { class: "care-body" }, el("strong", {}, t(kind === "water" ? "careWaterTitle" : "careEyeTitle")), el("p", {}, t(kind === "water" ? "careWaterMsg" : "careEyeMsg")));
		const actions = el("div", { class: "care-actions" });
		const card = el("div", { class: "care-card " + kind, role: "status" }, el("span", { class: "care-ic" }, kind === "water" ? "💧" : "👀"), body, x);
		if (kind === "water") {
			const today = water[dkey()] || 0;
			body.append(el("small", { class: "muted" }, t("careCount", { n: num(today), goal: num(cfg().goal) })));
			actions.append(
				el("button", { type: "button", class: "btn small", onclick: () => { drink(); close(card); } }, t("careDrank")),
				el("button", { type: "button", class: "btn btn-ghost small", onclick: () => { snooze("water"); close(card); } }, t("careLater")));
		} else {
			// 20-second countdown; the card closes by itself when it is done.
			let left = 20;
			const bar = el("i");
			const sec = el("span", { class: "care-sec" }, num(left));
			body.append(el("div", { class: "care-timer" }, el("span", { class: "care-track" }, bar), sec));
			let timer = 0;
			const start = el("button", { type: "button", class: "btn small", onclick: () => {
				start.disabled = true;
				bar.style.transition = "width 20s linear";
				requestAnimationFrame(() => (bar.style.width = "100%"));
				timer = setInterval(() => {
					sec.textContent = num(--left);
					if (left <= 0) {
						clearInterval(timer);
						sec.textContent = "✓";
						body.querySelector("p").textContent = t("careEyeDone");
						setTimeout(() => close(card), 2500);
					}
				}, 1000);
			} }, t("careStart"));
			actions.append(start, el("button", { type: "button", class: "btn btn-ghost small", onclick: () => { clearInterval(timer); snooze("eye"); close(card); } }, t("careLater")));
		}
		body.append(actions);
		$("careStack").append(card);
		requestAnimationFrame(() => card.classList.add("in"));
		return card;
	}
	H.careShow = show;

	if (hasLocal() && chrome.runtime?.onMessage)
		chrome.runtime.onMessage.addListener((m, _s, reply) => {
			if (!m || m.type !== "kamyar-care") return;
			// Only the tab the person is looking at answers; the others stay quiet.
			if (document.visibilityState !== "visible" || !document.hasFocus()) return;
			show(m.kind);
			reply({ shown: true });
		});

	/* ---------- widget ---------- */
	function every(sel, list, cur) {
		$(sel).replaceChildren(...list.map((m) => el("option", { value: String(m), selected: m === cur }, m >= 60 ? t("everyH", { n: num(m / 60) }) : t("everyM", { n: num(m) }))));
	}
	function draw() {
		const c = cfg();
		const n = water[dkey()] || 0;
		$("careWaterToday").textContent = t("careToday", { n: num(n), goal: num(c.goal) });
		$("careWaterBar").replaceChildren(...[...Array(Math.max(c.goal, n))].map((_, i) => el("span", { class: i < n ? "on" : "" })));
		$("careWaterOn").checked = c.water.on;
		$("careEyeOn").checked = c.eye.on;
		every("careWaterEvery", [30, 45, 60, 90, 120], Number(c.water.every));
		every("careEyeEvery", [15, 20, 30, 45, 60], Number(c.eye.every));
		$("careWaterEvery").disabled = !c.water.on;
		$("careEyeEvery").disabled = !c.eye.on;
		$("careSide").value = c.side;
		$("careGoal").value = String(c.goal);
		$("careSys").checked = c.sys;
		$("careQuiet").checked = c.quiet;
		side();
	}
	$("careWaterOn").addEventListener("change", (e) => saveCfg({ water: { ...cfg().water, on: e.target.checked } }));
	$("careEyeOn").addEventListener("change", (e) => saveCfg({ eye: { ...cfg().eye, on: e.target.checked } }));
	$("careWaterEvery").addEventListener("change", (e) => saveCfg({ water: { ...cfg().water, every: Number(e.target.value) } }));
	$("careEyeEvery").addEventListener("change", (e) => saveCfg({ eye: { ...cfg().eye, every: Number(e.target.value) } }));
	$("careSide").addEventListener("change", (e) => saveCfg({ side: e.target.value }));
	$("careGoal").addEventListener("change", (e) => saveCfg({ goal: Math.max(1, Math.min(20, Number(e.target.value) || 8)) }));
	$("careSys").addEventListener("change", (e) => saveCfg({ sys: e.target.checked }));
	$("careQuiet").addEventListener("change", (e) => saveCfg({ quiet: e.target.checked }));
	$("careDrink").addEventListener("click", drink);
	$("careTest").addEventListener("click", () => { show("water"); show("eye"); });

	/* ---------- updates ---------- */
	const VER = globalThis.chrome?.runtime?.getManifest ? chrome.runtime.getManifest().version : "";
	let dismissed = "";
	try { dismissed = localStorage.getItem("kamyar_upd_dismissed") || ""; } catch {}
	const STORE = "https://chromewebstore.google.com/detail/ohpaebogaegajgcgeemadkdinfohpemp";
	const fromStore = !!(globalThis.chrome?.runtime?.getManifest && chrome.runtime.getManifest().update_url);
	const updX = (key) => el("button", { type: "button", class: "care-x", title: t("close"), "aria-label": t("close"), onclick: () => { try { localStorage.setItem("kamyar_upd_dismissed", key); } catch {} dismissed = key; $("updateBar").hidden = true; } }, "✕");
	function drawUpdate(u) {
		const bar = $("updateBar");
		if (u && u.store && u.ready) {
			// Store copy: the new version is downloaded; one click restarts Rubi into it.
			bar.replaceChildren(el("span", {}, "🎁 "), el("span", { class: "grow" }, t("updReady", { v: u.latest })),
				el("button", { type: "button", class: "btn small", onclick: () => chrome.runtime.sendMessage({ type: "kamyar-update-now" }) }, t("updNow")));
			bar.hidden = false;
		} else if (!fromStore && u && u.newer && u.latest && u.latest !== dismissed) {
			bar.replaceChildren(el("span", {}, "🎁 "), el("span", { class: "grow" }, t("updAvail", { v: u.latest })),
				el("a", { class: "btn small", href: STORE, target: "_blank", rel: "noopener" }, t("updStore")),
				el("button", { type: "button", class: "btn btn-ghost small", onclick: () => H.updateHelp(u) }, t("updHow")), updX(u.latest));
			bar.hidden = false;
		} else if (!fromStore && globalThis.chrome?.runtime?.id && dismissed !== "store" && !(u && u.newer)) {
			// A copy from the zip: Rubi is in the Chrome Web Store now, where it updates by itself.
			bar.replaceChildren(el("span", {}, "🧩 "), el("span", { class: "grow" }, t("updStorePromo")),
				el("a", { class: "btn small", href: STORE, target: "_blank", rel: "noopener" }, t("updStore")),
				el("button", { type: "button", class: "btn btn-ghost small", onclick: () => H.updateHelp(u) }, t("updHow")), updX("store"));
			bar.hidden = false;
		} else bar.hidden = true;
		$("updInfo").textContent = u && u.latest ? (u.newer ? t(u.store ? "updReady" : "updAvail", { v: u.latest }) : t("updLatest", { v: VER })) : t(fromStore ? "updAuto" : "updVersion", { v: VER });
	}
	H.updateHelp = (u) => {
		const steps = el("ol", { class: "steps" }, ...["updMove1", "updMove2", "updMove3", "updMove4"].map((k) => el("li", {}, t(k))));
		const d = el("dialog", { class: "dialog small" }, el("div", { class: "dialog-body" },
			el("h3", {}, t("updMoveTitle")), steps, el("p", { class: "muted small" }, t("updMoveSafe")),
			el("div", { class: "dialog-actions" },
				el("a", { class: "btn", href: STORE, target: "_blank", rel: "noopener" }, t("updStore")),
				el("button", { type: "button", class: "btn btn-ghost", onclick: () => chrome.tabs.create({ url: "chrome://extensions" }) }, t("updOpenExt")),
				el("button", { type: "button", class: "btn btn-ghost", onclick: () => d.close() }, t("close")))));
		d.addEventListener("close", () => d.remove());
		document.body.append(d);
		d.showModal();
	};
	$("updCheck").addEventListener("click", async () => {
		$("updInfo").textContent = t("updChecking");
		try {
			dismissed = "";
			await chrome.runtime.sendMessage({ type: "kamyar-update-check" });
			const u = (await chrome.storage.local.get("kamyar_update")).kamyar_update;
			if (!u || !u.latest) $("updInfo").textContent = t("updFail");
			else drawUpdate(u);
		} catch {
			$("updInfo").textContent = t("updFail");
		}
	});

	if (hasLocal() && chrome.storage.onChanged)
		chrome.storage.onChanged.addListener((c, area) => {
			if (area !== "local") return;
			if (c.kamyar_water) { water = c.kamyar_water.newValue || {}; draw(); }
			if (c.kamyar_update) drawUpdate(c.kamyar_update.newValue);
		});
	H.onRefresh(draw);
	(window.hamyarReady || Promise.resolve()).then(async () => {
		if (hasLocal()) {
			const s = await chrome.storage.local.get(["kamyar_water", "kamyar_update", "kamyar_whatsnew"]);
			water = s.kamyar_water || {};
			drawUpdate(s.kamyar_update);
			// After an update, say so once.
			if (s.kamyar_whatsnew) {
				chrome.storage.local.remove("kamyar_whatsnew");
				toast(t("updDone", { v: s.kamyar_whatsnew }), { label: t("updWhatsNew"), run: () => window.open("https://github.com/M-Mashreghi/Rubi/releases", "_blank", "noopener") });
			}
		} else drawUpdate(null);
		draw();
	});
})();
