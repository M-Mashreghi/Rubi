/* Rubi fun page (rail ▸ 🎈): a grid of cards that the fun modules fill in (today in history, saying of the day,
 * celebrations, badges, break games, sky and horoscope, virtual pet, voice changer). Also a few helpers they share. */
(function () {
	"use strict";
	const { $, el } = H;
	const cards = [];
	/** Add a card to the fun page. body: an element; order: smaller comes first. Returns the card element. */
	function funCard(id, { icon, title, order = 50, body, actions, wide }) {
		const head = el("div", { class: "panel-head fun-head" }, el("h2", {}, el("span", { class: "fun-ic", "aria-hidden": "true" }, icon), " ", el("span", { "data-i18n": title }, t(title))), el("span", { class: "grow" }), ...(actions || []));
		const card = el("section", { class: "panel fun-card" + (wide ? " wide" : ""), id: "fun-" + id, "data-fun": id }, head, body);
		card.style.order = order;
		cards.push(card);
		$("funGrid").append(card);
		return card;
	}
	/** Use H.dayKey everywhere for the local date as yyyy-mm-dd. */
	const pad = (n) => String(n).padStart(2, "0");
	const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	/** Persian calendar parts of a date, with latin digits. */
	const jparts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, parseInt(x.value, 10)]));
	/** Small counters kept in the synced settings (fal count, games played, …). */
	const stats = () => H.setting("funStats", {}) || {};
	function bump(k, by = 1) {
		const s = stats();
		Store.setSetting("funStats", { ...s, [k]: (s[k] || 0) + by });
		window.dispatchEvent(new CustomEvent("rubi-stat", { detail: { k } }));
	}
	function setMax(k, v) {
		const s = stats();
		if ((s[k] || 0) >= v) return;
		Store.setSetting("funStats", { ...s, [k]: v });
		window.dispatchEvent(new CustomEvent("rubi-stat", { detail: { k } }));
	}
	/** Save a canvas as a PNG file. */
	function savePng(canvas, name) {
		canvas.toBlob((b) => {
			const a = el("a", { href: URL.createObjectURL(b), download: name });
			document.body.append(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(a.href), 4000);
		}, "image/png");
	}
	/** Copy a canvas to the clipboard as an image. */
	async function copyPng(canvas) {
		const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
		await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
	}
	/** Share a canvas with the system share sheet when there is one; otherwise save it. */
	async function sharePng(canvas, name, text) {
		const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
		const file = new File([blob], name, { type: "image/png" });
		if (navigator.canShare && navigator.canShare({ files: [file] })) {
			try { await navigator.share({ files: [file], text }); return true; } catch (e) { if (e && e.name === "AbortError") return true; }
		}
		savePng(canvas, name);
		return false;
	}
	/** Wrap text onto lines that fit a width on a canvas. */
	function wrap(cx, text, maxW) {
		const words = String(text).split(/\s+/), lines = [];
		let line = "";
		for (const w of words) {
			const test = line ? line + " " + w : w;
			if (cx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
		}
		if (line) lines.push(line);
		return lines;
	}
	/** Font family of the page, for drawing on canvases. */
	const pageFont = () => getComputedStyle(document.body).fontFamily || "Vazirmatn, sans-serif";

	Object.assign(H, { funCard, dayKey, jparts, funStats: stats, bump, setMax, savePng, copyPng, sharePng, wrapText: wrap, pageFont });
})();
