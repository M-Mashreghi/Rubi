/* Live weather scene: rain, snow, a storm, fog or drifting clouds behind the page from the real weather in the
 * chosen city, and stars, the real moon and the odd shooting star at night. It is drawn in the page on a canvas
 * behind the boxes, pauses when the tab is hidden, and can be turned off or made softer on the fun page. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	const KINDS = [["rain", "🌧️"], ["drizzle", "🌦️"], ["snow", "🌨️"], ["storm", "⛈️"], ["fog", "🌫️"], ["clouds", "☁️"], ["night", "🌙"], ["sun", "☀️"]];
	const reduce = matchMedia("(prefers-reduced-motion: reduce)");
	const cfg = () => ({ on: true, level: "soft", ...(setting("wxScene", {}) || {}) });
	const save = (p) => Store.setSetting("wxScene", { ...cfg(), ...p });

	/** The scene that fits the weather code from Open-Meteo (WMO codes) and whether it is day. */
	function kindOf(code, isDay) {
		if (code == null) return isDay ? "" : "night";
		if (code >= 95) return "storm";
		if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
		if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
		if (code >= 51 && code <= 57) return "drizzle";
		if (code === 45 || code === 48) return "fog";
		if (code === 3) return "clouds";
		if (code === 2) return isDay ? "clouds" : "night";
		return isDay ? "sun" : "night";
	}
	const nightNow = () => { const h = new Date().getHours(); return h >= 19 || h < 6; };
	function current() {
		const w = H.wx;
		if (w && w.code != null) return kindOf(w.code, w.isDay);
		return nightNow() ? "night" : "";
	}

	/* ---------- canvas ---------- */
	const cv = el("canvas", { id: "wxScene", class: "wx-scene", "aria-hidden": "true" });
	document.body.append(cv);
	const cx = cv.getContext("2d");
	let W = 0, Hh = 0, dpr = 1;
	function size() {
		dpr = Math.min(2, window.devicePixelRatio || 1);
		W = innerWidth; Hh = innerHeight;
		cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
		cx.setTransform(dpr, 0, 0, dpr, 0, 0);
		if (scene) scene = build(scene.kind);
	}
	addEventListener("resize", () => { clearTimeout(size.t); size.t = setTimeout(size, 150); });

	const rnd = (a, b) => a + Math.random() * (b - a);
	let scene = null, preview = null, raf = 0, last = 0;

	function cloudSprite(r, alpha, dark) {
		const c = document.createElement("canvas"), s = Math.ceil(r * 4);
		c.width = s; c.height = Math.ceil(r * 2.2);
		const x = c.getContext("2d");
		const puffs = [[0.28, 0.62, 0.42], [0.5, 0.45, 0.55], [0.72, 0.6, 0.4], [0.4, 0.7, 0.38], [0.62, 0.72, 0.36]];
		for (const [px, py, pr] of puffs) {
			const g = x.createRadialGradient(px * s, py * c.height, 0, px * s, py * c.height, pr * r * 1.6);
			const col = dark ? "120,128,145" : "235,240,248";
			g.addColorStop(0, `rgba(${col},${alpha})`); g.addColorStop(1, `rgba(${col},0)`);
			x.fillStyle = g; x.fillRect(0, 0, s, c.height);
		}
		return c;
	}

	function build(kind) {
		const soft = cfg().level !== "full";
		const k = soft ? 0.55 : 1;
		const area = (W * Hh) / (1440 * 900);
		const s = { kind, drops: [], flakes: [], splashes: [], clouds: [], stars: [], fog: [], flash: 0, nextFlash: performance.now() + rnd(3000, 8000), shoot: null, nextShoot: performance.now() + rnd(4000, 12000), alpha: soft ? 0.65 : 1, t: 0 };
		const wind = Math.max(-30, Math.min(30, (H.wx?.wind ?? 8) * (document.dir === "rtl" ? -1 : 1))) / 30;
		s.wind = wind;
		if (kind === "rain" || kind === "drizzle" || kind === "storm") {
			const n = Math.round((kind === "drizzle" ? 110 : kind === "storm" ? 420 : 280) * k * area);
			const speed = kind === "drizzle" ? 520 : kind === "storm" ? 1300 : 980;
			for (let i = 0; i < n; i++) s.drops.push({ x: rnd(-100, W + 100), y: rnd(-Hh, Hh), z: rnd(0.4, 1), v: speed });
		}
		if (kind === "snow") for (let i = 0; i < Math.round(170 * k * area); i++) s.flakes.push({ x: rnd(0, W), y: rnd(-Hh, Hh), z: rnd(0.3, 1), ph: rnd(0, 6.28) });
		if (kind === "clouds" || kind === "storm" || kind === "rain" || kind === "drizzle" || kind === "snow") {
			const dark = kind === "storm" || kind === "rain";
			const n = kind === "clouds" ? 7 : 5;
			for (let i = 0; i < n; i++) { const r = rnd(90, 190); s.clouds.push({ img: cloudSprite(r, kind === "clouds" ? 0.5 : 0.38, dark), x: rnd(-r * 4, W), y: rnd(-30, Hh * (kind === "clouds" ? 0.55 : 0.25)), v: rnd(6, 16) }); }
		}
		if (kind === "fog") for (let i = 0; i < 9; i++) s.fog.push({ x: rnd(0, W), y: rnd(Hh * 0.2, Hh), r: rnd(220, 420), v: rnd(5, 14) * (i % 2 ? 1 : -1) });
		if (kind === "night") {
			for (let i = 0; i < Math.round(220 * area); i++) s.stars.push({ x: rnd(0, W), y: rnd(0, Hh * 0.85), r: rnd(0.4, 1.6), ph: rnd(0, 6.28), sp: rnd(0.6, 2) });
			const m = H.moon ? H.moon() : { age: 15 };
			s.moonFrac = (m.age / 29.530588853) % 1;
		}
		return s;
	}

	function drawMoon(s) {
		// low in the sky on the start side, where the page usually has no boxes
		const r = Math.min(40, W * 0.03), x = document.dir === "rtl" ? W * 0.84 : W * 0.16, y = Hh * 0.84;
		cx.save(); cx.globalAlpha = 0.95;
		const g = cx.createRadialGradient(x, y, r * 0.6, x, y, r * 4);
		g.addColorStop(0, "rgba(255,244,214,0.20)"); g.addColorStop(1, "rgba(255,244,214,0)");
		cx.fillStyle = g; cx.beginPath(); cx.arc(x, y, r * 4, 0, 7); cx.fill();
		cx.fillStyle = "rgba(40,48,70,0.55)"; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
		// lit part: a half disc plus or minus an ellipse, by the moon's age
		const f = s.moonFrac, waxing = f < 0.5, c = Math.cos(f * 2 * Math.PI);
		cx.fillStyle = "rgba(255,246,222,0.95)";
		cx.beginPath();
		cx.arc(x, y, r, -Math.PI / 2, Math.PI / 2, !waxing);
		cx.ellipse(x, y, Math.abs(c) * r, r, 0, Math.PI / 2, -Math.PI / 2, (c > 0) === waxing);
		cx.fill();
		cx.restore();
	}

	function frame(now) {
		raf = requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - (last || now)) / 1000);
		if (now - last < 30) return; // ~30 fps is plenty
		last = now;
		const s = scene;
		if (!s) return;
		s.t += dt;
		cx.clearRect(0, 0, W, Hh);
		cx.globalAlpha = s.alpha;
		// clouds behind everything
		for (const c of s.clouds) {
			c.x += c.v * dt * (s.wind >= 0 ? 1 : -1);
			const w = c.img.width;
			if (c.x > W + 20) c.x = -w; if (c.x < -w - 20) c.x = W;
			cx.drawImage(c.img, c.x, c.y);
		}
		if (s.kind === "sun") {
			const x = document.dir === "rtl" ? W * 0.1 : W * 0.9, y = Hh * 0.08, R = Math.max(W, Hh) * 0.55;
			const g = cx.createRadialGradient(x, y, 0, x, y, R);
			g.addColorStop(0, "rgba(255,214,120,0.30)"); g.addColorStop(0.35, "rgba(255,190,90,0.10)"); g.addColorStop(1, "rgba(255,190,90,0)");
			cx.fillStyle = g; cx.fillRect(0, 0, W, Hh);
			cx.save(); cx.translate(x, y); cx.rotate(s.t * 0.03);
			for (let i = 0; i < 12; i++) { cx.rotate(Math.PI / 6); const gr = cx.createLinearGradient(0, 0, R * 0.9, 0); gr.addColorStop(0, "rgba(255,230,160,0.10)"); gr.addColorStop(1, "rgba(255,230,160,0)"); cx.fillStyle = gr; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(R * 0.9, -26); cx.lineTo(R * 0.9, 26); cx.fill(); }
			cx.restore();
		}
		if (s.kind === "night") {
			for (const st of s.stars) { const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.t * st.sp + st.ph)); cx.fillStyle = `rgba(255,255,255,${a * 0.85})`; cx.beginPath(); cx.arc(st.x, st.y, st.r, 0, 7); cx.fill(); }
			drawMoon(s);
			if (!s.shoot && now > s.nextShoot) s.shoot = { x: rnd(W * 0.2, W * 0.9), y: rnd(0, Hh * 0.35), life: 0 };
			if (s.shoot) {
				const sh = s.shoot; sh.life += dt;
				const p = sh.life / 0.9, hx = sh.x - p * 360, hy = sh.y + p * 160;
				const g = cx.createLinearGradient(hx, hy, hx + 120, hy - 54);
				g.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - p)})`); g.addColorStop(1, "rgba(255,255,255,0)");
				cx.strokeStyle = g; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(hx, hy); cx.lineTo(hx + 120, hy - 54); cx.stroke();
				if (p >= 1) { s.shoot = null; s.nextShoot = now + rnd(6000, 18000); }
			}
		}
		if (s.fog.length) for (const f of s.fog) {
			f.x += f.v * dt; if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
			const g = cx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
			g.addColorStop(0, "rgba(220,226,235,0.22)"); g.addColorStop(1, "rgba(220,226,235,0)");
			cx.fillStyle = g; cx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
		}
		if (s.drops.length) {
			const lean = s.wind * 0.35;
			cx.lineCap = "round";
			for (const d of s.drops) {
				const v = d.v * (0.6 + d.z * 0.5), len = (s.kind === "drizzle" ? 9 : 18) * d.z + 4;
				d.y += v * dt; d.x += v * lean * dt;
				if (d.y > Hh) {
					if (s.kind !== "drizzle" && Math.random() < 0.3) s.splashes.push({ x: d.x, y: Hh - rnd(0, 6), life: 0 });
					d.y = rnd(-60, -10); d.x = rnd(-100, W + 100);
				}
				cx.strokeStyle = `rgba(190,215,255,${0.25 + d.z * 0.35})`;
				cx.lineWidth = d.z * 1.3;
				cx.beginPath(); cx.moveTo(d.x, d.y); cx.lineTo(d.x - lean * len, d.y - len); cx.stroke();
			}
			for (let i = s.splashes.length - 1; i >= 0; i--) {
				const p = s.splashes[i]; p.life += dt;
				const q = p.life / 0.35;
				if (q >= 1) { s.splashes.splice(i, 1); continue; }
				cx.strokeStyle = `rgba(200,220,255,${0.5 * (1 - q)})`; cx.lineWidth = 1;
				cx.beginPath(); cx.ellipse(p.x, p.y, 2 + q * 9, 1 + q * 2.5, 0, Math.PI, 0); cx.stroke();
			}
		}
		if (s.flakes.length) for (const f of s.flakes) {
			f.y += (24 + f.z * 50) * dt; f.x += (Math.sin(s.t * 0.8 + f.ph) * 18 + s.wind * 25) * f.z * dt;
			if (f.y > Hh + 6) { f.y = -6; f.x = rnd(0, W); }
			if (f.x > W + 6) f.x = -6; if (f.x < -6) f.x = W + 6;
			cx.fillStyle = `rgba(255,255,255,${0.45 + f.z * 0.45})`;
			cx.beginPath(); cx.arc(f.x, f.y, 0.8 + f.z * 2.6, 0, 7); cx.fill();
		}
		if (s.kind === "storm") {
			if (now > s.nextFlash) { s.flash = 1; s.bolt = bolt(); s.nextFlash = now + rnd(5000, 14000); }
			if (s.flash > 0) {
				cx.fillStyle = `rgba(230,236,255,${0.28 * s.flash})`; cx.fillRect(0, 0, W, Hh);
				if (s.bolt && s.flash > 0.5) { cx.strokeStyle = `rgba(255,255,255,${s.flash})`; cx.lineWidth = 2.2; cx.beginPath(); s.bolt.forEach(([x, y], i) => (i ? cx.lineTo(x, y) : cx.moveTo(x, y))); cx.stroke(); }
				s.flash = Math.max(0, s.flash - dt * 2.6);
			}
		}
		cx.globalAlpha = 1;
	}
	function bolt() {
		let x = rnd(W * 0.15, W * 0.85), y = 0;
		const pts = [[x, y]];
		while (y < Hh * 0.6) { y += rnd(20, 50); x += rnd(-30, 30); pts.push([x, y]); }
		return pts;
	}

	/* ---------- running it ---------- */
	function apply() {
		const c = cfg();
		const kind = preview || (c.on ? current() : "");
		const run = !!kind && !document.hidden;
		cv.hidden = !kind;
		document.documentElement.dataset.wxScene = kind;
		if (!kind) { scene = null; cancelAnimationFrame(raf); raf = 0; cx.clearRect(0, 0, W, Hh); return; }
		if (!scene || scene.kind !== kind || scene.level !== c.level) { scene = build(kind); scene.level = c.level; }
		if (reduce.matches && !preview) { cancelAnimationFrame(raf); raf = 0; last = 0; frame(performance.now()); frame(performance.now() + 40); cancelAnimationFrame(raf); raf = 0; return; }
		if (run && !raf) { last = 0; raf = requestAnimationFrame(frame); }
		if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
		refreshCard();
	}
	function try_(kind) {
		preview = kind;
		clearTimeout(try_.t);
		apply();
		try_.t = setTimeout(() => { preview = null; apply(); refreshCard(); }, 12000);
		refreshCard();
	}

	/* ---------- the card ---------- */
	let body;
	function cardBody() {
		const c = cfg(), now = current(), w = H.wx;
		const sw = el("input", { type: "checkbox", class: "switch", checked: c.on, onchange: (e) => { save({ on: e.target.checked }); setTimeout(apply, 30); } });
		const label = now ? `${(KINDS.find((x) => x[0] === now) || [])[1] || ""} ${t("wxs_" + now)}` : t("wxsNone");
		return el("div", { class: "fun-wxs" },
			el("label", { class: "tog-card" }, el("span", { class: "tc-ic" }, "🌦️"), el("span", { class: "grow" }, el("strong", {}, t("wxsOn")), el("small", { class: "muted" }, w ? t("wxsNow", { city: w.city, scene: label }) : t("wxsNoCity"))), sw),
			el("div", { class: "fun-row" }, el("small", { class: "muted" }, t("wxsLevel")),
				...["soft", "full"].map((l) => el("button", { type: "button", class: "chip-s" + (c.level === l ? " on" : ""), onclick: () => { save({ level: l }); setTimeout(() => { scene = null; apply(); rebuild(); }, 30); } }, t("wxsLevel_" + l)))),
			el("div", {}, el("small", { class: "muted" }, t("wxsTry")),
				el("div", { class: "wxs-try" }, ...KINDS.map(([k, ic]) => el("button", { type: "button", class: "wxs-k" + (preview === k ? " on" : ""), title: t("wxs_" + k), onclick: () => try_(k) }, el("span", {}, ic), el("small", {}, t("wxs_" + k)))))));
	}
	function rebuild() { const nb = cardBody(); body.replaceWith(nb); body = nb; }
	function refreshCard() { if (body) rebuild(); }
	body = cardBody();
	H.funCard("wxscene", { icon: "🌦️", title: "wxsTitle", order: 68, body });

	size();
	window.addEventListener("hamyar-wx", apply);
	document.addEventListener("visibilitychange", apply);
	reduce.addEventListener?.("change", apply);
	H.onRefresh(apply);
	setInterval(() => { if (!H.wx && scene && cfg().on && !preview && current() !== scene.kind) apply(); }, 10 * 60000);
	apply();
	window.WxScene = { kindOf, current, try: try_, apply, get kind() { return scene?.kind || ""; } };
})();
