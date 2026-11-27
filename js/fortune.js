/* More fortunes for fun (fun page): a coffee-cup reading from a photo of your cup, a daily tarot card (or a
 * three-card spread) and a magic yes/no ball. The coffee reading looks at the dark shapes in the photo inside
 * this page; the photo is never uploaded or kept. All of it is entertainment. */
(function () {
	"use strict";
	const { $, el, num, toast } = H;
	const D = window.FortuneData;
	const T = () => D.text[I18n.lang] || D.text.en;
	function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

	/* ---------- tarot ---------- */
	function cardSvg(i) {
		const [rn, sym, col] = D.tarot[i], name = T().tarot[i][0];
		const w = el("div", { class: "tarot" });
		w.innerHTML = `<div class="tarot-in"><div class="tarot-face tarot-back"><svg viewBox="0 0 120 200"><rect x="2" y="2" width="116" height="196" rx="10" fill="#2b2160"/><rect x="9" y="9" width="102" height="182" rx="7" fill="none" stroke="#d9b45a" stroke-width="2"/><g fill="#d9b45a">${Array.from({ length: 12 }, (_, k) => `<circle cx="${24 + (k % 3) * 36}" cy="${30 + Math.floor(k / 3) * 46}" r="${k % 2 ? 2 : 3}"/>`).join("")}</g><path d="M60 72 L68 96 L94 100 L72 114 L80 140 L60 124 L40 140 L48 114 L26 100 L52 96 Z" fill="none" stroke="#d9b45a" stroke-width="2"/></svg></div><div class="tarot-face tarot-front"><svg viewBox="0 0 120 200"><defs><linearGradient id="tg${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="#1d1838"/></linearGradient></defs><rect x="2" y="2" width="116" height="196" rx="10" fill="url(#tg${i})"/><rect x="9" y="9" width="102" height="182" rx="7" fill="none" stroke="#e8c96b" stroke-width="2"/><circle cx="60" cy="96" r="38" fill="rgba(255,255,255,.12)" stroke="#e8c96b" stroke-width="1.5"/><text x="60" y="30" text-anchor="middle" font-size="15" font-weight="700" fill="#f6e3a1" font-family="Georgia,serif">${rn}</text><text x="60" y="110" text-anchor="middle" font-size="40">${sym}</text></svg><span class="tarot-name">${name}</span></div></div>`;
		return w;
	}
	function flip(card, delay = 0) { setTimeout(() => card.classList.add("flipped"), delay); }
	function dailyIndex() { return hash(H.dayKey() + ":tarot") % 22; }
	let spreadDlg;
	function spread() {
		if (!spreadDlg) { spreadDlg = el("dialog", { id: "tarotDialog", class: "dialog tarot-dlg" }); document.body.append(spreadDlg); }
		const pick = [];
		while (pick.length < 3) { const i = Math.floor(Math.random() * 22); if (!pick.includes(i)) pick.push(i); }
		const cards = pick.map((i) => cardSvg(i));
		const pos = ["frPast", "frPresent", "frFuture"];
		spreadDlg.replaceChildren(el("div", { class: "dialog-body" },
			el("div", { class: "fun-row" }, el("h3", { class: "grow" }, "🃏 " + t("frSpread")), el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => spreadDlg.close() }, "✕")),
			el("div", { class: "tarot-row" }, ...cards.map((c, k) => el("div", { class: "tarot-slot" }, el("small", { class: "muted" }, t(pos[k])), c, el("p", { class: "tarot-mean" }, el("b", {}, T().tarot[pick[k]][0]), el("br"), T().tarot[pick[k]][1])))),
			el("small", { class: "muted" }, t("frFunOnly")),
			el("div", { class: "dialog-actions" }, el("span"), el("button", { type: "button", class: "btn", onclick: spread }, "🔄 " + t("frAgain")))));
		if (!spreadDlg.open) spreadDlg.showModal();
		cards.forEach((c, k) => flip(c, 350 + k * 450));
		setTimeout(() => spreadDlg.querySelectorAll(".tarot-mean").forEach((m) => m.classList.add("in")), 1700);
		H.bump("tarot");
	}

	/* ---------- coffee cup ---------- */
	/** Find the dark shapes (the coffee grounds) inside the cup in the photo. */
	function readCup(img) {
		const N = 120, cv = document.createElement("canvas");
		cv.width = cv.height = N;
		const cx = cv.getContext("2d", { willReadFrequently: true });
		const s = Math.min(img.naturalWidth, img.naturalHeight);
		cx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, N, N);
		const px = cx.getImageData(0, 0, N, N).data;
		const g = new Float32Array(N * N), inside = new Uint8Array(N * N);
		let sum = 0, sq = 0, n = 0;
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
			const i = y * N + x, dx = x - N / 2, dy = y - N / 2;
			if (dx * dx + dy * dy > (N * 0.47) ** 2) continue;
			inside[i] = 1;
			const v = 0.3 * px[i * 4] + 0.59 * px[i * 4 + 1] + 0.11 * px[i * 4 + 2];
			g[i] = v; sum += v; sq += v * v; n++;
		}
		const mean = sum / n, sd = Math.sqrt(Math.max(1, sq / n - mean * mean));
		const thr = mean - 0.55 * sd;
		const dark = new Uint8Array(N * N);
		let darkN = 0;
		for (let i = 0; i < N * N; i++) if (inside[i] && g[i] < thr) { dark[i] = 1; darkN++; }
		// connected shapes
		const seen = new Uint8Array(N * N), blobs = [];
		for (let i = 0; i < N * N; i++) {
			if (!dark[i] || seen[i]) continue;
			let size = 0, sx = 0, sy = 0;
			const st = [i]; seen[i] = 1;
			while (st.length) {
				const j = st.pop(), x = j % N, y = (j / N) | 0;
				size++; sx += x; sy += y;
				for (const k of [j - 1, j + 1, j - N, j + N]) if (k >= 0 && k < N * N && dark[k] && !seen[k] && Math.abs((k % N) - x) <= 1) { seen[k] = 1; st.push(k); }
			}
			if (size >= 10) blobs.push({ size, x: sx / size / N, y: sy / size / N });
		}
		blobs.sort((a, b) => b.size - a.size);
		const seed = hash(Math.round(mean) + ":" + darkN + ":" + blobs.length);
		const picks = blobs.slice(0, 3);
		// A clean cup still gets a reading, from spots chosen by the photo itself.
		for (let k = picks.length; k < 3; k++) { const a = ((seed >> (k * 5)) % 360) * (Math.PI / 180), r = [0.38, 0.22, 0.08][k]; picks.push({ size: 0, x: 0.5 + Math.cos(a) * r, y: 0.5 + Math.sin(a) * r }); }
		const used = new Set();
		return {
			heavy: darkN / n > 0.22,
			marks: picks.map((b, k) => {
				let sym = hash(seed + ":" + k + ":" + Math.round(b.x * 50) + ":" + Math.round(b.y * 50)) % D.coffee.length;
				while (used.has(sym)) sym = (sym + 1) % D.coffee.length;
				used.add(sym);
				const r = Math.hypot(b.x - 0.5, b.y - 0.5) / 0.47;
				return { x: b.x, y: b.y, sym, zone: r > 0.62 ? 0 : r > 0.3 ? 1 : 2 };
			}).sort((a, b) => a.zone - b.zone),
		};
	}
	let cupDlg;
	function coffee(file) {
		if (!file || !/^image\//.test(file.type)) return toast(t("frBadImage"));
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			if (!cupDlg) { cupDlg = el("dialog", { id: "coffeeDialog", class: "dialog coffee-dlg" }); document.body.append(cupDlg); cupDlg.addEventListener("close", () => URL.revokeObjectURL(cupDlg.dataset.url || "")); }
			cupDlg.dataset.url = url;
			const r = readCup(img);
			const photo = el("div", { class: "cup-photo" }, el("img", { src: url, alt: "" }), el("div", { class: "cup-steam" }, el("span"), el("span"), el("span")));
			r.marks.forEach((m, k) => {
				const mk = el("span", { class: "cup-mark", style: `left:${m.x * 100}%;top:${m.y * 100}%;animation-delay:${2 + k * 0.5}s` }, D.coffee[m.sym]);
				photo.append(mk);
			});
			const reading = el("div", { class: "cup-reading" },
				el("p", { class: "cup-intro" }, t(r.heavy ? "frCupHeavy" : "frCupLight")),
				el("ul", { class: "cup-list" }, ...r.marks.map((m, k) => el("li", { style: `animation-delay:${2.1 + k * 0.5}s` }, el("span", { class: "cup-sym" }, D.coffee[m.sym]),
					el("div", {}, el("b", {}, T().coffee[m.sym][0]), el("small", { class: "muted" }, " · " + T().zones[m.zone]), el("div", {}, T().coffee[m.sym][1]))))),
				el("small", { class: "muted" }, "🔒 " + t("frCupPrivate") + " " + t("frFunOnly")));
			cupDlg.replaceChildren(el("div", { class: "dialog-body" },
				el("div", { class: "fun-row" }, el("h3", { class: "grow" }, "☕ " + t("frCoffee")), el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => cupDlg.close() }, "✕")),
				el("div", { class: "cup-wrap" }, photo, reading),
				el("p", { class: "cup-wait muted" }, t("frReading"))));
			if (!cupDlg.open) cupDlg.showModal();
			setTimeout(() => cupDlg.querySelector(".cup-wait")?.remove(), 2000);
			H.bump("coffee");
		};
		img.onerror = () => { URL.revokeObjectURL(url); toast(t("frBadImage")); };
		img.src = url;
	}

	/* ---------- magic ball ---------- */
	function ballEl() {
		const b = el("div", { class: "ball", role: "button", tabindex: "0", "aria-label": t("frBall") });
		b.innerHTML = '<svg viewBox="0 0 120 120"><defs><radialGradient id="bg8" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#5a5f78"/><stop offset=".45" stop-color="#1a1c29"/><stop offset="1" stop-color="#05060a"/></radialGradient></defs><circle cx="60" cy="60" r="56" fill="url(#bg8)"/><ellipse cx="44" cy="34" rx="16" ry="9" fill="rgba(255,255,255,.18)" transform="rotate(-30 44 34)"/><circle class="ball-win" cx="60" cy="62" r="27" fill="#101433"/><path class="ball-tri" d="M60 40 L82 76 L38 76 Z" fill="#3b4fd8"/><text class="ball-8" x="60" y="72" text-anchor="middle" font-size="26" font-weight="800" fill="#fff" font-family="Arial">8</text></svg><div class="ball-ans"></div>';
		return b;
	}
	function shake(ball, q) {
		if (ball.classList.contains("shaking")) return;
		const ans = ball.querySelector(".ball-ans");
		ans.classList.remove("in"); ball.classList.remove("answered");
		ball.classList.add("shaking");
		setTimeout(() => {
			ball.classList.remove("shaking"); ball.classList.add("answered");
			const list = T().ball;
			ans.textContent = list[Math.floor(Math.random() * list.length)];
			ans.classList.add("in");
			H.bump("ball");
		}, 1100);
	}

	/* ---------- the card ---------- */
	let tab = "tarot";
	function cardBody() {
		const body = el("div", { class: "fun-fortune" });
		const tabs = el("div", { class: "g-tabs" }, ...[["tarot", "🃏", "frTarot"], ["coffee", "☕", "frCoffee"], ["ball", "🎱", "frBall"], ["hafez", "📜", "frHafez"]].map(([id, ic, k]) =>
			el("button", { type: "button", class: tab === id ? "active" : "", onclick: () => { if (id === "hafez") return H.openFal?.(); tab = id; rebuild(); } }, ic + " " + t(k))));
		const pane = el("div", { class: "fr-pane" });
		if (tab === "tarot") {
			const i = dailyIndex(), c = cardSvg(i);
			c.addEventListener("click", () => c.classList.add("flipped"));
			const mean = el("div", { class: "tarot-mean in" }, el("small", { class: "muted" }, t("frDaily")), el("strong", { style: "display:block" }, T().tarot[i][0]), T().tarot[i][1]);
			pane.append(el("div", { class: "fr-tarot" }, c, mean), el("div", { class: "fun-row" }, el("button", { type: "button", class: "btn small", onclick: spread }, "🃏 " + t("frSpread"))));
			flip(c, 500);
		} else if (tab === "coffee") {
			const input = el("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => { coffee(e.target.files[0]); e.target.value = ""; } });
			const cup = el("div", { class: "cup-hero", "aria-hidden": "true" }, "☕");
			pane.append(cup, el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("frCoffeeHint")),
				el("div", { class: "fun-row" }, el("button", { type: "button", class: "btn small", onclick: () => input.click() }, "📷 " + t("frCupPhoto")), input));
		} else {
			const q = el("input", { type: "text", class: "ball-q", maxlength: "120", placeholder: t("frAsk") });
			const ball = ballEl();
			const go = () => shake(ball, q.value);
			ball.addEventListener("click", go);
			ball.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
			q.addEventListener("keydown", (e) => e.key === "Enter" && go());
			pane.append(q, ball, el("small", { class: "muted" }, t("frBallHint")));
		}
		body.append(tabs, pane);
		return body;
	}
	let body = cardBody();
	H.funCard("fortune", { icon: "🔮", title: "frTitle", order: 22, body });
	function rebuild() { const nb = cardBody(); body.replaceWith(nb); body = nb; }
	let lang = I18n.lang;
	H.onRefresh(() => { if (I18n.lang !== lang) { lang = I18n.lang; rebuild(); } });
	window.Fortune = { readCup, spread, coffee, dailyIndex, cardSvg };
})();
