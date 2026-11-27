/* Saying of the day: a Persian proverb or a famous couplet with its meaning, a new one every day, and a
 * story-sized picture of it (1080×1920) to save, copy or share. The picture is drawn on a canvas in the page. */
(function () {
	"use strict";
	const { $, el, setting, toast } = H;
	const S = window.SayingsData;
	const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };
	const dayNo = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
	let shift = 0;
	// Spread the list over the days so proverbs and couplets take turns.
	const order = S.map((_, i) => i).sort((a, b) => ((a * 37) % S.length) - ((b * 37) % S.length));
	const today = () => S[order[(((dayNo() + shift) % S.length) + S.length) % S.length]];
	const fa = () => I18n.lang === "fa";
	const halves = (s) => s[1].split(" / ");

	function textEl(s, big) {
		const h = halves(s);
		return el("div", { class: "say-text" + (big ? " big" : ""), dir: "rtl", lang: "fa" },
			h.length > 1 ? el("div", { class: "beyt" }, el("span", {}, h[0]), el("span", {}, h[1])) : el("p", { class: "say-one" }, h[0]),
			el("p", { class: "say-by" }, "— " + (s[2] || t(s[0] === "p" ? "sayProverb" : "sayAnon"))));
	}
	function meaningEl(s) {
		return el("p", { class: "say-meaning", dir: "auto" }, el("strong", {}, t("sayMeaning") + " "), fa() ? s[3] : s[4]);
	}
	function view(big) {
		const s = today();
		return [
			textEl(s, big),
			meaningEl(s),
			el("div", { class: "say-actions" },
				el("button", { type: "button", class: big ? "btn" : "chip", onclick: () => openStory(s) }, "📸 " + t("sayStory")),
				el("button", { type: "button", class: "chip", onclick: () => copy(s) }, "📋 " + t("sayCopy")),
				big ? el("button", { type: "button", class: "chip", onclick: () => { shift++; draw(); } }, "↻ " + t("another")) : "")
		];
	}
	H.sayingView = () => view(false);
	H.sayingNext = () => { shift++; };
	function copy(s) {
		const txt = `${s[1].replace(" / ", "\n")}\n— ${s[2] || t(s[0] === "p" ? "sayProverb" : "sayAnon")}\n\n${t("sayMeaning")} ${fa() ? s[3] : s[4]}`;
		navigator.clipboard.writeText(txt).then(() => toast(t("copied")), () => {});
	}

	/* ---------- story picture ---------- */
	const STYLES = [
		{ id: "dusk", bg: ["#3b0764", "#be185d", "#f59e0b"], ink: "#fff", soft: "rgba(255,255,255,.82)" },
		{ id: "turquoise", bg: ["#042f2e", "#0f766e", "#2dd4bf"], ink: "#fff", soft: "rgba(255,255,255,.85)" },
		{ id: "night", bg: ["#020617", "#1e1b4b", "#312e81"], ink: "#fde68a", soft: "rgba(255,255,255,.82)", stars: true },
		{ id: "paper", bg: ["#fdf6e3", "#f5e6c8", "#ead7b0"], ink: "#3f2d1c", soft: "rgba(63,45,28,.78)", paper: true },
		{ id: "rose", bg: ["#fff1f2", "#fecdd3", "#fda4af"], ink: "#4c0519", soft: "rgba(76,5,25,.75)" },
		{ id: "forest", bg: ["#052e16", "#166534", "#65a30d"], ink: "#fff", soft: "rgba(255,255,255,.85)" }
	];
	const FONTS = [["Vazirmatn", "وزیرمتن"], ["Parastoo", "پرستو"], ["Sahel", "ساحل"], ["Shabnam", "شبنم"]];
	let style = STYLES.find((x) => x.id === ls("rubi_story_style")) || STYLES[0];
	let font = ls("rubi_story_font") || "Parastoo";
	let withMeaning = ls("rubi_story_meaning") !== "0";
	let cur = null;

	function star(cx, x, y, r, n = 8) {
		cx.beginPath();
		for (let i = 0; i < n * 2; i++) {
			const a = (i * Math.PI) / n, rr = i % 2 ? r * 0.55 : r;
			cx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
		}
		cx.closePath();
	}
	async function paint(cv, s) {
		const W = 1080, Hh = 1920;
		cv.width = W; cv.height = Hh;
		const cx = cv.getContext("2d");
		try { await Promise.all([document.fonts.load(`700 60px "${font}"`), document.fonts.load(`400 40px "Vazirmatn"`), document.fonts.load(`700 40px "Vazirmatn"`)]); } catch {}
		// background
		const g = cx.createLinearGradient(0, 0, W * 0.4, Hh);
		g.addColorStop(0, style.bg[0]); g.addColorStop(0.55, style.bg[1]); g.addColorStop(1, style.bg[2]);
		cx.fillStyle = g; cx.fillRect(0, 0, W, Hh);
		// soft glows
		for (const [x, y, r, a] of [[W * 0.85, Hh * 0.12, 420, 0.18], [W * 0.1, Hh * 0.78, 520, 0.14], [W * 0.5, Hh * 0.5, 700, 0.06]]) {
			const rg = cx.createRadialGradient(x, y, 0, x, y, r);
			rg.addColorStop(0, `rgba(255,255,255,${a})`); rg.addColorStop(1, "rgba(255,255,255,0)");
			cx.fillStyle = rg; cx.fillRect(0, 0, W, Hh);
		}
		if (style.stars) for (let i = 0; i < 90; i++) { cx.fillStyle = `rgba(255,255,255,${0.25 + ((i * 37) % 60) / 100})`; cx.beginPath(); cx.arc((i * 211) % W, (i * 389) % Hh, 1 + (i % 3), 0, 6.28); cx.fill(); }
		if (style.paper) for (let i = 0; i < 1400; i++) { cx.fillStyle = `rgba(120,90,50,${((i * 13) % 7) / 200})`; cx.fillRect((i * 733) % W, (i * 397) % Hh, 2, 2); }
		// girih stars in the corners
		cx.strokeStyle = style.soft.replace(/[\d.]+\)$/, "0.22)");
		cx.lineWidth = 3;
		for (const [x, y, r] of [[120, 160, 70], [W - 120, Hh - 200, 90], [W - 170, 250, 34], [150, Hh - 330, 40]]) { star(cx, x, y, r); cx.stroke(); star(cx, x, y, r * 0.45); cx.stroke(); }
		// frame
		cx.strokeStyle = style.soft.replace(/[\d.]+\)$/, "0.35)");
		cx.lineWidth = 2;
		cx.strokeRect(60, 60, W - 120, Hh - 120);
		cx.strokeRect(74, 74, W - 148, Hh - 148);
		cx.direction = "rtl";
		cx.textAlign = "center";
		cx.textBaseline = "middle";
		// heading
		const jd = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
		cx.fillStyle = style.soft;
		cx.font = `700 40px Vazirmatn`;
		cx.fillText(s[0] === "p" ? "ضرب‌المثل روز" : "شعر روز", W / 2, 250);
		cx.font = `400 32px Vazirmatn`;
		cx.fillText(jd, W / 2, 305);
		// main text
		const parts = halves(s);
		cx.fillStyle = style.ink;
		let size = 76;
		const maxW = W - 220;
		let lines;
		for (;;) {
			cx.font = `700 ${size}px "${font}", Vazirmatn`;
			lines = parts.flatMap((p) => H.wrapText(cx, p, maxW));
			if ((lines.length * size * 1.75 < 760 && lines.every((l) => cx.measureText(l).width <= maxW)) || size <= 44) break;
			size -= 4;
		}
		const lh = size * 1.75;
		const meaningLines = [];
		const mText = fa() ? s[3] : s[4];
		if (withMeaning) { cx.font = `400 38px Vazirmatn`; cx.direction = fa() ? "rtl" : "ltr"; meaningLines.push(...H.wrapText(cx, mText, W - 260)); cx.direction = "rtl"; }
		const blockH = lines.length * lh + 120 + (withMeaning ? 110 + meaningLines.length * 62 : 0);
		let y = Math.max(420, (Hh - blockH) / 2 + 40);
		cx.font = `700 ${size}px "${font}", Vazirmatn`;
		cx.shadowColor = "rgba(0,0,0,.18)"; cx.shadowBlur = 18; cx.shadowOffsetY = 4;
		lines.forEach((l, i) => cx.fillText(l, W / 2, y + i * lh + lh / 2));
		cx.shadowColor = "transparent";
		y += lines.length * lh + 50;
		cx.fillStyle = style.soft;
		cx.font = `400 40px Vazirmatn`;
		cx.fillText("— " + (s[2] || (s[0] === "p" ? "ضرب‌المثل" : "")).trim(), W / 2, y + 20);
		y += 90;
		if (withMeaning) {
			// little ornament
			cx.strokeStyle = style.soft; cx.lineWidth = 2;
			cx.beginPath(); cx.moveTo(W / 2 - 160, y); cx.lineTo(W / 2 - 30, y); cx.moveTo(W / 2 + 30, y); cx.lineTo(W / 2 + 160, y); cx.stroke();
			star(cx, W / 2, y, 14); cx.fillStyle = style.soft; cx.fill();
			y += 70;
			cx.font = `400 38px Vazirmatn`;
			cx.direction = fa() ? "rtl" : "ltr";
			meaningLines.forEach((l, i) => cx.fillText(l, W / 2, y + i * 62));
			cx.direction = "rtl";
		}
		// footer with the Rubi logo
		const logo = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = "icons/icon-128.png"; });
		cx.font = `700 34px Vazirmatn`;
		cx.fillStyle = style.soft;
		const label = "روبی · Rubi";
		const lw = cx.measureText(label).width;
		if (logo) cx.drawImage(logo, W / 2 - lw / 2 - 74, Hh - 210, 56, 56);
		cx.fillText(label, W / 2 + 34, Hh - 182);
	}
	function dlg() {
		let d = $("storyDialog");
		if (d) return d;
		d = el("dialog", { id: "storyDialog", class: "dialog story-dlg" },
			el("div", { class: "dialog-body" },
				el("div", { class: "page-head" }, el("h3", {}, "📸 " + t("sayStoryTitle")), el("span", { class: "grow" }), el("button", { class: "icon-btn small", type: "button", title: t("close"), onclick: () => d.close() }, "✕")),
				el("div", { class: "story-wrap" },
					el("canvas", { id: "storyCanvas", class: "story-canvas", width: "1080", height: "1920" }),
					el("div", { class: "story-side" },
						el("h4", {}, t("sayStyle")), el("div", { id: "storyStyles", class: "story-styles" }),
						el("h4", {}, t("sayFont")), el("div", { id: "storyFonts", class: "story-fonts" }),
						el("label", { class: "check small" }, el("input", { type: "checkbox", id: "storyMeaning", onchange: (e) => { withMeaning = e.target.checked; ls("rubi_story_meaning", withMeaning ? "1" : "0"); render(); } }), " ", t("sayWithMeaning")),
						el("p", { class: "muted small" }, t("sayStoryHint")),
						el("div", { class: "story-btns" },
							el("button", { class: "btn", type: "button", onclick: () => { H.sharePng($("storyCanvas"), "rubi-saying.png", cur?.[1]).then(() => H.bump?.("story")); } }, "📤 " + t("sayShare")),
							el("button", { class: "btn btn-ghost", type: "button", onclick: () => { H.savePng($("storyCanvas"), "rubi-saying.png"); H.bump?.("story"); } }, "⬇️ " + t("saySave")),
							el("button", { class: "btn btn-ghost", type: "button", onclick: () => H.copyPng($("storyCanvas")).then(() => toast(t("sayCopiedImg")), () => toast(t("loadFail"))) }, "📋 " + t("sayCopyImg")))))));
		d.addEventListener("click", (e) => e.target === d && d.close());
		document.body.append(d);
		return d;
	}
	function render() {
		$("storyStyles").replaceChildren(...STYLES.map((x) => el("button", { type: "button", class: "story-sw" + (x === style ? " on" : ""), title: x.id, style: `background:linear-gradient(160deg,${x.bg.join(",")})`, onclick: () => { style = x; ls("rubi_story_style", x.id); render(); } })));
		$("storyFonts").replaceChildren(...FONTS.map(([f, label]) => el("button", { type: "button", class: "chip" + (f === font ? " on" : ""), style: `font-family:"${f}"`, onclick: () => { font = f; ls("rubi_story_font", f); render(); } }, label)));
		$("storyMeaning").checked = withMeaning;
		paint($("storyCanvas"), cur);
	}
	function openStory(s) {
		cur = s || today();
		const d = dlg();
		render();
		if (!d.open) d.showModal();
	}
	H.openStory = openStory;

	/* ---------- fun page card ---------- */
	const body = el("div", { class: "fun-say" });
	function draw() { body.replaceChildren(...view(true)); }
	H.funCard("saying", { icon: "🪶", title: "sayTitle", order: 20, body });
	draw();
	let lang = I18n.lang;
	H.onRefresh(() => { if (lang !== I18n.lang) { lang = I18n.lang; draw(); $("storyDialog")?.remove(); } });
	if (document.querySelector(".daily-tab.active")?.dataset.daily === "saying") document.querySelector('.daily-tab[data-daily="saying"]').click();
})();
