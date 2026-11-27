/* Little composer (fun page): play piano, santour or ney from the computer keyboard in a Persian dastgah.
 * The three keyboard rows are three octaves of the chosen dastgah, quarter tones (koron) included, so every key
 * is "in the mode". Melodies can be recorded, played back, kept (they sync like settings) and saved as WAV.
 * All sound is made in the page with Web Audio. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;

	/* ---------- dastgahs: tonic in cents above C4 and the seven steps in cents (50 = a quarter tone) ---------- */
	const DASTGAH = {
		shur: { tonic: -500, steps: [0, 150, 300, 500, 700, 800, 1000] }, // G: A koron, B♭
		mahur: { tonic: 0, steps: [0, 200, 400, 500, 700, 900, 1100] }, // C major-like
		homayun: { tonic: -500, steps: [0, 150, 400, 500, 700, 800, 1000] }, // G: A koron, B natural
		segah: { tonic: 350, steps: [0, 150, 350, 500, 650, 850, 1050] }, // on E koron
		chahargah: { tonic: 0, steps: [0, 150, 400, 500, 700, 850, 1100] }, // C: D koron, A koron
		nava: { tonic: -500, steps: [0, 200, 300, 500, 700, 850, 1000] }, // G: E koron
		rast: { tonic: -700, steps: [0, 200, 400, 500, 700, 900, 1000] }, // F with E♭
		esfahan: { tonic: -500, steps: [0, 200, 300, 500, 700, 800, 1100] }, // G with F♯
	};
	const ORDER = ["shur", "mahur", "homayun", "segah", "chahargah", "nava", "rast", "esfahan"];
	const INSTS = [["santour", "🎶"], ["piano", "🎹"], ["ney", "🎋"]];
	// keyboard rows by physical key, so it works with any layout (Persian too): bottom = low octave
	const ROWS = [["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI"], ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ"], ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM"]];
	let layout = null;
	const KEYCAP = (code) => (layout?.get(code) || code.slice(3)).toUpperCase();
	// note index 0..21: row 2 = 0..6, row 1 = 7..13, row 0 = 14..21
	const noteOfCode = {};
	ROWS[2].forEach((c, i) => (noteOfCode[c] = i));
	ROWS[1].forEach((c, i) => (noteOfCode[c] = 7 + i));
	ROWS[0].forEach((c, i) => (noteOfCode[c] = 14 + i));

	const cfg = () => ({ dg: "shur", inst: "santour", ...(setting("composer", {}) || {}) });
	const save = (p) => Store.setSetting("composer", { ...cfg(), ...p });
	/** Cents above C4 of note n (0..21) in a dastgah; the low row is one octave down. */
	function cents(dg, n) {
		const d = DASTGAH[dg] || DASTGAH.shur;
		return d.tonic - 1200 + Math.floor(n / 7) * 1200 + d.steps[n % 7];
	}
	const freq = (c) => 261.6256 * Math.pow(2, c / 1200);

	/* ---------- note names: solfège in fa/fr, letters in en/de, with koron for a quarter tone down ---------- */
	const NAMES = { fa: ["دو", "ر", "می", "فا", "سل", "لا", "سی"], fr: ["do", "ré", "mi", "fa", "sol", "la", "si"], en: ["C", "D", "E", "F", "G", "A", "B"], de: ["C", "D", "E", "F", "G", "A", "H"] };
	const NAT = [0, 200, 400, 500, 700, 900, 1100];
	function noteName(c) {
		let x = ((c % 1200) + 1200) % 1200, acc = "";
		let i = NAT.indexOf(x);
		if (i < 0) { i = NAT.indexOf(x + 50); if (i >= 0) acc = "koron"; }
		if (i < 0 && x === 600) { i = 3; acc = "sharp"; } // F♯ (Esfahan), not G♭
		if (i < 0) { i = NAT.indexOf(x + 100); if (i >= 0) acc = "flat"; }
		if (i < 0) { i = NAT.indexOf(x - 100); if (i >= 0) acc = "sharp"; }
		const names = NAMES[I18n.lang] || NAMES.en;
		if (I18n.lang === "de" && acc === "flat" && i === 6) return ["B", ""];
		return [names[i] ?? "?", acc];
	}
	const ACC = { koron: "ᵖ", flat: "♭", sharp: "♯", "": "" };

	/* ---------- sound ---------- */
	let ac = null, bus = null;
	function audio() {
		if (!ac) {
			const A = window.AudioContext || window.webkitAudioContext;
			ac = new A();
			bus = master(ac, ac.destination);
		}
		if (ac.state === "suspended") ac.resume();
		return ac;
	}
	function master(ctx, dest) {
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16; comp.ratio.value = 4;
		const g = ctx.createGain(); g.gain.value = 0.8;
		// a little room
		const dl = ctx.createDelay(); dl.delayTime.value = 0.11;
		const fb = ctx.createGain(); fb.gain.value = 0.22;
		const wet = ctx.createGain(); wet.gain.value = 0.18;
		const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3000;
		g.connect(comp); g.connect(dl); dl.connect(lp).connect(fb).connect(dl); lp.connect(wet).connect(comp);
		comp.connect(dest);
		return g;
	}
	let noiseBuf = null;
	function noise(ctx) {
		if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate && noiseBuf._ctx === ctx) return noiseBuf;
		const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
		for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		b._ctx = ctx;
		return (noiseBuf = b);
	}
	/** One note. Returns release(at) for sounds that stop when the key is let go. */
	function voice(ctx, out, inst, f, when, vel = 1) {
		const env = ctx.createGain();
		env.gain.value = 0.0001;
		env.connect(out);
		const oscs = [];
		const osc = (type, fr, amp, dest, detune = 0) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = fr; o.detune.value = detune; g.gain.value = amp; o.connect(g).connect(dest); o.start(when); oscs.push(o); return o; };
		const stopAll = (at) => oscs.forEach((o) => { try { o.stop(at); } catch {} });
		if (inst === "piano") {
			const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = Math.min(9000, f * 7 + 900); lp.connect(env);
			[[1, 1], [2, 0.45], [3, 0.22], [4, 0.12], [5, 0.06], [6, 0.03]].forEach(([h, a]) => osc(h === 1 ? "triangle" : "sine", f * h * (1 + 0.0004 * h * h), a, lp));
			env.gain.setValueAtTime(0.0001, when);
			env.gain.exponentialRampToValueAtTime(0.32 * vel, when + 0.006);
			env.gain.exponentialRampToValueAtTime(0.11 * vel, when + 0.35);
			env.gain.exponentialRampToValueAtTime(0.0001, when + 3.2);
			stopAll(when + 3.3);
			return (at) => { env.gain.cancelAndHoldAtTime?.(at); env.gain.setTargetAtTime(0.0001, at, 0.09); stopAll(at + 0.8); };
		}
		if (inst === "santour") {
			// a course of three slightly out-of-tune metal strings struck by a light hammer (mezrab)
			const bp = ctx.createBiquadFilter(); bp.type = "highshelf"; bp.frequency.value = 2500; bp.gain.value = 4; bp.connect(env);
			for (const dt of [-4, 0, 3.5]) [[1, 1], [2.003, 0.5], [3.01, 0.3], [4.03, 0.16], [5.06, 0.08]].forEach(([h, a]) => osc(h === 1 ? "triangle" : "sine", f * h, a / 3, bp, dt));
			const n = ctx.createBufferSource(); n.buffer = noise(ctx);
			const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = Math.min(8000, f * 6); nf.Q.value = 1.2;
			const ng = ctx.createGain(); ng.gain.setValueAtTime(0.25 * vel, when); ng.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
			n.connect(nf).connect(ng).connect(env); n.start(when); n.stop(when + 0.05);
			env.gain.setValueAtTime(0.0001, when);
			env.gain.exponentialRampToValueAtTime(0.34 * vel, when + 0.003);
			env.gain.exponentialRampToValueAtTime(0.09 * vel, when + 0.5);
			env.gain.exponentialRampToValueAtTime(0.0001, when + 3.6);
			stopAll(when + 3.7);
			return null; // strings ring on
		}
		// ney: breathy, with a slow vibrato that grows in
		const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = f * 5; lp.connect(env);
		const o1 = osc("sine", f, 0.9, lp), o2 = osc("sine", f * 2, 0.18, lp), o3 = osc("triangle", f * 3, 0.05, lp);
		const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, when); lg.gain.linearRampToValueAtTime(9, when + 0.6);
		lfo.connect(lg); [o1, o2, o3].forEach((o) => lg.connect(o.detune)); lfo.start(when); oscs.push(lfo);
		const n = ctx.createBufferSource(); n.buffer = noise(ctx); n.loop = true;
		const nf = ctx.createBiquadFilter(); nf.type = "bandpass"; nf.frequency.value = f * 2; nf.Q.value = 2;
		const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, when); ng.gain.exponentialRampToValueAtTime(0.5, when + 0.05); ng.gain.exponentialRampToValueAtTime(0.12, when + 0.3);
		n.connect(nf).connect(ng).connect(env); n.start(when); oscs.push(n);
		env.gain.setValueAtTime(0.0001, when);
		env.gain.exponentialRampToValueAtTime(0.26 * vel, when + 0.09);
		env.gain.exponentialRampToValueAtTime(0.2 * vel, when + 0.4);
		stopAll(when + 12);
		return (at) => { env.gain.cancelAndHoldAtTime?.(at); env.gain.setTargetAtTime(0.0001, at, 0.08); stopAll(at + 0.6); };
	}
	/** A note held for dur seconds, as heard: santour rolls (riz) on a long note. */
	function playNote(ctx, out, inst, f, when, dur, vel = 1) {
		if (inst === "santour") {
			voice(ctx, out, inst, f, when, vel);
			if (dur > 0.28) for (let t = 0.09, k = 0; t < dur; t += 0.075, k++) voice(ctx, out, inst, f, when + t, vel * (k % 2 ? 0.45 : 0.55));
			return;
		}
		const rel = voice(ctx, out, inst, f, when, vel);
		rel && rel(when + Math.max(0.12, dur));
	}

	/* ---------- live playing ---------- */
	const held = new Map(); // note -> {release, riz, at}
	let rec = null, last = null; // recording: {start, notes:[[t, n, d]]}
	function press(n, vel = 1) {
		if (held.has(n)) return;
		const ctx = audio(), c = cfg(), f = freq(cents(c.dg, n)), now = ctx.currentTime;
		const h = { at: performance.now() };
		h.release = voice(ctx, bus, c.inst, f, now, vel);
		if (c.inst === "santour") h.riz = setTimeout(function roll() { voice(ctx, bus, "santour", f, ctx.currentTime, 0.5); h.riz = setTimeout(roll, 75); }, 280);
		held.set(n, h);
		light(n, true);
	}
	function release(n) {
		const h = held.get(n);
		if (!h) return;
		held.delete(n);
		clearTimeout(h.riz);
		h.release?.(audio().currentTime);
		light(n, false);
		if (rec) rec.notes.push([Math.round(h.at - rec.start), n, Math.round(performance.now() - h.at)]);
	}
	function light(n, on) {
		document.querySelectorAll(`#composerDialog .cmp-key[data-n="${n}"]`).forEach((k) => {
			k.classList.toggle("down", on);
			if (on) { k.classList.remove("ring"); void k.offsetWidth; k.classList.add("ring"); }
		});
	}

	/* ---------- playback, demo and WAV ---------- */
	let playing = [];
	function stopPlay() { playing.forEach(clearTimeout); playing = []; document.querySelectorAll("#composerDialog .cmp-key.down").forEach((k) => k.classList.remove("down")); setState(); }
	function play(tune, onEnd) {
		stopPlay();
		const ctx = audio(), t0 = ctx.currentTime + 0.08;
		const inst = tune.inst || cfg().inst, dg = tune.dg || cfg().dg;
		let end = 0;
		for (const [t, n, d] of tune.notes) {
			playNote(ctx, bus, inst, freq(cents(dg, n)), t0 + t / 1000, d / 1000);
			playing.push(setTimeout(() => light(n, true), t + 80), setTimeout(() => light(n, false), t + 80 + Math.max(120, d)));
			end = Math.max(end, t + d);
		}
		playing.push(setTimeout(() => { playing = []; setState(); onEnd?.(); }, end + 400));
		setState();
	}
	/** A short phrase that shows the colour of the dastgah: up the first five steps, a turn, and home. */
	function demo() {
		const base = 7, seq = [0, 1, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1, 2, 1, 0];
		const lens = [300, 300, 300, 600, 300, 300, 300, 300, 600, 300, 300, 300, 450, 450, 1200];
		let t = 0;
		const notes = seq.map((s, i) => { const r = [t, base + s, lens[i] - 30]; t += lens[i]; return r; });
		play({ notes });
	}
	async function toWav(tune) {
		const sr = 44100, inst = tune.inst, dg = tune.dg;
		const len = Math.max(...tune.notes.map(([t, , d]) => t + d)) / 1000 + 3.8;
		const off = new OfflineAudioContext(1, Math.ceil(len * sr), sr);
		const out = master(off, off.destination);
		for (const [t, n, d] of tune.notes) playNote(off, out, inst, freq(cents(dg, n)), 0.05 + t / 1000, d / 1000);
		const buf = await off.startRendering();
		return wav(buf.getChannelData(0), sr);
	}
	function wav(x, sr) {
		if (window.VoiceFx?.wav) return VoiceFx.wav(x, sr);
		const b = new DataView(new ArrayBuffer(44 + x.length * 2)), s = (o, str) => [...str].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
		s(0, "RIFF"); b.setUint32(4, 36 + x.length * 2, true); s(8, "WAVEfmt "); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
		b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); s(36, "data"); b.setUint32(40, x.length * 2, true);
		for (let i = 0; i < x.length; i++) b.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 32767, true);
		return new Blob([b], { type: "audio/wav" });
	}
	async function download(tune) {
		const blob = await toWav(tune);
		const a = el("a", { href: URL.createObjectURL(blob), download: `Rubi-${tune.dg}-${H.dayKey()}.wav` });
		document.body.append(a); a.click(); a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	}

	/* ---------- tunes kept with the settings ---------- */
	const tunes = () => setting("tunes", []) || [];
	function keep() {
		if (!last || !last.notes.length) return toast(t("cmpEmpty"));
		const c = cfg();
		const tune = { id: Date.now().toString(36), name: t("cmpTuneName", { dg: t("dg_" + c.dg) }), dg: c.dg, inst: c.inst, at: Date.now(), notes: last.notes.slice(0, 600) };
		Store.setSetting("tunes", [tune, ...tunes()].slice(0, 12));
		H.bump("tunes");
		toast(t("cmpSaved"));
	}

	/* ---------- the composer window ---------- */
	let dlg, stateBtns = null;
	function setState() {
		if (!stateBtns) return;
		const { recB, playB, keepB, wavB } = stateBtns;
		recB.classList.toggle("on", !!rec);
		recB.textContent = rec ? "⏹ " + t("cmpStop") : "⏺ " + t("cmpRec");
		playB.disabled = !!rec || !(last && last.notes.length);
		playB.textContent = playing.length ? "⏹ " + t("cmpStop") : "▶ " + t("cmpPlay");
		keepB.disabled = wavB.disabled = !!rec || !(last && last.notes.length);
	}
	function board() {
		const c = cfg();
		const b = el("div", { class: "cmp-board " + c.inst });
		ROWS.forEach((row, r) => {
			const line = el("div", { class: "cmp-row" });
			row.forEach((code) => {
				const n = noteOfCode[code], ce = cents(c.dg, n), [nm, acc] = noteName(ce);
				const k = el("button", { type: "button", class: "cmp-key" + (n % 7 === 0 ? " tonic" : ""), "data-n": n, title: nm + (acc ? " " + t("cmpAcc_" + acc) : "") },
					el("span", { class: "cmp-nm" }, nm, acc ? el("sup", {}, ACC[acc]) : ""), el("kbd", {}, KEYCAP(code)));
				k.addEventListener("pointerdown", (e) => { e.preventDefault(); k.setPointerCapture?.(e.pointerId); press(n); });
				const up = () => release(n);
				k.addEventListener("pointerup", up); k.addEventListener("pointercancel", up); k.addEventListener("lostpointercapture", up);
				line.append(k);
			});
			b.append(line);
		});
		return b;
	}
	function draw() {
		const c = cfg();
		const insts = el("div", { class: "g-tabs" }, ...INSTS.map(([id, ic]) => el("button", { type: "button", class: c.inst === id ? "active" : "", onclick: () => { save({ inst: id }); setTimeout(draw, 30); } }, ic + " " + t("cmpInst_" + id))));
		const dgs = el("div", { class: "cmp-dgs" }, ...ORDER.map((id) => el("button", { type: "button", class: "chip-s" + (c.dg === id ? " on" : ""), onclick: () => { save({ dg: id }); setTimeout(draw, 30); } }, t("dg_" + id))));
		const recB = el("button", { type: "button", class: "btn small cmp-rec", onclick: () => {
			if (rec) { held.forEach((_, n) => release(n)); last = rec; rec = null; if (!last.notes.length) last = null; }
			else { stopPlay(); rec = { start: performance.now(), notes: [] }; }
			setState();
		} });
		const playB = el("button", { type: "button", class: "btn small btn-ghost", onclick: () => (playing.length ? stopPlay() : last && play({ ...last, ...cfg() })) });
		const keepB = el("button", { type: "button", class: "btn small btn-ghost", onclick: keep }, "💾 " + t("cmpSave"));
		const wavB = el("button", { type: "button", class: "btn small btn-ghost", onclick: () => last && download({ ...last, ...cfg() }) }, "⬇ WAV");
		stateBtns = { recB, playB, keepB, wavB };
		dlg.replaceChildren(el("div", { class: "dialog-body" },
			el("div", { class: "fun-row" }, el("h3", { class: "grow" }, "🎼 " + t("cmpTitle")), el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => dlg.close() }, "✕")),
			el("div", { class: "fun-row" }, insts, el("span", { class: "grow" }), el("button", { type: "button", class: "btn small btn-ghost", onclick: demo }, "🎵 " + t("cmpDemo"))),
			dgs,
			el("p", { class: "muted small cmp-mood" }, t("dg_" + c.dg + "_d")),
			board(),
			el("p", { class: "muted small", style: "margin:0" }, "⌨️ " + t("cmpHint") + (c.inst === "santour" ? " " + t("cmpRizHint") : "")),
			el("div", { class: "dialog-actions" }, recB, playB, el("span", { class: "grow" }), keepB, wavB)));
		setState();
	}
	function onKey(e) {
		if (!dlg?.open || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
		const n = noteOfCode[e.code];
		if (n == null) return;
		e.preventDefault();
		if (e.type === "keydown") { if (!e.repeat) press(n); } else release(n);
	}
	function open() {
		if (!dlg) {
			dlg = el("dialog", { id: "composerDialog", class: "dialog composer-dlg" });
			document.body.append(dlg);
			dlg.addEventListener("close", () => { held.forEach((_, n) => release(n)); if (rec) { last = rec; rec = null; } stopPlay(); rebuild(); });
			document.addEventListener("keydown", onKey);
			document.addEventListener("keyup", onKey);
			addEventListener("blur", () => held.forEach((_, n) => release(n)));
		}
		draw();
		if (!dlg.open) dlg.showModal();
		// show the letters of the person's own keyboard layout on the keys
		if (!layout && navigator.keyboard?.getLayoutMap) navigator.keyboard.getLayoutMap().then((m) => { layout = m; if (dlg.open && !held.size) draw(); }).catch(() => {});
	}

	/* ---------- the card ---------- */
	function cardBody() {
		const c = cfg(), list = tunes();
		return el("div", { class: "fun-cmp" },
			el("div", { class: "cmp-hero", "aria-hidden": "true" }, ...[0, 1, 2, 3, 4, 5, 6].map((i) => el("span", { style: `--i:${i}` }))),
			el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("cmpIntro")),
			el("div", { class: "fun-row" }, el("button", { type: "button", class: "btn", onclick: open }, "🎼 " + t("cmpOpen")), el("small", { class: "muted" }, t("dg_" + c.dg) + " · " + t("cmpInst_" + c.inst))),
			list.length ? el("div", {}, el("small", { class: "muted" }, t("cmpTunes")),
				el("ul", { class: "cmp-tunes" }, ...list.map((tu) => el("li", {},
					el("button", { type: "button", class: "icon-btn small", "aria-label": t("cmpPlay"), onclick: () => play(tu) }, "▶"),
					el("div", { class: "grow" }, el("strong", {}, tu.name), el("small", { class: "muted" }, `${t("cmpInst_" + tu.inst)} · ${H.fmtDate(new Date(tu.at), H.calOrder()[0], false)}`)),
					el("button", { type: "button", class: "icon-btn small", title: "WAV", "aria-label": "WAV", onclick: () => download(tu) }, "⬇"),
					el("button", { type: "button", class: "icon-btn small", title: t("delete"), "aria-label": t("delete"), onclick: () => { const all = tunes(); Store.setSetting("tunes", all.filter((x) => x.id !== tu.id)); toast(t("cmpDeleted"), { run: () => Store.setSetting("tunes", all) }); } }, "🗑"))))) : "");
	}
	let body = cardBody();
	H.funCard("composer", { icon: "🎼", title: "cmpTitle", order: 70, body });
	function rebuild() { const nb = cardBody(); body.replaceWith(nb); body = nb; }
	H.onRefresh(() => { rebuild(); if (dlg?.open && !held.size) draw(); });
	H.openComposer = open;
	window.Composer = { open, press, release, play, demo, toWav, cents, freq, noteName, DASTGAH, ORDER, get last() { return last; }, set last(v) { last = v; }, keep };
})();
