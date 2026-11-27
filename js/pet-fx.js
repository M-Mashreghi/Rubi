/* Voices and tricks for the virtual pet (js/pet.js). Every sound is made on the fly with Web Audio, so nothing
 * is downloaded; tricks are CSS animations, each animal with its own. */
(function () {
	"use strict";
	let ac = null, master = null;
	function ctx() {
		if (!ac) {
			const A = window.AudioContext || window.webkitAudioContext;
			if (!A) return null;
			ac = new A();
			master = ac.createGain();
			master.gain.value = 0.32;
			master.connect(ac.destination);
		}
		if (ac.state === "suspended") ac.resume();
		return ac;
	}
	/* ---------- small building blocks ---------- */
	function env(g, t0, a, hold, r, peak = 1) {
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(peak, t0 + a);
		g.gain.setValueAtTime(peak, t0 + a + hold);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + r);
	}
	/** An oscillator through a band filter, with a pitch curve: pts = [[time, Hz], …]. */
	function tone(t0, { type = "sawtooth", pts, a = 0.02, hold = 0.1, r = 0.12, peak = 0.8, band, q = 3, vib = 0, vibDepth = 0, low }) {
		const c = ac, o = c.createOscillator(), g = c.createGain();
		o.type = type;
		o.frequency.setValueAtTime(pts[0][1], t0);
		for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t0 + dt);
		let node = o;
		if (vib) {
			const l = c.createOscillator(), lg = c.createGain();
			l.frequency.value = vib; lg.gain.value = vibDepth;
			l.connect(lg).connect(o.frequency); l.start(t0); l.stop(t0 + a + hold + r + 0.05);
		}
		if (band) { const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = band; f.Q.value = q; node.connect(f); node = f; }
		if (low) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = low; node.connect(f); node = f; }
		node.connect(g).connect(master);
		env(g, t0, a, hold, r, peak);
		o.start(t0); o.stop(t0 + a + hold + r + 0.05);
	}
	let noiseBuf = null;
	function noise(t0, { dur = 0.1, type = "bandpass", f = 1500, q = 1, peak = 0.6, a = 0.005, am = 0 }) {
		const c = ac;
		if (!noiseBuf) {
			noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
			const d = noiseBuf.getChannelData(0);
			for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
		}
		const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
		s.buffer = noiseBuf; s.loop = true;
		fl.type = type; fl.frequency.value = f; fl.Q.value = q;
		s.connect(fl).connect(g);
		if (am) {
			const amg = c.createGain(), l = c.createOscillator(), lg = c.createGain();
			amg.gain.value = 0.5; l.frequency.value = am; lg.gain.value = 0.5;
			l.connect(lg).connect(amg.gain); l.start(t0); l.stop(t0 + dur + 0.1);
			g.connect(amg).connect(master);
		} else g.connect(master);
		env(g, t0, a, Math.max(0, dur - a - 0.04), 0.04, peak);
		s.start(t0); s.stop(t0 + dur + 0.05);
	}
	/* ---------- the voices: p = pitch factor (lower when sad) ---------- */
	const VOICE = {
		cat(t, p) { tone(t, { pts: [[0, 520 * p], [0.18, 880 * p], [0.55, 560 * p]], hold: 0.38, r: 0.15, band: 1100, q: 2.5, peak: 0.9, vib: 6, vibDepth: 12 }); },
		purr(t) { noise(t, { dur: 1.3, type: "lowpass", f: 260, q: 0.8, peak: 0.7, a: 0.15, am: 24 }); tone(t, { type: "triangle", pts: [[0, 48], [1.2, 44]], a: 0.15, hold: 0.95, r: 0.2, peak: 0.25, low: 160 }); },
		dog(t, p) {
			for (const dt of [0, 0.24]) {
				tone(t + dt, { type: "square", pts: [[0, 360 * p], [0.05, 420 * p], [0.13, 190 * p]], a: 0.008, hold: 0.06, r: 0.07, band: 900, q: 1.2, peak: 0.9 });
				noise(t + dt, { dur: 0.1, f: 1200, q: 0.9, peak: 0.35 });
			}
		},
		parrot(t, p) {
			tone(t, { type: "sine", pts: [[0, 1700 * p], [0.12, 2600 * p], [0.22, 2100 * p]], a: 0.01, hold: 0.14, r: 0.06, peak: 0.5 });
			tone(t + 0.3, { type: "sine", pts: [[0, 1900 * p], [0.1, 2900 * p]], a: 0.01, hold: 0.08, r: 0.06, peak: 0.5 });
			tone(t + 0.5, { pts: [[0, 950 * p], [0.15, 1250 * p]], hold: 0.12, r: 0.08, band: 2200, q: 2, peak: 0.6, vib: 35, vibDepth: 120 });
		},
		rabbit(t, p) { for (const dt of [0, 0.11, 0.22]) tone(t + dt, { type: "sine", pts: [[0, 2300 * p], [0.06, 2900 * p]], a: 0.005, hold: 0.03, r: 0.04, peak: 0.35 }); },
		fox(t, p) {
			tone(t, { pts: [[0, 700 * p], [0.08, 1350 * p], [0.22, 650 * p]], a: 0.01, hold: 0.12, r: 0.1, band: 1400, q: 2, peak: 0.9 });
			tone(t + 0.3, { pts: [[0, 800 * p], [0.07, 1500 * p], [0.18, 900 * p]], a: 0.01, hold: 0.08, r: 0.08, band: 1500, q: 2, peak: 0.8 });
		},
		panda(t, p) { tone(t, { pts: [[0, 380 * p], [0.25, 460 * p], [0.5, 340 * p]], a: 0.04, hold: 0.36, r: 0.14, band: 850, q: 2.2, peak: 0.9, vib: 8, vibDepth: 22 }); },
		penguin(t, p) {
			tone(t, { type: "square", pts: [[0, 330 * p], [0.2, 300 * p]], a: 0.02, hold: 0.18, r: 0.08, band: 700, q: 1.5, peak: 0.7, vib: 28, vibDepth: 30 });
			tone(t + 0.32, { type: "square", pts: [[0, 420 * p], [0.25, 380 * p]], a: 0.02, hold: 0.22, r: 0.1, band: 800, q: 1.5, peak: 0.7, vib: 28, vibDepth: 30 });
		},
		hamster(t, p) { for (const dt of [0, 0.09, 0.2, 0.29]) tone(t + dt, { type: "sine", pts: [[0, 3000 * p], [0.04, 3600 * p], [0.07, 3100 * p]], a: 0.004, hold: 0.03, r: 0.03, peak: 0.3 }); },
		munch(t) { for (const dt of [0, 0.16, 0.32, 0.5]) noise(t + dt, { dur: 0.07, type: "highpass", f: 2500, q: 0.7, peak: 0.5 }); },
		chime(t) { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, { type: "triangle", pts: [[0, f], [0.3, f]], a: 0.005, hold: 0.05, r: 0.5, peak: 0.5 })); },
		snore(t) { noise(t, { dur: 0.9, type: "lowpass", f: 400, q: 1, peak: 0.35, a: 0.4 }); },
	};
	/** Play a sound: kind is an animal, or munch / purr / chime / snore. mood "sad" lowers the voice. */
	function sound(kind, mood) {
		if (!ctx()) return false;
		const v = VOICE[kind];
		if (!v) return false;
		try { v(ac.currentTime + 0.02, mood === "sad" ? 0.82 : mood === "happy" ? 1.06 : 1); } catch { return false; }
		return true;
	}

	/* ---------- tricks: classes on the pet's body (and its picture) that play a CSS animation ---------- */
	const TRICKS = {
		cat: ["pounce", "stretch", "spin"],
		dog: ["zoomies", "flip", "beg"],
		parrot: ["dance", "flap", "headbang"],
		rabbit: ["binky", "flop", "hophop"],
		fox: ["chase", "pounce", "flip"],
		panda: ["roll", "wobble", "dance"],
		penguin: ["waddle", "slide", "flap"],
		hamster: ["roll", "zoomies", "beg"],
	};
	const LEN = { pounce: 900, stretch: 1400, spin: 900, zoomies: 1500, flip: 900, beg: 1300, dance: 1800, flap: 1200, headbang: 1400, binky: 900, flop: 1600, hophop: 1300, chase: 1600, roll: 1300, wobble: 1400, waddle: 1800, slide: 1600 };
	/** Play a trick on a pet element; name is optional (a random one of the animal's). Returns the trick's name. */
	function trick(node, kind, name) {
		if (!node) return "";
		const list = TRICKS[kind] || TRICKS.cat;
		name = name || list[Math.floor(Math.random() * list.length)];
		node.classList.remove("hop", ...Object.keys(LEN).map((k) => "tr-" + k));
		void node.offsetWidth;
		node.classList.add("tr-" + name);
		clearTimeout(node._trT);
		node._trT = setTimeout(() => node.classList.remove("tr-" + name), LEN[name] || 1200);
		return name;
	}
	window.PetFx = { sound, trick, TRICKS };
})();
