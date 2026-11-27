/* Voice changer (fun page): record your voice (or open an audio file), then hear it as a robot, a girl, a man,
 * a monster, a cat, an alien, in a cave… Everything is processed in this page with Web Audio; nothing is sent
 * anywhere and the recording is not kept after the page closes. */
(function () {
	"use strict";
	const { el, toast } = H;
	const MAX_SEC = 30;
	let ac = null;
	const actx = () => { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === "suspended") ac.resume(); return ac; };

	/* ---------- sound processing ---------- */
	/** Change the pitch without changing the length: overlapping windowed grains, each read faster or slower. */
	function pitchShift(x, f, sr) {
		if (f === 1) return x.slice();
		const N = Math.round(sr * 0.06), hop = Math.round(N / 4);
		const out = new Float32Array(x.length), norm = new Float32Array(x.length);
		const win = new Float32Array(N);
		for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
		const span = N * f;
		for (let pos = 0; pos + N <= x.length; pos += hop) {
			const start = Math.max(0, Math.min(x.length - span - 1, pos + (N - span) / 2));
			for (let i = 0; i < N; i++) {
				const s = start + i * f, k = Math.floor(s), fr = s - k;
				const v = k + 1 < x.length ? x[k] * (1 - fr) + x[k + 1] * fr : 0;
				out[pos + i] += v * win[i];
				norm[pos + i] += win[i];
			}
		}
		for (let i = 0; i < out.length; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
		return out;
	}
	function curve(amount) {
		const n = 2048, c = new Float32Array(n);
		for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
		return c;
	}
	function impulse(ctx, sec, decay) {
		const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
		return b;
	}
	/** Run samples through a Web Audio graph offline: build(ctx, source) returns the node to listen to. */
	async function render(x, sr, build, tail = 0) {
		const ctx = new OfflineAudioContext(1, x.length + Math.floor(tail * sr), sr);
		const b = ctx.createBuffer(1, x.length, sr);
		b.copyToChannel(x, 0);
		const src = ctx.createBufferSource();
		src.buffer = b;
		build(ctx, src).connect(ctx.destination);
		src.start();
		const r = await ctx.startRendering();
		return r.getChannelData(0);
	}
	const osc = (ctx, type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
	const gain = (ctx, v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
	const filt = (ctx, type, f, q = 0.8, g = 0) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; };
	/** Multiply the voice by a wave (ring modulation): the classic robot and alien sound. */
	function ring(ctx, input, f, type = "sine", mix = 1) {
		const out = gain(ctx, 1), mod = gain(ctx, 0), dry = gain(ctx, 1 - mix), wet = gain(ctx, mix);
		osc(ctx, type, f).connect(mod.gain);
		input.connect(mod).connect(wet).connect(out);
		input.connect(dry).connect(out);
		return out;
	}
	/** A delay line whose time wobbles: vibrato (or a flanger when mixed with the dry voice). */
	function wobble(ctx, input, rate, depth, base = 0.006) {
		const d = ctx.createDelay(0.1); d.delayTime.value = base;
		const l = osc(ctx, "sine", rate), lg = gain(ctx, depth);
		l.connect(lg).connect(d.delayTime);
		input.connect(d);
		return d;
	}
	function tremolo(ctx, input, rate, depth) {
		const g = gain(ctx, 1 - depth / 2), l = osc(ctx, "sine", rate), lg = gain(ctx, depth / 2);
		l.connect(lg).connect(g.gain);
		input.connect(g);
		return g;
	}
	function echo(ctx, input, time, fb, mix) {
		const out = gain(ctx, 1), d = ctx.createDelay(2); d.delayTime.value = time;
		const f = gain(ctx, fb), w = gain(ctx, mix);
		input.connect(out); input.connect(d); d.connect(f).connect(d); d.connect(w).connect(out);
		return out;
	}
	function reverb(ctx, input, sec, decay, mix) {
		const out = gain(ctx, 1), cv = ctx.createConvolver(), w = gain(ctx, mix);
		cv.buffer = impulse(ctx, sec, decay);
		input.connect(gain(ctx, 1 - mix * 0.5)).connect(out);
		input.connect(cv).connect(w).connect(out);
		return out;
	}
	const EFFECTS = [
		["robot", "🤖", (x, sr) => render(x, sr, (c, s) => { const r = ring(c, s, 50, "square", 0.9); const d = echo(c, r, 0.008, 0.55, 0.6); return d; }, 0.2)],
		["girl", "👧", (x, sr) => render(pitchShift(x, 1.42, sr), sr, (c, s) => { const f = filt(c, "highshelf", 3000, 0.7, 4); s.connect(f); return f; })],
		["woman", "👩", (x, sr) => render(pitchShift(x, 1.22, sr), sr, (c, s) => { const f = filt(c, "highshelf", 2500, 0.7, 2); s.connect(f); return f; })],
		["man", "👨", (x, sr) => render(pitchShift(x, 0.78, sr), sr, (c, s) => { const f = filt(c, "lowshelf", 220, 0.7, 5); s.connect(f); return f; })],
		["child", "🧒", (x, sr) => render(pitchShift(x, 1.68, sr), sr, (c, s) => s)],
		["monster", "👹", (x, sr) => render(pitchShift(x, 0.58, sr), sr, (c, s) => { const w = c.createWaveShaper(); w.curve = curve(18); const f = filt(c, "lowpass", 2400); s.connect(w).connect(f); return reverb(c, f, 1.2, 3, 0.25); }, 1.2)],
		["bear", "🐻", (x, sr) => render(pitchShift(x, 0.5, sr), sr, (c, s) => tremolo(c, s, 28, 0.7))],
		["cat", "🐱", (x, sr) => render(pitchShift(x, 1.9, sr), sr, (c, s) => wobble(c, s, 6, 0.0025))],
		["bird", "🐦", (x, sr) => render(pitchShift(x, 2.4, sr), sr, (c, s) => tremolo(c, s, 13, 0.6))],
		["alien", "👽", (x, sr) => render(pitchShift(x, 1.15, sr), sr, (c, s) => { const r = ring(c, s, 420, "sine", 0.55); const w = wobble(c, r, 0.6, 0.004); const m = gain(c, 1); r.connect(m); w.connect(m); return m; })],
		["echo", "🏔️", (x, sr) => render(x, sr, (c, s) => echo(c, s, 0.32, 0.45, 0.6), 2.2)],
		["cave", "🕳️", (x, sr) => render(x, sr, (c, s) => reverb(c, s, 3, 2.2, 0.7), 3)],
		["radio", "📻", (x, sr) => render(x, sr, (c, s) => { const a = filt(c, "highpass", 500), b = filt(c, "lowpass", 3200), w = c.createWaveShaper(); w.curve = curve(6); s.connect(a).connect(b).connect(w); return w; })],
		["phone", "☎️", (x, sr) => render(x, sr, (c, s) => { const a = filt(c, "bandpass", 1500, 1.6); s.connect(a); const g = gain(c, 2.2); a.connect(g); return g; })],
		["reverse", "🔄", (x) => Promise.resolve(x.slice().reverse())],
	];
	function normalize(x) {
		let peak = 0;
		for (const v of x) peak = Math.max(peak, Math.abs(v));
		const k = peak > 0 ? 0.95 / peak : 1;
		const out = new Float32Array(x.length);
		for (let i = 0; i < x.length; i++) out[i] = x[i] * k;
		return out;
	}
	/** 16-bit mono WAV file. */
	function wav(x, sr) {
		const b = new ArrayBuffer(44 + x.length * 2), v = new DataView(b);
		const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
		str(0, "RIFF"); v.setUint32(4, 36 + x.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
		v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
		str(36, "data"); v.setUint32(40, x.length * 2, true);
		for (let i = 0; i < x.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x[i])) * 0x7fff, true);
		return new Blob([b], { type: "audio/wav" });
	}

	/* ---------- the card ---------- */
	let src = null, sr = 44100, out = null, outName = "", player = null, rec = null, recT = 0, used = false;
	const wave = el("canvas", { class: "vc-wave", width: "600", height: "90" });
	const status = el("small", { class: "muted vc-status" }, t("vcHint"));
	const recBtn = el("button", { type: "button", class: "vc-rec", "aria-label": t("vcRecord"), onclick: () => (rec ? stopRec() : startRec()) }, el("span", { class: "vc-dot" }), el("span", { class: "vc-rec-t" }, t("vcRecord")));
	const file = el("input", { type: "file", accept: "audio/*", hidden: true, onchange: (e) => e.target.files[0] && load(e.target.files[0]) });
	const fx = el("div", { class: "vc-fx" }, ...EFFECTS.map(([id, ic]) => el("button", { type: "button", class: "vc-chip", "data-fx": id, disabled: true, onclick: () => apply(id) }, el("span", { class: "vc-ic" }, ic), el("span", { "data-i18n": "vc_" + id }, t("vc_" + id)))));
	const playOrig = el("button", { type: "button", class: "btn btn-ghost small", disabled: true, onclick: () => play(src) }, "▶ ", el("span", { "data-i18n": "vcOriginal" }, t("vcOriginal")));
	const save = el("button", { type: "button", class: "btn btn-ghost small", disabled: true, onclick: download }, "⬇ ", el("span", { "data-i18n": "vcSave" }, t("vcSave")));
	const share = el("button", { type: "button", class: "btn btn-ghost small", disabled: true, onclick: shareIt }, "📤 ", el("span", { "data-i18n": "bdShare" }, t("bdShare")));
	const body = el("div", { class: "fun-voice" },
		el("div", { class: "fun-row", style: "gap:12px" }, recBtn,
			el("div", { class: "grow" }, status, el("div", { class: "fun-row", style: "margin-top:6px" }, el("button", { type: "button", class: "chip-s vc-file", onclick: () => file.click() }, "📂 ", el("span", { "data-i18n": "vcOpen" }, t("vcOpen"))), file))),
		wave, fx,
		el("div", { class: "fun-row" }, playOrig, save, share),
		el("small", { class: "muted" }, "🔒 ", el("span", { "data-i18n": "vcPrivate" }, t("vcPrivate"))));
	H.funCard("voice", { icon: "🎭", title: "vcTitle", order: 60, body });

	function drawWave(x, active) {
		const c = wave.getContext("2d"), w = wave.width, h = wave.height;
		c.clearRect(0, 0, w, h);
		const acc = getComputedStyle(wave).getPropertyValue("--accent").trim() || "#4f7cff";
		c.fillStyle = active ? acc : "rgba(128,128,128,.55)";
		if (!x) return;
		const bars = 120, step = Math.max(1, Math.floor(x.length / bars));
		let peak = 0;
		for (const v of x) peak = Math.max(peak, Math.abs(v));
		for (let i = 0; i < bars; i++) {
			let m = 0;
			for (let j = i * step; j < Math.min(x.length, (i + 1) * step); j += 8) m = Math.max(m, Math.abs(x[j]));
			const bh = Math.max(2, (m / (peak || 1)) * (h - 8));
			c.beginPath(); c.roundRect(i * (w / bars) + 1, (h - bh) / 2, w / bars - 2, bh, 2); c.fill();
		}
	}
	function ready(x, rate) {
		src = normalize(x); sr = rate; out = null; used = false;
		fx.querySelectorAll("button").forEach((b) => { b.disabled = false; b.classList.remove("on"); });
		playOrig.disabled = false; save.disabled = share.disabled = true;
		status.textContent = t("vcReady", { s: H.num(+(src.length / sr).toFixed(1)) });
		drawWave(src, false);
	}
	async function decode(blob) {
		const buf = await actx().decodeAudioData(await blob.arrayBuffer());
		const n = buf.numberOfChannels, x = new Float32Array(buf.length);
		for (let ch = 0; ch < n; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] += d[i] / n; }
		const max = Math.min(x.length, buf.sampleRate * 60);
		return [x.subarray(0, max), buf.sampleRate];
	}
	async function load(f) {
		try { const [x, rate] = await decode(f); ready(x, rate); } catch { toast(t("vcBadFile")); }
	}
	async function startRec() {
		let stream;
		try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
		catch { toast(t("vcNoMic")); return; }
		actx();
		const chunks = [];
		const mr = new MediaRecorder(stream);
		rec = { mr, stream, t0: Date.now() };
		mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
		mr.onstop = async () => {
			stream.getTracks().forEach((x) => x.stop());
			try { const [x, rate] = await decode(new Blob(chunks, { type: mr.mimeType })); ready(x, rate); } catch { toast(t("vcBadFile")); }
		};
		mr.start();
		recBtn.classList.add("on");
		// a live level meter on the waveform while recording
		const an = ac.createAnalyser(); an.fftSize = 1024;
		ac.createMediaStreamSource(stream).connect(an);
		const buf = new Float32Array(an.fftSize), hist = [];
		const tick = () => {
			if (!rec) return;
			an.getFloatTimeDomainData(buf);
			let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v));
			hist.push(m); if (hist.length > 120) hist.shift();
			const c = wave.getContext("2d"), w = wave.width, h = wave.height;
			c.clearRect(0, 0, w, h); c.fillStyle = "#e5484d";
			hist.forEach((v, i) => { const bh = Math.max(2, Math.min(1, v * 1.6) * (h - 8)); c.fillRect(i * (w / 120) + 1, (h - bh) / 2, w / 120 - 2, bh); });
			const s = (Date.now() - rec.t0) / 1000;
			recBtn.querySelector(".vc-rec-t").textContent = "■ " + H.num(Math.floor(s)) + "s";
			if (s >= MAX_SEC) return stopRec();
			recT = requestAnimationFrame(tick);
		};
		tick();
		status.textContent = t("vcRecording");
	}
	function stopRec() {
		if (!rec) return;
		cancelAnimationFrame(recT);
		const r = rec; rec = null;
		if (r.mr.state !== "inactive") r.mr.stop();
		recBtn.classList.remove("on");
		recBtn.querySelector(".vc-rec-t").textContent = t("vcRecordAgain");
	}
	function play(x) {
		if (!x) return;
		try { player?.stop(); } catch {}
		const c = actx(), b = c.createBuffer(1, x.length, sr);
		b.copyToChannel(x, 0);
		player = c.createBufferSource(); player.buffer = b; player.connect(c.destination); player.start();
	}
	async function apply(id) {
		if (!src) return;
		const e = EFFECTS.find((x) => x[0] === id);
		fx.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.fx === id));
		status.textContent = t("vcWorking");
		try {
			out = normalize(await e[2](src, sr));
			outName = id;
			drawWave(out, true);
			play(out);
			save.disabled = share.disabled = false;
			status.textContent = e[1] + " " + t("vc_" + id);
			if (!used) { used = true; H.bump("voice"); }
		} catch { status.textContent = t("vcBadFile"); }
	}
	function download() {
		if (!out) return;
		const a = el("a", { href: URL.createObjectURL(wav(out, sr)), download: `rubi-voice-${outName}.wav` });
		document.body.append(a); a.click(); a.remove();
		setTimeout(() => URL.revokeObjectURL(a.href), 4000);
	}
	async function shareIt() {
		if (!out) return;
		const f = new File([wav(out, sr)], `rubi-voice-${outName}.wav`, { type: "audio/wav" });
		if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f] }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
		download();
	}
	drawWave(null);
	H.onRefresh(() => {
		if (!rec) recBtn.querySelector(".vc-rec-t").textContent = t(src ? "vcRecordAgain" : "vcRecord");
		if (!src && !rec) status.textContent = t("vcHint");
	});
	window.VoiceFx = { EFFECTS, pitchShift, wav, ready, apply, get out() { return out; } };
})();
