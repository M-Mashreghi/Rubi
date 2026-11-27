/* Breathing exercise (fun page): a circle that grows as you breathe in and shrinks as you breathe out, with a
 * soft pad sound made in the page. A few well-known patterns and lengths to choose from. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	// [id, [in, hold, out, hold after] in seconds]
	const PATTERNS = [["calm", [4, 0, 6, 0]], ["box", [4, 4, 4, 4]], ["478", [4, 7, 8, 0]], ["even", [5, 0, 5, 0]]];
	const cfg = () => ({ pattern: "calm", min: 3, sound: true, ...(setting("breathe", {}) || {}) });
	const save = (p) => Store.setSetting("breathe", { ...cfg(), ...p });

	/* ---------- sound: a soft chord that swells with the breath ---------- */
	let ac = null, pad = null;
	function startPad() {
		const A = window.AudioContext || window.webkitAudioContext;
		if (!A) return;
		ac = ac || new A();
		if (ac.state === "suspended") ac.resume();
		const out = ac.createGain(); out.gain.value = 0.0001;
		const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 0.5;
		const oscs = [196, 293.66, 392, 246.94].map((f, i) => { const o = ac.createOscillator(); o.type = i % 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = (i - 1.5) * 4; o.connect(lp); o.start(); return o; });
		lp.connect(out).connect(ac.destination);
		pad = { out, lp, oscs };
	}
	function swell(phase, sec) {
		if (!pad) return;
		const now = ac.currentTime, g = pad.out.gain, f = pad.lp.frequency;
		g.cancelScheduledValues(now); f.cancelScheduledValues(now);
		g.setValueAtTime(Math.max(0.0001, g.value), now); f.setValueAtTime(f.value, now);
		const target = phase === 0 ? 0.16 : phase === 2 ? 0.03 : g.value;
		const ft = phase === 0 ? 1400 : phase === 2 ? 380 : f.value;
		g.linearRampToValueAtTime(target, now + sec);
		f.linearRampToValueAtTime(ft, now + sec);
	}
	function bell() {
		if (!ac || !pad) return;
		const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
		o.type = "sine"; o.frequency.value = 784;
		g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
		o.connect(g).connect(ac.destination); o.start(now); o.stop(now + 1.7);
	}
	function stopPad() {
		if (!pad) return;
		const p = pad; pad = null;
		const now = ac.currentTime;
		p.out.gain.cancelScheduledValues(now); p.out.gain.setValueAtTime(p.out.gain.value, now); p.out.gain.linearRampToValueAtTime(0.0001, now + 0.8);
		setTimeout(() => p.oscs.forEach((o) => o.stop()), 900);
	}

	/* ---------- the session ---------- */
	let run = null;
	function start() {
		const c = cfg(), pat = (PATTERNS.find((p) => p[0] === c.pattern) || PATTERNS[0])[1];
		stop(true);
		const circle = el("div", { class: "br-circle" }, el("div", { class: "br-core" }));
		const word = el("div", { class: "br-word" }), count = el("div", { class: "br-count" }), left = el("div", { class: "br-left muted" });
		const ov = el("div", { id: "breathe", class: "breathe-ov", role: "dialog", "aria-label": t("brTitle") },
			el("button", { type: "button", class: "icon-btn br-x", "aria-label": t("close"), onclick: () => stop() }, "✕"),
			el("div", { class: "br-stage" }, el("div", { class: "br-ring" }), circle, el("div", { class: "br-text" }, word, count)),
			left);
		document.body.append(ov);
		requestAnimationFrame(() => ov.classList.add("in"));
		if (c.sound) startPad();
		const end = Date.now() + c.min * 60000;
		let phase = -1, phaseEnd = 0, cycles = 0;
		const names = ["brIn", "brHold", "brOut", "brHold"];
		function next() {
			do { phase = (phase + 1) % 4; if (phase === 0) cycles++; } while (!pat[phase]);
			if (phase === 0 && Date.now() >= end) return finish(cycles - 1);
			const sec = pat[phase];
			phaseEnd = Date.now() + sec * 1000;
			word.textContent = t(names[phase]);
			circle.style.transitionDuration = sec + "s";
			circle.classList.toggle("big", phase === 0 || phase === 1);
			ov.dataset.phase = phase;
			if (c.sound) { swell(phase, sec); if (phase !== 0) bell(); }
			run.t = setTimeout(next, sec * 1000);
		}
		function tick() {
			if (!run) return;
			count.textContent = num(Math.max(1, Math.ceil((phaseEnd - Date.now()) / 1000)));
			const s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
			left.textContent = t("brLeft", { t: `${num(Math.floor(s / 60))}:${new Intl.NumberFormat(I18n.locale, { minimumIntegerDigits: 2 }).format(s % 60)}` });
			run.raf = requestAnimationFrame(tick);
		}
		function finish(n) {
			clearTimeout(run.t);
			stopPad();
			ov.querySelector(".br-stage").replaceChildren(el("div", { class: "br-done" }, el("div", { class: "br-done-ic" }, "🌿"), el("strong", {}, t("brDone")), el("p", {}, t("brDoneMsg", { n: num(Math.max(1, n)) }))));
			left.textContent = "";
			H.bump("breaths");
			Fx.fall?.("leaf", 3, null, 0.6);
			run.t = setTimeout(() => stop(), 6000);
		}
		const onKey = (e) => e.key === "Escape" && stop();
		document.addEventListener("keydown", onKey);
		run = { ov, t: 0, raf: 0, onKey };
		setTimeout(next, 600);
		tick();
	}
	function stop(quiet) {
		if (!run) return;
		clearTimeout(run.t); cancelAnimationFrame(run.raf);
		document.removeEventListener("keydown", run.onKey);
		const ov = run.ov; run = null;
		stopPad();
		ov.classList.remove("in");
		setTimeout(() => ov.remove(), quiet ? 0 : 400);
	}

	/* ---------- the card ---------- */
	function cardBody() {
		const c = cfg();
		const pats = el("div", { class: "br-pats" }, ...PATTERNS.map(([id, p]) => el("button", { type: "button", class: "br-pat" + (c.pattern === id ? " on" : ""), onclick: () => { save({ pattern: id }); setTimeout(rebuild, 30); } },
			el("strong", {}, t("brP_" + id)), el("small", { class: "muted" }, p.filter((x, i) => x || i % 2 === 0).map((x) => num(x)).join(" · ")))));
		const mins = el("div", { class: "fun-row" }, el("small", { class: "muted" }, t("brLength")), ...[1, 3, 5, 10].map((m) => el("button", { type: "button", class: "chip-s" + (c.min === m ? " on" : ""), onclick: () => { save({ min: m }); setTimeout(rebuild, 30); } }, t("brMin", { n: num(m) }))));
		return el("div", { class: "fun-breathe" },
			el("div", { class: "br-mini", "aria-hidden": "true" }, el("span")),
			pats, mins,
			el("div", { class: "fun-row" }, el("button", { type: "button", class: "btn", onclick: start }, "🧘 " + t("brStart")), el("span", { class: "grow" }),
				el("label", { class: "g-free" }, el("input", { type: "checkbox", checked: c.sound, onchange: (e) => save({ sound: e.target.checked }) }), " 🔊 " + t("brSound"))));
	}
	let body = cardBody();
	H.funCard("breathe", { icon: "🧘", title: "brTitle", order: 28, body });
	function rebuild() { const nb = cardBody(); body.replaceWith(nb); body = nb; }
	let lang = I18n.lang;
	H.onRefresh(() => { if (I18n.lang !== lang) { lang = I18n.lang; rebuild(); } });
	H.breathe = start;
	window.Breathe = { start, stop, PATTERNS, get running() { return !!run; } };
})();
