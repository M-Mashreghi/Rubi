/* Themes and wallpaper. Loaded in <head> before first paint, so it must not touch <body>.
 * A theme is a palette; "auto", "light" and "dark" use the stylesheet's own tokens.
 * The wallpaper image is kept per device (localStorage); the theme choice syncs with the rest of the data. */
(function () {
	"use strict";
	// [id, dark?, bg, glow1, glow2, surface, surface2, border, text, muted, accent, accentInk, names fa|en|fr|de]
	const RAW = [
		["auto", null, "", "", "", "", "", "", "", "", "#3f75ff", "", "خودکار (مثل سیستم)|Automatic (system)|Automatique (système)|Automatisch (System)"],
		["daynight", null, "", "", "", "", "", "", "", "", "#3f75ff", "", "روز و شب (با ساعت)|Day & night (by time)|Jour et nuit (selon l'heure)|Tag & Nacht (nach Uhrzeit)"],
		["light", 0, "#d6eaf8", "#f2f9ff", "#b9daf2", "#ffffff", "#eef3f8", "#dde6ef", "#1c2333", "#6b7489", "#3f75ff", "#ffffff", "روشن|Light|Clair|Hell"],
		["dark", 1, "#061a36", "#0e3a78", "#04243f", "#1f1f23", "#2b2c31", "#34353b", "#ececef", "#9b9ca5", "#3f75ff", "#ffffff", "تیره|Dark|Sombre|Dunkel"],
		["turquoise", 0, "#eef8f8", "#c9eeee", "#dff1fb", "#ffffff", "#e8f4f4", "#d3e6e6", "#15302f", "#5b7a79", "#0e9a9a", "#ffffff", "فیروزه‌ای|Turquoise|Turquoise|Türkis"],
		["ocean", 0, "#eef4fb", "#cfe0ff", "#d4f0f7", "#ffffff", "#e9f0f9", "#d6e1ef", "#14243a", "#5c6d85", "#1f6fd1", "#ffffff", "اقیانوس|Ocean|Océan|Ozean"],
		["sky", 0, "#f1f7fe", "#d6ecff", "#fff2d9", "#ffffff", "#eaf3fc", "#d9e7f5", "#1a2a3c", "#62748a", "#2b8ad8", "#ffffff", "آسمان|Sky|Ciel|Himmel"],
		["forest", 0, "#f1f6f0", "#d5ead0", "#ecf3d8", "#ffffff", "#ebf2e9", "#d9e6d6", "#1b2b1d", "#5f7461", "#2f8a4a", "#ffffff", "جنگل|Forest|Forêt|Wald"],
		["mint", 0, "#effaf5", "#c8f2de", "#dff7f1", "#ffffff", "#e6f6ef", "#d0ebdf", "#143226", "#5a7d6f", "#12a37a", "#ffffff", "نعنایی|Mint|Menthe|Minze"],
		["sunset", 0, "#fff5f0", "#ffd9c7", "#ffe1ec", "#ffffff", "#fbefe9", "#f1ddd3", "#3a1f17", "#86685d", "#e0602f", "#ffffff", "غروب|Sunset|Coucher de soleil|Sonnenuntergang"],
		["saffron", 0, "#fffaee", "#ffe9b0", "#ffe3cc", "#ffffff", "#faf3e0", "#efe3c4", "#33270c", "#7e7050", "#c98a00", "#ffffff", "زعفرانی|Saffron|Safran|Safran"],
		["rose", 0, "#fff3f6", "#ffd3e0", "#f4dcff", "#ffffff", "#fbeaf0", "#f1d6e0", "#3a1726", "#86607a", "#d63a75", "#ffffff", "گل‌سرخ|Rose|Rose|Rosé"],
		["lavender", 0, "#f6f3fe", "#e2d8ff", "#dce8ff", "#ffffff", "#efebfb", "#e0d9f3", "#251d3c", "#6d6587", "#7650d8", "#ffffff", "اسطوخودوس|Lavender|Lavande|Lavendel"],
		["sand", 0, "#f8f3ea", "#efe1c6", "#e9eedd", "#fffdf8", "#f2ebdf", "#e5dac7", "#2e271c", "#7a6f5d", "#a8742f", "#ffffff", "کویر|Desert sand|Sable|Wüstensand"],
		["coffee", 0, "#f5efe9", "#e6d3c3", "#efe4d7", "#fffaf5", "#efe5dc", "#e2d4c7", "#2f2219", "#7b6a5d", "#8a5a3a", "#ffffff", "قهوه|Coffee|Café|Kaffee"],
		["paper", 0, "#f6f4ef", "#f6f4ef", "#f6f4ef", "#fffefb", "#efece4", "#e3dfd3", "#262420", "#77736a", "#444038", "#ffffff", "کاغذی|Paper|Papier|Papier"],
		["midnight", 1, "#0b1020", "#1a2552", "#22133d", "#131a2e", "#1b2440", "#26304d", "#e6eaf7", "#8d97b5", "#7c9bff", "#0b1020", "نیمه‌شب|Midnight|Minuit|Mitternacht"],
		["frost", 1, "#20252f", "#2c3646", "#26323a", "#2a303c", "#323a48", "#3b4454", "#e5e9f0", "#9aa3b3", "#88c0d0", "#1d232c", "شب قطبی|Polar night|Nuit polaire|Polarnacht"],
		["deepsea", 1, "#081a1d", "#0d3b40", "#0a2533", "#0f2428", "#163136", "#1f3d42", "#dff4f3", "#86a8a7", "#2ec4b6", "#062022", "اعماق دریا|Deep sea|Abysses|Tiefsee"],
		["emerald", 1, "#0c1712", "#14382a", "#1b2f17", "#132019", "#1b2c23", "#24382d", "#e2f2e8", "#8eab99", "#3ccf86", "#08140d", "زمرد|Emerald night|Nuit d'émeraude|Smaragdnacht"],
		["grape", 1, "#160f22", "#34195a", "#3a1438", "#1f1630", "#2a1f40", "#352850", "#efe7fb", "#a497bb", "#b388ff", "#160f22", "انگوری|Grape|Raisin|Traube"],
		["dusk", 1, "#1a1222", "#4a1f45", "#2a1d4f", "#24182f", "#2f213c", "#3b2b4a", "#f4e8f2", "#ae9bb0", "#ff7eb6", "#1a1222", "شفق|Dusk|Crépuscule|Dämmerung"],
		["ember", 1, "#1a0f0d", "#4a1c12", "#3b2a10", "#241614", "#311e1b", "#3f2824", "#f7e7e2", "#b39a93", "#ff7a45", "#1a0f0d", "اخگر|Ember|Braise|Glut"],
		["mocha", 1, "#17120f", "#3a2a1e", "#2a2219", "#211a16", "#2c231e", "#382d27", "#f1e6dc", "#ab9d91", "#d9a066", "#17120f", "موکا|Mocha|Moka|Mokka"],
		["graphite", 1, "#141516", "#26292d", "#1f2326", "#1c1d1f", "#26282b", "#323539", "#e8e9eb", "#9a9da3", "#a3b3c7", "#141516", "گرافیت|Graphite|Graphite|Graphit"],
		["black", 1, "#000000", "#000000", "#000000", "#0d0d0d", "#181818", "#262626", "#f2f2f2", "#9a9a9a", "#4f8cff", "#000000", "سیاه مطلق|Pure black|Noir absolu|Tiefschwarz"],
	];
	const LANGS = ["fa", "en", "fr", "de"];
	const list = RAW.map((r) => {
		const names = {};
		r[12].split("|").forEach((n, i) => (names[LANGS[i]] = n));
		return { id: r[0], dark: r[1], bg: r[2], g1: r[3], g2: r[4], surface: r[5], s2: r[6], border: r[7], text: r[8], muted: r[9], accent: r[10], ink: r[11], names };
	});
	const byId = Object.fromEntries(list.map((t) => [t.id, t]));
	const VARS = ["--bg", "--bg-grad", "--surface", "--surface-2", "--border", "--text", "--muted", "--accent", "--accent-ink"];

	function ls(k, v) {
		try {
			if (v === undefined) return localStorage.getItem(k);
			if (v === null) localStorage.removeItem(k);
			else localStorage.setItem(k, v);
		} catch (e) {
			return null;
		}
	}
	// Black or white text, whichever reads better on the colour.
	function inkFor(hex) {
		const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
		if (!m) return "#ffffff";
		const n = parseInt(m[1], 16);
		const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return lum > 0.6 ? "#111111" : "#ffffff";
	}

	/** Applies theme id, optional custom accent colour, and the device wallpaper. */
	const isDay = () => {
		const h = new Date().getHours();
		return h >= 7 && h < 19;
	};
	function apply(id, accent) {
		const root = document.documentElement;
		const saved = byId[id] || byId.auto;
		const th = saved.id === "daynight" ? byId[isDay() ? "light" : "dark"] : saved;
		VARS.forEach((v) => root.style.removeProperty(v));
		if (th.id === "auto") root.removeAttribute("data-theme");
		else root.setAttribute("data-theme", th.dark ? "dark" : "light");
		if (th.bg) {
			const s = root.style;
			s.setProperty("--bg", th.bg);
			s.setProperty("--bg-grad", "radial-gradient(1200px 600px at 85% -10%, " + th.g1 + " 0%, transparent 60%), radial-gradient(900px 500px at -10% 110%, " + th.g2 + " 0%, transparent 60%)");
			s.setProperty("--surface", th.surface);
			s.setProperty("--surface-2", th.s2);
			s.setProperty("--border", th.border);
			s.setProperty("--text", th.text);
			s.setProperty("--muted", th.muted);
			s.setProperty("--accent", th.accent);
			s.setProperty("--accent-ink", th.ink);
		}
		if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
			root.style.setProperty("--accent", accent);
			root.style.setProperty("--accent-ink", inkFor(accent));
		}
		ls("hamyar_theme", saved.id);
		ls("hamyar_accent", accent || null);
		applyWallpaper();
		applyFont(ls("hamyar_font"));
	}

	const V = '"Vazirmatn", "Segoe UI", Tahoma, sans-serif';
	// [id, CSS family, name shown]
	const FONT_LIST = [
		["vazir", V, "Vazirmatn"],
		["sahel", '"Sahel", ' + V, "Sahel"],
		["shabnam", '"Shabnam", ' + V, "Shabnam"],
		["samim", '"Samim", ' + V, "Samim"],
		["tanha", '"Tanha", ' + V, "Tanha"],
		["parastoo", '"Parastoo", ' + V, "Parastoo"],
		["inter", '"Inter", ' + V, "Inter"],
		["lora", '"Lora", "Parastoo", ' + V, "Lora"],
		["jetbrains", '"JetBrains Mono", ' + V, "JetBrains Mono"],
		["system", 'system-ui, -apple-system, "Segoe UI", Roboto, Tahoma, sans-serif', "System"],
		["tahoma", 'Tahoma, "Segoe UI", sans-serif', "Tahoma"],
		["serif", '"Noto Naskh Arabic", "Times New Roman", Georgia, serif', "Serif"],
		["mono", 'ui-monospace, "Cascadia Mono", Consolas, "Vazirmatn", monospace', "Mono"],
	];
	const FONTS = Object.fromEntries(FONT_LIST.map((f) => [f[0], f[1]]));
	function applyFont(f) {
		ls("hamyar_font", f && FONTS[f] && f !== "vazir" ? f : null);
		if (f && FONTS[f] && f !== "vazir") document.documentElement.style.setProperty("--font", FONTS[f]);
		else document.documentElement.style.removeProperty("--font");
	}

	function applyWallpaper() {
		const root = document.documentElement;
		const img = ls("hamyar_wall");
		const dim = Number(ls("hamyar_wall_dim") || 35);
		// A video background (kept in IndexedDB) wins over a picture.
		const video = ls("hamyar_video") === "1";
		root.classList.toggle("has-video", video);
		// How solid the boxes are over a background: one value while idle, one while the pointer is on a box.
		const [ba, bh] = boxAlpha();
		root.style.setProperty("--box-a", ba + "%");
		root.style.setProperty("--box-ah", bh + "%");
		root.style.setProperty("--box-blur", Math.round(4 + (ba / 100) * 14) + "px");
		root.style.setProperty("--box-blur-h", Math.round(4 + (bh / 100) * 14) + "px");
		if (video) {
			root.classList.add("has-wall");
			root.style.removeProperty("--wall");
			root.style.setProperty("--wall-dim", String(Math.max(0, Math.min(85, dim)) / 100));
		} else if (img) {
			root.classList.add("has-wall");
			root.style.setProperty("--wall", 'url("' + img + '")');
			root.style.setProperty("--wall-dim", String(Math.max(0, Math.min(85, dim)) / 100));
		} else {
			root.classList.remove("has-wall");
			root.style.removeProperty("--wall");
		}
		updateInk(img, video, dim, ba);
	}

	/* When boxes are see-through, their text must suit the picture behind them, not the theme:
	 * dark text on a dark photo (or light text on a bright one) can't be read. We measure how
	 * bright the background is once, then pick light or dark text for the boxes. */
	const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
	function cssLum(name) {
		const c = document.createElement("canvas").getContext("2d");
		c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#000";
		c.fillRect(0, 0, 1, 1);
		const d = c.getImageData(0, 0, 1, 1).data;
		return lum(d[0], d[1], d[2]);
	}
	let inkSeq = 0;
	function wallLum(img) {
		const sig = img.length + ":" + img.slice(-48);
		const hit = ls("hamyar_wall_lum");
		if (hit && hit.startsWith(sig + "=")) return Promise.resolve(Number(hit.slice(sig.length + 1)));
		return new Promise((res) => {
			const im = new Image();
			im.onload = () => {
				try {
					const c = document.createElement("canvas");
					c.width = c.height = 24;
					const g = c.getContext("2d");
					g.drawImage(im, 0, 0, 24, 24);
					const d = g.getImageData(0, 0, 24, 24).data;
					let t = 0;
					for (let i = 0; i < d.length; i += 4) t += lum(d[i], d[i + 1], d[i + 2]);
					const L = t / (d.length / 4);
					ls("hamyar_wall_lum", sig + "=" + L.toFixed(3));
					res(L);
				} catch { res(null); }
			};
			im.onerror = () => res(null);
			im.src = img;
		});
	}
	async function updateInk(img, video, dim, alpha) {
		const root = document.documentElement, seq = ++inkSeq;
		let L = null;
		if (img && !video) L = await wallLum(img);
		else if (video) L = 0.3; // videos are usually dark; the dim makes them darker still
		if (seq !== inkSeq) return;
		root.classList.remove("ink-light", "ink-dark");
		if (L == null || !root.classList.contains("has-wall")) return;
		// Work in linear light, as contrast is measured (WCAG), and switch the text only when the
		// other colour reads clearly better.
		const lin = (v) => Math.pow(v, 2.2), cr = (x, y) => (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
		const a = alpha / 100, wall = lin(L) * (1 - Math.max(0, Math.min(85, dim)) / 100);
		const box = a * lin(cssLum("--surface")) + (1 - a) * wall;
		const text = lin(cssLum("--text")), light = text > 0.2;
		const now = cr(text, box), other = cr(light ? 0.011 : 0.9, box);
		if (now < 4.5 && other > now * 1.6) root.classList.add(light ? "ink-dark" : "ink-light");
	}

	/** Shrinks an image file to at most 2560px wide JPEG so it fits in local storage. */
	function readWallpaper(file) {
		return new Promise((resolve, reject) => {
			if (!file || !/^image\//.test(file.type)) return reject(new Error("type"));
			const url = URL.createObjectURL(file);
			const im = new Image();
			im.onload = () => {
				URL.revokeObjectURL(url);
				let w = im.naturalWidth, h = im.naturalHeight;
				const max = 2560;
				if (w > max) { h = Math.round((h * max) / w); w = max; }
				const c = document.createElement("canvas");
				c.width = w;
				c.height = h;
				c.getContext("2d").drawImage(im, 0, 0, w, h);
				let q = 0.85, data = c.toDataURL("image/jpeg", q);
				while (data.length > 3500000 && q > 0.4) data = c.toDataURL("image/jpeg", (q -= 0.1));
				resolve(data);
			};
			im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
			im.src = url;
		});
	}
	function setWallpaper(data) {
		if (data) {
			try {
				localStorage.setItem("hamyar_wall", data);
			} catch (e) {
				return false;
			}
		} else ls("hamyar_wall", null);
		applyWallpaper();
		return true;
	}
	function boxAlpha() {
		const n = (k, d) => { const v = Number(ls(k)); return Number.isFinite(v) && ls(k) != null ? Math.max(0, Math.min(100, v)) : d; };
		return [n("hamyar_box_a", 60), n("hamyar_box_ah", 85)];
	}
	function setBoxAlpha(idle, hover) {
		if (idle != null) ls("hamyar_box_a", String(idle));
		if (hover != null) ls("hamyar_box_ah", String(hover));
		applyWallpaper();
	}
	function setDim(pct) {
		ls("hamyar_wall_dim", String(pct));
		applyWallpaper();
	}

	/* ---------- wallpaper collection (IndexedDB) with rotation ---------- */
	function db() {
		return new Promise((res, rej) => {
			const r = indexedDB.open("hamyar", 1);
			r.onupgradeneeded = () => r.result.createObjectStore("walls", { keyPath: "id" });
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
	}
	async function tx(mode, fn) {
		const d = await db();
		return new Promise((res, rej) => {
			const x = d.transaction("walls", mode);
			const out = fn(x.objectStore("walls"));
			x.oncomplete = () => res(out && "result" in out ? out.result : undefined);
			x.onerror = () => rej(x.error);
		});
	}
	const walls = () => tx("readonly", (st) => st.getAll()).then((a) => (a || []).filter((x) => x.kind !== "video").sort((x, y) => x.at - y.at));
	/* Video background: one video, stored on this device only. */
	async function setVideo(blob) {
		if (blob) {
			await tx("readwrite", (st) => st.put({ id: "video", kind: "video", blob, name: blob.name || "", size: blob.size, at: Date.now() }));
			ls("hamyar_video", "1");
		} else {
			await tx("readwrite", (st) => st.delete("video"));
			ls("hamyar_video", null);
		}
		applyWallpaper();
	}
	const getVideo = () => tx("readonly", (st) => st.get("video"));
	async function addWall(data) {
		const id = "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
		await tx("readwrite", (st) => st.put({ id, data, at: Date.now() }));
		return id;
	}
	const removeWall = (id) => tx("readwrite", (st) => st.delete(id));
	/* Ready-made wallpapers that ship with the extension. */
	const BUILTIN = ["winter-deer", "snow-cabin", "dragon", "sakura", "bubble-cat", "forest-girl", "raccoon", "new-york", "keyboard", "low-poly", "deep-night", "misty-village", "purple-moon", "river-forest", "eclipse", "sunset-peaks", "pink-mountains", "fuji-night", "green-islands", "autumn-pavilion", "violet-glow", "blue-galaxy", "hexagons", "lake-sunset", "moon-lake", "alpine-lake", "blue-ranges", "pink-mist", "misty-dawn", "violet-lake", "purple-sunset"]
		.map((n) => ({ id: "b-" + n, data: "/wallpapers/" + n + ".jpg", thumb: "/wallpapers/thumbs/" + n + ".jpg", builtin: true }));
	/* Plain colours and soft gradients, drawn as a tiny picture so they work like any wallpaper
	 * (dimming, box opacity, hover). */
	const COLOR_LIST = [
		["navy", "#0b1f3a"], ["midnight", "#0d0d14"], ["charcoal", "#26282c"], ["slate", "#3b4655"], ["forest", "#163a2b"], ["teal", "#0f4c55"],
		["plum", "#3b1d4a"], ["wine", "#4a1424"], ["sand", "#d9c9a8"], ["cream", "#f3ede2"], ["sky", "#bcd8f0"], ["blush", "#f2d1d6"],
		["dusk", "#1e3c72", "#6a3093"], ["ocean", "#0f2027", "#2c5364"], ["sunset", "#ee9ca7", "#ffdde1"], ["aurora", "#134e5e", "#71b280"], ["peach", "#f6d365", "#fda085"], ["mint", "#d4fc79", "#96e6a1"]
	];
	let COLORS = null;
	function colors() {
		if (COLORS) return COLORS;
		COLORS = COLOR_LIST.map(([name, a, b]) => {
			const c = document.createElement("canvas");
			c.width = 64;
			c.height = 36;
			const g = c.getContext("2d");
			if (b) {
				const gr = g.createLinearGradient(0, 0, 64, 36);
				gr.addColorStop(0, a);
				gr.addColorStop(1, b);
				g.fillStyle = gr;
			} else g.fillStyle = a;
			g.fillRect(0, 0, 64, 36);
			const data = c.toDataURL("image/png");
			return { id: "c-" + name, data, thumb: data, color: true };
		});
		return COLORS;
	}
	async function useWall(id) {
		const w = BUILTIN.find((x) => x.id === id) || (id.startsWith("c-") && colors().find((x) => x.id === id)) || (await walls()).find((x) => x.id === id);
		if (!w) return false;
		ls("hamyar_wall_id", id);
		ls("hamyar_wall_at", String(Date.now()));
		return setWallpaper(w.data);
	}
	// A ready-made wallpaper that no longer ships (removed in 2.16.3): switch to another one instead of a blank page.
	{
		const cur = ls("hamyar_wall_id") || "";
		if (cur.startsWith("b-") && !BUILTIN.some((x) => x.id === cur)) setTimeout(() => useWall("b-misty-village").catch(() => {}), 0);
	}
	const ROTATE = { off: 0, tab: 1, h1: 3600e3, h4: 4 * 3600e3, h12: 12 * 3600e3, d1: 24 * 3600e3 };
	/** Moves to the next wallpaper in the collection when the chosen interval has passed. */
	async function rotate() {
		const every = ROTATE[ls("hamyar_wall_rotate") || "off"];
		if (!every || !ls("hamyar_wall")) return;
		const last = Number(ls("hamyar_wall_at") || 0);
		if (every > 1 && Date.now() - last < every) return;
		// Own pictures rotate among themselves; otherwise the ready-made ones join in.
		const own = await walls();
		const cur = ls("hamyar_wall_id") || "";
		if (cur.startsWith("c-")) return;
		const list = own.length >= 2 && !cur.startsWith("b-") ? own : [...BUILTIN, ...own];
		if (list.length < 2) return;
		// The next picture is prepared for the next tab, so this one doesn't flash from one wallpaper to another.
		const i = list.findIndex((w) => w.id === ls("hamyar_wall_id"));
		const next = list[(i + 1) % list.length];
		try {
			localStorage.setItem("hamyar_wall", next.data);
			ls("hamyar_wall_id", next.id);
			ls("hamyar_wall_at", String(Date.now()));
		} catch (e) {}
	}

	window.Themes = { list, byId, apply, applyWallpaper, readWallpaper, setWallpaper, setDim, boxAlpha, setBoxAlpha, hasWall: () => !!ls("hamyar_wall"), hasVideo: () => ls("hamyar_video") === "1", setVideo, getVideo, dim: () => Number(ls("hamyar_wall_dim") || 35),
		applyFont, FONTS, FONT_LIST, isDay, walls, addWall, removeWall, useWall, BUILTIN, colors, rotate, ROTATE,
		rotation: (v) => (v === undefined ? ls("hamyar_wall_rotate") || "off" : ls("hamyar_wall_rotate", v)), activeWall: () => ls("hamyar_wall_id") };
})();
