/* Automatic celebrations: the user's birthday, Nowruz (with the exact moment of the new year), Sizdah Bedar,
 * Chaharshanbe Suri, Yalda Night and the Gregorian New Year. On the day, the first new tab opens a full-screen
 * scene with confetti, fireworks or embers and something to do (blow out the candles, jump over the fire, open a
 * pomegranate, tie the sabzeh), and the page wears a special look all day. Everything is drawn locally. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const fa = () => I18n.lang === "fa";
	const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
	const addDays = (d, n) => { const x = noon(d); x.setDate(x.getDate() + n); return x; };
	const on = () => setting("celebrations", true) !== false;
	const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch {} return null; };

	/* ---------- the moment of the new year (March equinox), Meeus ch. 27, about a minute of accuracy ---------- */
	const EQ = [[485, 324.96, 1934.136], [203, 337.23, 32964.467], [199, 342.08, 20.186], [182, 27.85, 445267.112], [156, 73.14, 45036.886], [136, 171.52, 22518.443], [77, 222.54, 65928.934], [74, 296.72, 3034.906], [70, 243.58, 9037.513], [58, 119.81, 33718.147], [52, 297.17, 150.678], [50, 21.02, 2281.226], [45, 247.54, 29929.562], [44, 325.15, 31555.956], [29, 60.93, 4443.417], [18, 155.12, 67555.328], [17, 288.79, 4562.452], [16, 198.04, 62894.029], [14, 199.76, 31436.921], [12, 95.39, 14577.848], [12, 287.11, 31931.756], [12, 320.81, 34777.259], [9, 227.73, 1222.114], [8, 15.45, 16859.074]];
	function equinox(year) {
		const Y = (year - 2000) / 1000, r = Math.PI / 180;
		const J0 = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y ** 3 - 0.00057 * Y ** 4;
		const T = (J0 - 2451545) / 36525, W = (35999.373 * T - 2.47) * r;
		const dl = 1 + 0.0334 * Math.cos(W) + 0.0007 * Math.cos(2 * W);
		let S = 0;
		for (const [a, b, c] of EQ) S += a * Math.cos((b + c * T) * r);
		const dT = 69 + (year - 2020) * 0.3; // seconds between terrestrial and universal time
		return new Date((J0 + (0.00001 * S) / dl - 2440587.5) * 864e5 - dT * 1000);
	}
	/** The next (or current) new-year moment: { at, year } with year = the Persian year that begins. */
	function tahvil(now = new Date()) {
		let y = now.getFullYear(), at = equinox(y);
		if (now - at > 5 * 864e5) at = equinox(++y);
		return { at, year: y - 621 };
	}
	H.tahvil = tahvil;
	const fmtWhen = (d, tz) => new Intl.DateTimeFormat(I18n.locale + "-u-ca-persian", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: tz }).format(d);

	/* ---------- which celebration is it today ---------- */
	function isSuri(d) {
		const j = H.jparts(d);
		return d.getDay() === 2 && j.month === 12 && H.jparts(addDays(d, 1)).month === 12 && H.jparts(addDays(d, 8)).month === 1;
	}
	function bday(d) {
		const bd = setting("birthday", "");
		if (!bd || !bd.date || !window.EvCore) return null;
		if (!EvCore.matches({ date: bd.date, repeat: "yearly", cal: bd.cal || "gregory" }, noon(d))) return null;
		const b = new Date(bd.date + "T12:00:00");
		const age = bd.cal === "persian" ? H.jparts(d).year - H.jparts(b).year : d.getFullYear() - b.getFullYear();
		return { age: age > 0 && age < 130 ? age : 0 };
	}
	function sameDay(a, b) { return H.dayKey(a) === H.dayKey(b); }
	function todays(d = new Date()) {
		const out = [];
		const j = H.jparts(d);
		const b = bday(d);
		if (b) out.push({ id: "birthday", ...b });
		const th = tahvil(d);
		if ((j.month === 1 && j.day <= 4) || sameDay(th.at, d)) out.push({ id: "nowruz", at: th.at, year: th.year });
		if (j.month === 1 && j.day === 13) out.push({ id: "sizdah" });
		if (isSuri(d)) out.push({ id: "suri" });
		if (j.month === 9 && j.day === 30) out.push({ id: "yalda" });
		if (d.getMonth() === 0 && d.getDate() === 1) out.push({ id: "newyear", year: d.getFullYear() });
		return out;
	}
	/** Days until each celebration (for the fun page), searching up to 400 days ahead. */
	function upcoming() {
		const found = {}, start = noon(new Date());
		for (let i = 0; i < 400 && Object.keys(found).length < 6; i++) {
			const d = addDays(start, i);
			for (const c of todays(d)) if (!(c.id in found)) found[c.id] = { ...c, days: i, date: d };
		}
		return ["birthday", "nowruz", "suri", "yalda", "sizdah", "newyear"].filter((k) => found[k]).map((k) => found[k]).sort((a, b) => a.days - b.days);
	}

	/* ---------- little sounds (only when turned on) ---------- */
	let actx = null;
	function audio() {
		if (!actx) try { actx = new AudioContext(); } catch { return null; }
		if (actx.state === "suspended") actx.resume().catch(() => {});
		return actx;
	}
	function tone(f, at, dur, vol = 0.18, type = "sine") {
		const a = audio();
		if (!a) return;
		const o = a.createOscillator(), g = a.createGain(), o2 = a.createOscillator(), g2 = a.createGain();
		o.type = type; o.frequency.value = f;
		o2.type = "sine"; o2.frequency.value = f * 2; g2.gain.value = 0.25;
		const t0 = a.currentTime + at;
		g.gain.setValueAtTime(0, t0);
		g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
		g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
		o.connect(g); o2.connect(g2); g2.connect(g); g.connect(a.destination);
		o.start(t0); o2.start(t0); o.stop(t0 + dur + 0.05); o2.stop(t0 + dur + 0.05);
	}
	const chime = () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 1.2, 0.12));
	// "Happy Birthday" (traditional tune) with a soft bell sound.
	function birthdaySong() {
		const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
		const s = [["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["C5", 1], ["B4", 2], ["G4", 0.75], ["G4", 0.25], ["A4", 1], ["G4", 1], ["D5", 1], ["C5", 2], ["G4", 0.75], ["G4", 0.25], ["G5", 1], ["E5", 1], ["C5", 1], ["B4", 1], ["A4", 2], ["F5", 0.75], ["F5", 0.25], ["E5", 1], ["C5", 1], ["D5", 1], ["C5", 3]];
		let at = 0.05;
		const beat = 0.42;
		for (const [n, b] of s) { tone(N[n], at, b * beat + 0.5, 0.16, "triangle"); at += b * beat; }
		return at;
	}
	const sound = (fn) => setting("celeSound", false) && fn();

	/* ---------- scenes (inline SVG) ---------- */
	const flame = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="cf-flame"><path d="M0 -18 C 7 -9 7 -2 0 2 C -7 -2 -7 -9 0 -18 Z" fill="#ffb020"/><path d="M0 -11 C 3.5 -6 3.5 -2 0 0.5 C -3.5 -2 -3.5 -6 0 -11 Z" fill="#fff3b0"/></g></g>`;
	function cakeSvg(age) {
		const digits = age ? String(age).split("") : ["", "", ""];
		const n = digits.length, gap = n === 1 ? 0 : 34;
		const candles = digits.map((dg, i) => {
			const x = 160 + (i - (n - 1) / 2) * gap;
			const body = dg ? `<text x="${x}" y="98" text-anchor="middle" font-size="44" font-weight="800" fill="url(#cg)" stroke="#fff" stroke-width="1.5" font-family="Vazirmatn, sans-serif">${num(+dg)}</text>` : `<rect x="${x - 4}" y="66" width="8" height="34" rx="3" fill="url(#cs)"/>`;
			return `<g class="candle">${body}<line x1="${x}" y1="58" x2="${x}" y2="${dg ? 62 : 66}" stroke="#333" stroke-width="1.5"/>${flame(x, 56, 1)}<g class="smoke"><circle cx="${x}" cy="50" r="5"/><circle cx="${x + 4}" cy="40" r="6"/><circle cx="${x - 3}" cy="28" r="7"/></g></g>`;
		}).join("");
		const sprinkles = [...Array(22)].map((_, i) => `<rect x="${78 + ((i * 37) % 166)}" y="${128 + ((i * 13) % 22)}" width="7" height="2.6" rx="1.3" fill="${["#ff5d8f", "#ffc93c", "#4ade80", "#38bdf8", "#a78bfa"][i % 5]}" transform="rotate(${(i * 47) % 180} ${82 + ((i * 37) % 166)} ${129 + ((i * 13) % 22)})"/>`).join("");
		return `<svg viewBox="0 0 320 250" class="cele-svg cake" role="img" aria-label="cake"><defs>
			<linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8fb8"/><stop offset="1" stop-color="#e0457b"/></linearGradient>
			<linearGradient id="cs" x1="0" x2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient>
			<linearGradient id="ck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe4c4"/><stop offset="1" stop-color="#f4b97a"/></linearGradient>
			<linearGradient id="ck2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
			<ellipse cx="160" cy="232" rx="128" ry="12" fill="rgba(0,0,0,.18)"/>
			<ellipse cx="160" cy="224" rx="120" ry="13" fill="#f1f5f9"/>
			<rect x="58" y="160" width="204" height="62" rx="12" fill="url(#ck2)"/>
			<path d="M58 172 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 12 14 24 0 q 6 8 12 0 V160 H58Z" fill="#fff" opacity=".92"/>
			<rect x="76" y="110" width="168" height="54" rx="10" fill="url(#ck)"/>
			<path d="M76 120 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 q 10 14 21 0 V110 H76Z" fill="#ff8fb8"/>
			${sprinkles}<circle cx="96" cy="196" r="5" fill="#fde047"/><circle cx="160" cy="200" r="5" fill="#fde047"/><circle cx="224" cy="196" r="5" fill="#fde047"/>
			${candles}</svg>`;
	}
	function haftsinSvg() {
		const egg = (x, y, c1, c2, r = 0) => `<g transform="rotate(${r} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="9" ry="12" fill="${c1}"/><path d="M${x - 9} ${y} q 4.5 -4 9 0 q 4.5 4 9 0" stroke="${c2}" stroke-width="2.4" fill="none"/></g>`;
		const blades = [...Array(26)].map((_, i) => { const x = 40 + i * 2.6; const h = 30 + ((i * 7) % 16); return `<path d="M${x} 142 q ${(i % 2 ? 4 : -4)} ${-h / 2} ${(i % 3) - 1} ${-h}" stroke="${i % 2 ? "#22c55e" : "#16a34a"}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`; }).join("");
		return `<svg viewBox="0 0 340 230" class="cele-svg haftsin" role="img" aria-label="Haft-Sin"><defs>
			<pattern id="termeh" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#8b1e3f"/><path d="M13 3 c 6 3 6 11 0 14 c 4 -4 -1 -9 -4 -6 c -2 -4 1 -8 4 -8z" fill="#f5c26b" opacity=".85"/><circle cx="3" cy="23" r="1.6" fill="#f5c26b"/></pattern>
			<radialGradient id="bowl" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#e0f7ff" stop-opacity=".9"/><stop offset="1" stop-color="#7dd3fc" stop-opacity=".55"/></radialGradient></defs>
			<path d="M10 150 L330 150 L314 222 L26 222 Z" fill="url(#termeh)" stroke="#f5c26b" stroke-width="3"/>
			<ellipse cx="170" cy="150" rx="160" ry="10" fill="#a32a50"/>
			<g class="hs-mirror"><ellipse cx="170" cy="78" rx="34" ry="44" fill="#f5c26b"/><ellipse cx="170" cy="78" rx="28" ry="38" fill="#dbeafe"/><path d="M152 60 q 10 -14 26 -8" stroke="#fff" stroke-width="4" fill="none" opacity=".7"/></g>
			${flame(122, 96, 0.9)}<rect x="117" y="98" width="10" height="44" rx="3" fill="#fde68a"/>
			${flame(218, 96, 0.9)}<rect x="213" y="98" width="10" height="44" rx="3" fill="#fde68a"/>
			<g class="hs-sabzeh">${blades}<path d="M34 142 h 76 l -6 10 h -64 z" fill="#d97706"/><path d="M55 120 q 18 -10 36 0" stroke="#ef4444" stroke-width="3" fill="none"/></g>
			<g class="hs-bowl"><circle cx="276" cy="118" r="26" fill="url(#bowl)" stroke="#bae6fd" stroke-width="2"/><g class="fish"><path d="M268 120 q 8 -8 16 0 q -8 8 -16 0 z" fill="#fb923c"/><path d="M284 120 l 7 -5 v 10 z" fill="#f97316"/><circle cx="272" cy="118.5" r="1.2" fill="#000"/></g></g>
			${egg(118, 160, "#f472b6", "#fff", -12)}${egg(140, 164, "#38bdf8", "#fde047", 8)}${egg(160, 162, "#facc15", "#ef4444", -4)}
			<text x="200" y="172" font-size="22">🍎</text><text x="226" y="172" font-size="20">🪙</text><text x="250" y="174" font-size="20">🧄</text><text x="58" y="176" font-size="20">🌸</text><text x="84" y="178" font-size="18">📖</text>
		</svg>`;
	}
	function fireSvg() {
		const fire = (x, s) => `<g transform="translate(${x} 176) scale(${s})"><path d="M-30 6 L30 6 L22 0 L-22 0 Z" fill="#4b2e1a"/><path d="M-26 2 l 52 -6 M-26 -4 l 52 6" stroke="#6b3f22" stroke-width="5" stroke-linecap="round"/>
			<g class="fire-f f1"><path d="M0 -70 C 22 -40 26 -18 18 -4 C 10 4 -10 4 -18 -4 C -26 -18 -22 -40 0 -70 Z" fill="#f97316"/></g>
			<g class="fire-f f2"><path d="M2 -52 C 16 -32 18 -16 12 -6 C 6 0 -8 0 -12 -6 C -18 -16 -14 -32 2 -52 Z" fill="#fb923c"/></g>
			<g class="fire-f f3"><path d="M0 -34 C 9 -22 10 -12 6 -5 C 3 -1 -4 -1 -7 -5 C -10 -12 -9 -22 0 -34 Z" fill="#fde047"/></g></g>`;
		return `<svg viewBox="0 0 340 220" class="cele-svg suri" role="img" aria-label="fire"><defs><radialGradient id="glow" cx=".5" cy=".8" r=".6"><stop offset="0" stop-color="#ff9a3c" stop-opacity=".55"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>
			<rect x="0" y="120" width="340" height="100" fill="url(#glow)"/>${fire(80, 0.8)}${fire(170, 1)}${fire(260, 0.8)}
			<g class="jumper"><circle cx="0" cy="-58" r="8" fill="#1f2937"/><path d="M0 -50 L0 -24 M0 -44 L-12 -32 M0 -44 L12 -34 M0 -24 L-10 -6 M0 -24 L10 -8" stroke="#1f2937" stroke-width="5" stroke-linecap="round"/></g>
			<rect x="0" y="182" width="340" height="38" fill="#2a1a12"/></svg>`;
	}
	function yaldaSvg() {
		const seeds = [...Array(28)].map((_, i) => `<circle cx="${-22 + (i % 7) * 7.5 + (((i / 7) | 0) % 2) * 3}" cy="${-14 + ((i / 7) | 0) * 8}" r="3.4" fill="#e11d48"/>`).join("");
		return `<svg viewBox="0 0 340 230" class="cele-svg yalda" role="img" aria-label="Yalda"><defs>
			<radialGradient id="pom" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#ff6b6b"/><stop offset=".6" stop-color="#c81d25"/><stop offset="1" stop-color="#7f1d1d"/></radialGradient>
			<radialGradient id="moonG" cx=".45" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#f5deb3"/></radialGradient></defs>
			<circle cx="268" cy="52" r="30" fill="url(#moonG)" class="y-moon"/>
			${[[30, 30], [80, 18], [140, 40], [200, 22], [320, 100], [20, 92], [110, 80], [300, 160]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${1.2 + (i % 3) * 0.6}" fill="#fff" class="tw" style="animation-delay:${i * 0.4}s"/>`).join("")}
			<rect x="20" y="182" width="300" height="12" rx="6" fill="#7c2d12"/>
			<g transform="translate(96 150)" class="wm"><path d="M-46 0 A 46 46 0 0 0 46 0 Z" fill="#16a34a"/><path d="M-41 0 A 41 41 0 0 0 41 0 Z" fill="#f0fdf4"/><path d="M-37 0 A 37 37 0 0 0 37 0 Z" fill="#ef4444"/>${[-20, -8, 4, 16, -14, 10].map((x, i) => `<ellipse cx="${x}" cy="${8 + (i % 3) * 7}" rx="1.6" ry="2.6" fill="#111"/>`).join("")}</g>
			<g transform="translate(214 140)" class="pom">
				<g class="pom-whole"><circle r="36" fill="url(#pom)"/><path d="M-8 -34 l 4 -10 l 4 6 l 4 -6 l 4 10 z" fill="#7f1d1d"/><path d="M-16 -16 q 6 -8 14 -6" stroke="#fff" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/></g>
				<g class="pom-half l"><path d="M0 -36 A 36 36 0 0 0 0 36 Z" fill="url(#pom)"/><path d="M-2 -30 A 30 30 0 0 0 -2 30 Z" fill="#fde2e4"/><g transform="translate(-14 0)">${seeds}</g></g>
				<g class="pom-half r"><path d="M0 -36 A 36 36 0 0 1 0 36 Z" fill="url(#pom)"/><path d="M2 -30 A 30 30 0 0 1 2 30 Z" fill="#fde2e4"/><g transform="translate(14 0) scale(-1 1)">${seeds}</g></g></g>
			${flame(296, 158, 0.8)}<rect x="291" y="160" width="10" height="24" rx="3" fill="#fde68a"/>
			<g transform="translate(40 168)"><rect width="34" height="14" rx="2" fill="#92400e"/><rect x="3" y="2" width="28" height="10" fill="#fbbf24" opacity=".6"/></g></svg>`;
	}
	function meadowSvg() {
		const blades = [...Array(40)].map((_, i) => { const x = 120 + i * 2.5; const h = 36 + ((i * 7) % 20); return `<path d="M${x} 150 q ${(i % 2 ? 5 : -5)} ${-h / 2} ${(i % 3) - 1} ${-h}" stroke="${i % 2 ? "#22c55e" : "#15803d"}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`; }).join("");
		return `<svg viewBox="0 0 340 220" class="cele-svg sizdah" role="img" aria-label="Sizdah Bedar"><path d="M0 160 Q 90 120 170 150 T 340 140 V220 H0Z" fill="#4ade80"/><path d="M0 180 Q 120 150 220 176 T 340 170 V220 H0Z" fill="#22c55e"/>
			<circle cx="60" cy="50" r="24" fill="#fde047"/><g class="sabzeh-pot">${blades}<path d="M114 150 h 108 l -10 22 h -88 z" fill="#c2410c"/></g><g class="knots"></g></svg>`;
	}

	/* ---------- texts ---------- */
	function texts(c) {
		const name = setting("name", "");
		switch (c.id) {
			case "birthday": return { title: name ? t("celeBdayName", { name }) : t("celeBday"), sub: c.age ? t("celeBdayAge", { n: num(c.age) }) : t("celeBdaySub") };
			case "nowruz": return { title: t("celeNowruz"), sub: t("celeNowruzSub", { y: num(c.year, { useGrouping: false }) }) };
			case "sizdah": return { title: t("celeSizdah"), sub: t("celeSizdahSub") };
			case "suri": return { title: t("celeSuri"), sub: t("celeSuriSub") };
			case "yalda": return { title: t("celeYalda"), sub: t("celeYaldaSub") };
			case "newyear": return { title: t("celeNewYear", { y: num(c.year, { useGrouping: false }) }), sub: t("celeNewYearSub") };
		}
		return { title: "", sub: "" };
	}
	const PAL = { birthday: "party", nowruz: "nowruz", sizdah: ["#22c55e", "#86efac", "#fde047", "#38bdf8"], suri: "fire", yalda: "yalda", newyear: "gold" };
	function ambient(id, long) {
		const k = long ? 1 : 0.5;
		if (id === "birthday") { Fx.confetti({ colors: "party" }); Fx.balloons(16); }
		else if (id === "nowruz") { Fx.fall("petal", 10 * k, null, 7); Fx.confetti({ colors: "nowruz", count: 120 }); }
		else if (id === "sizdah") Fx.fall("leaf", 9 * k, null, 7);
		else if (id === "suri") { Fx.embers(14 * k); Fx.fireworks(5 * k, "fire"); }
		else if (id === "yalda") { Fx.fall("seed", 9 * k, null, 6); }
		else if (id === "newyear") Fx.fireworks(8 * k, "party");
	}

	/* ---------- the scene ---------- */
	let tick = 0;
	function close() {
		const o = $("celebrate");
		if (!o) return;
		clearInterval(tick);
		o.classList.add("out");
		setTimeout(() => o.remove(), 350);
		document.removeEventListener("keydown", onKey, true);
	}
	function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
	function show(c) {
		$("celebrate")?.remove();
		clearInterval(tick);
		const tx = texts(c);
		const art = el("div", { class: "cele-art" });
		const extra = el("div", { class: "cele-extra" });
		const actions = el("div", { class: "cele-actions" });
		const btn = (label, fn, ghost) => el("button", { type: "button", class: "btn" + (ghost ? " btn-ghost" : ""), onclick: fn }, label);
		const svg = { birthday: () => cakeSvg(c.age), nowruz: haftsinSvg, sizdah: meadowSvg, suri: fireSvg, yalda: yaldaSvg, newyear: () => `<div class="ny-num">${num(c.year, { useGrouping: false })}</div>` }[c.id];
		art.innerHTML = svg ? svg() : "";
		if (c.id === "birthday") {
			let blown = false;
			actions.append(
				btn("🌬️ " + t("celeBlow"), (e) => {
					if (blown) return;
					blown = true;
					art.querySelector(".cake")?.classList.add("out");
					e.currentTarget.disabled = true;
					sound(chime);
					setTimeout(() => { Fx.confetti({ colors: "party", count: 220 }); Fx.shower(3); extra.textContent = t("celeWish"); }, 450);
				}),
				btn("🎵 " + t("celeSong"), () => { birthdaySong(); Fx.fall("heart", 6, null, 4); }, true));
			art.querySelector(".cake")?.addEventListener("click", () => actions.querySelector(".btn")?.click());
		} else if (c.id === "nowruz") {
			const at = c.at || tahvil().at;
			const draw = () => {
				const left = at - Date.now();
				const tz = "Asia/Tehran";
				if (left > 0 && left < 864e5) {
					const s = Math.floor(left / 1000);
					extra.replaceChildren(el("div", { class: "cele-count" }, [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((x) => num(x, { minimumIntegerDigits: 2 })).join(":")), el("small", {}, t("celeTahvilAt", { when: fmtWhen(at, tz) })));
				} else {
					extra.replaceChildren(el("small", {}, t(left > 0 ? "celeTahvilAt" : "celeTahvilWas", { when: fmtWhen(at, tz) })));
					if (left <= 0 && left > -1500) { Fx.fireworks(10, "party"); Fx.confetti({ colors: "nowruz", count: 240 }); sound(chime); }
				}
			};
			draw();
			tick = setInterval(draw, 1000);
			actions.append(btn("🎆 " + t("celeFireworks"), () => Fx.fireworks(6, "party")), btn("🔮 " + t("celeFal"), () => { close(); H.openFal?.(); }, true));
		} else if (c.id === "suri") {
			let jumps = 0;
			const jumper = art.querySelector(".jumper");
			actions.append(btn("🔥 " + t("celeJump"), () => {
				if (!jumper || jumper.classList.contains("go")) return;
				jumper.classList.add("go");
				jumps++;
				setTimeout(() => { jumper.classList.remove("go"); Fx.burst(innerWidth / 2 + (Math.random() - 0.5) * 200, innerHeight * 0.45, "fire"); }, 1300);
				extra.textContent = jumps === 1 ? t("celeSuriSay") : t("celeJumps", { n: num(jumps) });
				if (jumps === 3) { Fx.fireworks(5, "fire"); H.bump?.("suriJump"); }
			}), btn("🎆 " + t("celeFireworks"), () => Fx.fireworks(6, "fire"), true));
			extra.textContent = t("celeSuriTip");
		} else if (c.id === "yalda") {
			const len = H.dayLength?.(c.date || noon(new Date()));
			if (len) extra.textContent = t("celeYaldaNight", { len: H.hmLen(24 - len.len), city: len.city });
			actions.append(btn("🍎 " + t("celePom"), (e) => {
				art.querySelector(".pom")?.classList.add("open");
				e.currentTarget.disabled = true;
				const r = art.querySelector(".pom")?.getBoundingClientRect();
				if (r) Fx.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, colors: "yalda", count: 90, power: 520 });
				Fx.fall("seed", 5, null, 10);
				sound(chime);
			}), btn("🔮 " + t("celeYaldaFal"), () => { close(); H.openFal?.(); }, true));
		} else if (c.id === "sizdah") {
			let knots = 0;
			actions.append(btn("🌱 " + t("celeKnot"), () => {
				knots++;
				const g = art.querySelector(".knots");
				if (g) g.insertAdjacentHTML("beforeend", `<circle cx="${140 + ((knots * 23) % 70)}" cy="${112 - (knots % 3) * 6}" r="4.5" fill="#fde047" stroke="#15803d" stroke-width="2"/>`);
				extra.textContent = t("celeKnotWish");
				Fx.fall("leaf", 2, null, 14);
			}));
		} else if (c.id === "newyear") {
			actions.append(btn("🎆 " + t("celeFireworks"), () => Fx.fireworks(6, "party")));
		}
		actions.append(btn(t("close"), close, true));
		const o = el("div", { id: "celebrate", class: "cele cele-" + c.id, role: "dialog", "aria-modal": "true", "aria-label": tx.title },
			el("div", { class: "cele-sky", "aria-hidden": "true" }),
			el("div", { class: "cele-card" }, art, el("h2", { class: "cele-title" }, tx.title), el("p", { class: "cele-sub" }, tx.sub), extra, actions),
			el("button", { class: "cele-x icon-btn", type: "button", title: t("close"), "aria-label": t("close"), onclick: close }, "✕"));
		o.addEventListener("click", (e) => e.target === o && close());
		document.body.append(o);
		document.addEventListener("keydown", onKey, true);
		requestAnimationFrame(() => o.classList.add("in"));
		setTimeout(() => ambient(c.id, true), 350);
		sound(chime);
		actions.querySelector(".btn")?.focus();
	}
	H.celebrate = (id) => {
		const d = new Date();
		const real = todays(d).find((c) => c.id === id);
		if (real) return show(real);
		const b = setting("birthday", "");
		const age = b && b.date ? Math.max(1, d.getFullYear() - new Date(b.date + "T12:00").getFullYear()) : 30;
		const th = tahvil(d);
		const next = upcoming().find((c) => c.id === id);
		show({ id, age, at: th.at, year: id === "newyear" ? d.getFullYear() + 1 : th.year, date: next?.date, preview: true });
	};

	/* ---------- the look of the day, the chip and the first-open scene ---------- */
	function applyLook() {
		const list = on() ? todays() : [];
		const root = document.documentElement;
		["birthday", "nowruz", "sizdah", "suri", "yalda", "newyear"].forEach((id) => root.classList.toggle("cele-" + id, list.some((c) => c.id === id)));
		const chip = $("seasonChip");
		// Before the new year: count down on the chip from 25 Esfand.
		const th = tahvil();
		const left = th.at - Date.now();
		let txt = "";
		if (on() && left > 0 && left < 6 * 864e5) {
			const days = Math.floor(left / 864e5), hrs = Math.floor(left / 36e5) % 24, mins = Math.floor(left / 6e4) % 60;
			txt = days ? t("celeToNowruzD", { d: num(days), h: num(hrs) }) : t("celeToNowruzH", { h: num(hrs), m: num(mins) });
		}
		let extra = chip.querySelector(".chip-count");
		if (txt) {
			if (!extra) chip.append(extra = el("span", { class: "chip-count" }));
			extra.textContent = " · " + txt;
			chip.hidden = false;
		} else extra?.remove();
		if (list.some((c) => c.id === "birthday") && chip.hidden) {
			chip.hidden = false;
			chip.replaceChildren(el("span", {}, "🎂"), " ", t("celeBdayChip"));
		}
		chip.classList.toggle("clickable", list.length > 0);
		chip.title = list.length ? t("celeReplay") : "";
	}
	$("seasonChip").addEventListener("click", () => {
		const list = on() ? todays() : [];
		if (list.length) show(list[0]);
	});
	$("greeting").addEventListener("click", () => document.documentElement.classList.contains("cele-birthday") && H.celebrate("birthday"));
	let waitT = 0;
	function maybeShow() {
		if (!on() || $("celebrate")) return;
		if (!$("setup").hidden || H.tourOpen?.() || document.visibilityState !== "visible") return;
		// Wait for the morning brief or another window to close first.
		if (document.querySelector("dialog[open]")) { clearTimeout(waitT); waitT = setTimeout(maybeShow, 2000); return; }
		let seen = {};
		try { seen = JSON.parse(ls("rubi_cele_seen") || "{}"); } catch {}
		const today = H.dayKey();
		const c = todays().find((x) => seen[x.id] !== today);
		if (!c) return;
		seen[c.id] = today;
		ls("rubi_cele_seen", JSON.stringify(seen));
		H.bump?.("cele_" + c.id);
		show(c);
	}

	/* ---------- the card on the fun page ---------- */
	const NAME = { birthday: "celeNameBday", nowruz: "celeNameNowruz", suri: "celeNameSuri", yalda: "celeNameYalda", sizdah: "celeNameSizdah", newyear: "celeNameNewYear" };
	const ICON = { birthday: "🎂", nowruz: "🌱", suri: "🔥", yalda: "🍉", sizdah: "🌿", newyear: "🎆" };
	const body = el("div", { class: "fun-cele" });
	function drawCard() {
		const up = upcoming();
		const rows = up.map((c) => el("li", { class: "cele-row" + (c.days === 0 ? " now" : "") },
			el("span", { class: "cele-ic" }, ICON[c.id]),
			el("div", { class: "grow" }, el("strong", {}, t(NAME[c.id])),
				el("small", { class: "muted" }, c.id === "nowruz" ? t("celeTahvilAt", { when: fmtWhen(c.at, "Asia/Tehran") }) : H.fmtDate(c.date, H.calOrder()[0]))),
			el("span", { class: "cele-days" }, c.days === 0 ? t("today") : t("celeInDays", { n: num(c.days) })),
			el("button", { type: "button", class: "icon-btn small", title: t("celePreview"), "aria-label": t("celePreview"), onclick: () => H.celebrate(c.id) }, "▶")));
		if (!setting("birthday", "")) rows.push(el("li", { class: "cele-row" }, el("span", { class: "cele-ic" }, "🎂"), el("div", { class: "grow" }, el("strong", {}, t("celeNameBday")), el("small", { class: "muted" }, t("celeNoBday"))), el("button", { type: "button", class: "chip", onclick: () => H.settingsSection("profile") }, t("celeSetBday")), el("button", { type: "button", class: "icon-btn small", title: t("celePreview"), onclick: () => H.celebrate("birthday") }, "▶")));
		body.replaceChildren(
			el("ul", { class: "cele-list" }, ...rows),
			el("label", { class: "check small" }, el("input", { type: "checkbox", checked: on(), onchange: (e) => Store.setSetting("celebrations", e.target.checked) }), " ", t("celeAuto")),
			el("label", { class: "check small" }, el("input", { type: "checkbox", checked: !!setting("celeSound", false), onchange: (e) => Store.setSetting("celeSound", e.target.checked) }), " ", t("celeSound")));
	}
	H.funCard("cele", { icon: "🎉", title: "celeTitle", order: 30, body });
	drawCard();

	let sig = "";
	function refresh() {
		applyLook();
		const s = H.dayKey() + I18n.lang + JSON.stringify(setting("birthday", "")) + on() + setting("celeSound", false);
		if (s !== sig) { sig = s; drawCard(); }
	}
	H.onRefresh(refresh);
	refresh();
	setInterval(() => document.visibilityState === "visible" && applyLook(), 30000);
	// Give the page (and the first-run setup) a moment, then celebrate.
	window.hamyarReady?.then?.(() => setTimeout(maybeShow, 1200));
	document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && setTimeout(maybeShow, 600));
	window.Celebrate = { todays, upcoming, equinox, tahvil, show };
})();
