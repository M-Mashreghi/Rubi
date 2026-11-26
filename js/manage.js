/* Turning boxes and features on and off: a small ✕ on every box (with undo), and the
 * "Boxes and features" dialog with a switch for each widget, side-bar button and extra feature. */
(function () {
	"use strict";
	const { $, el, setting, widgetOn, toast } = H;

	const widgets = () => setting("widgets", {}) || {};
	const setWidget = (w, on) => Store.setSetting("widgets", { ...widgets(), [w]: on });
	const feats = () => setting("feat", {}) || {};
	const featOn = (k) => feats()[k] !== false;
	const setFeat = (k, on) => Store.setSetting("feat", { ...feats(), [k]: on });
	H.featOn = featOn;

	// Buttons on the second side bar that can be hidden.
	const RAIL = [
		{ k: "brief", sel: "#briefBtn", label: "morningBrief", ic: "☀️" },
		{ k: "sounds", sel: "#soundsBtn", label: "wSounds", ic: "🎧" },
		{ k: "focus", sel: "#focusBtn", label: "focusMode", ic: "🎯" },
		{ k: "tr", sel: "#trBtn", label: "trTitle", ic: "🌐" },
		{ k: "ai", sel: "#railAi", label: "manageAi", ic: "✨" }
	];
	// Features kept in their own settings.
	const careCfg = () => setting("care", {}) || {};
	const FEATS = [
		{ label: "careWater", ic: "💧", get: () => careCfg().water?.on !== false, set: (on) => Store.setSetting("care", { ...careCfg(), water: { every: 60, ...(careCfg().water || {}), on } }) },
		{ label: "careEye", ic: "👀", get: () => careCfg().eye?.on !== false, set: (on) => Store.setSetting("care", { ...careCfg(), eye: { every: 20, ...(careCfg().eye || {}), on } }) },
		{ label: "seasonal", ic: "🎉", get: () => setting("seasonal", true) !== false, set: (on) => Store.setSetting("seasonal", on) },
		{ label: "smartBm", ic: "🧠", get: () => !!setting("smartBm", false), set: (on) => Store.setSetting("smartBm", on) },
		{ label: "siteFlag", ic: "🏳️", get: () => !!setting("siteFlag", false), set: (on) => setSiteFlag(on).then((ok) => !ok && draw()) }
	];
	// Site flag on the toolbar icon (off by default). Turning it on asks Chrome for the permission
	// to see which server each site comes from; the country is looked up inside the extension.
	async function setSiteFlag(on) {
		if (on) {
			const ok = await chrome.permissions.request({ permissions: ["webRequest"], origins: ["<all_urls>"] }).catch(() => false);
			if (!ok) { toast(t("siteFlagNoPerm")); return false; }
		}
		Store.setSetting("siteFlag", on);
		return true;
	}
	H.setSiteFlag = setSiteFlag;

	const ICON = { calendar: "📅", weather: "⛅", rates: "💱", prayer: "🕌", daily: "📝", tools: "🧰", habits: "✅", expenses: "💳", sounds: "🎧", alerts: "🔔", snippets: "📋", pomodoro: "🍅", focusStats: "📊", care: "💧", goals: "🎯", journal: "🙏", worldclock: "🌍", football: "⚽", trip: "⏳" };

	/* ---------- ✕ on each box ---------- */
	function hide(w) {
		setWidget(w, false);
		toast(t("boxHidden", { name: t(H.widgetLabel[w]) }), { run: () => setWidget(w, true) });
	}
	function addCloseButtons() {
		document.querySelectorAll("[data-widget]").forEach((box) => {
			if (box.querySelector(":scope > .box-x")) return;
			const w = box.dataset.widget;
			box.prepend(el("button", { class: "box-x", type: "button", title: t("boxHide"), "aria-label": t("boxHide"), onclick: (e) => { e.stopPropagation(); hide(w); } }, "✕"));
		});
	}
	// Some boxes redraw everything inside them (the countdown card does); put their ✕ back.
	let xQueued = false;
	new MutationObserver(() => {
		if (xQueued) return;
		xQueued = true;
		requestAnimationFrame(() => { xQueued = false; addCloseButtons(); });
	}).observe(document.body, { childList: true, subtree: true });
	function relabel() {
		document.querySelectorAll(".box-x").forEach((b) => { b.title = t("boxHide"); b.setAttribute("aria-label", t("boxHide")); });
	}

	/* ---------- side-bar buttons ---------- */
	function applyFeats() {
		RAIL.forEach((r) => { const n = document.querySelector(r.sel); if (n) n.hidden = !featOn(r.k); });
		const sep = document.querySelector(".rail-2 .rail-sep");
		if (sep) sep.hidden = !featOn("ai") || RAIL.slice(0, 4).every((r) => !featOn(r.k));
	}

	/* ---------- dialog ---------- */
	function sw(ic, label, on, change) {
		return el("label", { class: "manage-item" + (on ? " on" : "") },
			el("span", { class: "manage-ic" }, ic),
			el("span", { class: "manage-name" }, t(label)),
			el("input", { type: "checkbox", class: "switch", checked: on, onchange: (e) => { e.target.closest(".manage-item").classList.toggle("on", e.target.checked); change(e.target.checked); } }));
	}
	function draw() {
		$("manageWidgets").replaceChildren(...H.WIDGETS.map((w) => sw(ICON[w] || "▫️", H.widgetLabel[w], widgetOn(w), (on) => setWidget(w, on))));
		$("manageRail").replaceChildren(...RAIL.map((r) => sw(r.ic, r.label, featOn(r.k), (on) => setFeat(r.k, on))));
		$("manageFeats").replaceChildren(...FEATS.map((f) => sw(f.ic, f.label, f.get(), f.set)));
	}
	function open() {
		const s = $("settingsDialog");
		if (s?.open) s.close();
		draw();
		$("manageDialog").showModal();
	}
	H.openManage = open;
	$("manageBtn").addEventListener("click", open);
	$("manageBtnSet").addEventListener("click", open);
	$("manageAllOn").addEventListener("click", () => {
		Store.setSetting("widgets", {});
		Store.setSetting("feat", {});
		FEATS.forEach((f) => f.label !== "smartBm" && f.label !== "siteFlag" && f.set(true));
		draw();
	});
	$("manageDialog").addEventListener("click", (e) => { if (e.target.closest("[data-close]") || e.target === $("manageDialog")) $("manageDialog").close(); });

	addCloseButtons();
	applyFeats();
	H.onRefresh(() => { applyFeats(); relabel(); if ($("manageDialog").open) draw(); });
})();
