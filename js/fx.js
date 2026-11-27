/* Rubi celebration effects: one full-screen canvas for confetti, fireworks, rising embers, balloons,
 * falling petals, pomegranate seeds, leaves, snow and hearts. Everything is drawn in the page; nothing is
 * downloaded. The loop only runs while something is on screen, and motion is cut down when the system asks
 * for reduced motion. Used by celebrations, badges and the break games. */
(function () {
	"use strict";
	const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
	let cv = null, cx = null, parts = [], emitters = [], raf = 0, last = 0, dpr = 1;
	const W = () => innerWidth, Hh = () => innerHeight;
	const rnd = (a, b) => a + Math.random() * (b - a);
	const pick = (a) => a[(Math.random() * a.length) | 0];

	function canvas() {
		if (cv && cv.isConnected) return;
		cv = document.createElement("canvas");
		cv.className = "fx-canvas";
		cv.setAttribute("aria-hidden", "true");
		document.body.append(cv);
		cx = cv.getContext("2d");
		size();
	}
	function size() {
		if (!cv) return;
		dpr = Math.min(2, devicePixelRatio || 1);
		cv.width = W() * dpr;
		cv.height = Hh() * dpr;
		cx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}
	addEventListener("resize", size);

	const PALETTES = {
		party: ["#ff5d8f", "#ffc93c", "#4ade80", "#38bdf8", "#a78bfa", "#fb923c", "#f472b6"],
		nowruz: ["#22c55e", "#86efac", "#f9a8d4", "#fde047", "#f472b6", "#ffffff"],
		yalda: ["#dc2626", "#b91c1c", "#f87171", "#fbbf24", "#7f1d1d"],
		fire: ["#fde047", "#fb923c", "#f97316", "#ef4444", "#fef3c7"],
		gold: ["#fde68a", "#fbbf24", "#f59e0b", "#fff7d6"],
		cool: ["#e0f2fe", "#bae6fd", "#7dd3fc", "#ffffff"]
	};

	/* ---------- particle kinds ---------- */
	// Each particle: x, y, vx, vy, life, max, and a draw(kind) step. Gravity and drag depend on the kind.
	function confettiPiece(x, y, angle, speed, colors) {
		return { k: "conf", x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rot: rnd(0, 6.28), vr: rnd(-0.3, 0.3), tilt: rnd(0, 6.28), vt: rnd(0.05, 0.18),
			w: rnd(6, 11), h: rnd(9, 16), c: pick(colors), shape: Math.random() < 0.18 ? "circle" : Math.random() < 0.3 ? "ribbon" : "rect", life: 0, max: rnd(2.8, 4.2) };
	}
	function spark(x, y, angle, speed, color, trail = true) {
		return { k: "spark", x, y, px: x, py: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, c: color, life: 0, max: rnd(1, 1.8), trail, r: rnd(1.4, 2.6) };
	}
	function rocket(x, colors) {
		const ty = rnd(Hh() * 0.12, Hh() * 0.42);
		return { k: "rocket", x, y: Hh() + 10, vx: rnd(-40, 40), vy: -Math.sqrt(2 * 520 * (Hh() - ty)), c: pick(colors), colors, life: 0, max: 4, ty };
	}
	function burst(x, y, colors) {
		const n = reduce() ? 24 : rnd(60, 95) | 0, c = pick(colors), c2 = Math.random() < 0.5 ? c : pick(colors);
		const ring = Math.random() < 0.25;
		for (let i = 0; i < n; i++) {
			const a = (i / n) * Math.PI * 2 + rnd(-0.05, 0.05);
			const s = ring ? 260 : rnd(60, 300);
			parts.push(spark(x, y, a, s, i % 2 ? c : c2));
		}
		parts.push({ k: "flash", x, y, life: 0, max: 0.35, c });
	}
	function ember(colors) {
		return { k: "ember", x: rnd(0, W()), y: Hh() + 10, vx: rnd(-20, 20), vy: rnd(-160, -60), c: pick(colors), r: rnd(1.5, 3.8), life: 0, max: rnd(3, 6), wob: rnd(0, 6.28) };
	}
	function faller(kind, colors) {
		return { k: kind, x: rnd(-20, W() + 20), y: -30, vx: rnd(-25, 25), vy: rnd(40, 95), rot: rnd(0, 6.28), vr: rnd(-1.5, 1.5), c: pick(colors), s: rnd(0.7, 1.35), life: 0, max: 30, wob: rnd(0, 6.28), ws: rnd(0.8, 2) };
	}
	function balloon(colors) {
		return { k: "balloon", x: rnd(30, W() - 30), y: Hh() + 60, vx: 0, vy: rnd(-90, -55), c: pick(colors), s: rnd(0.75, 1.25), life: 0, max: 30, wob: rnd(0, 6.28) };
	}

	/* ---------- drawing ---------- */
	function petal(p) {
		cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(p.s, p.s);
		cx.fillStyle = p.c;
		for (let i = 0; i < 5; i++) {
			cx.rotate((Math.PI * 2) / 5);
			cx.beginPath(); cx.ellipse(0, -6, 3.6, 6.2, 0, 0, Math.PI * 2); cx.fill();
		}
		cx.fillStyle = "#fde047"; cx.beginPath(); cx.arc(0, 0, 2.2, 0, Math.PI * 2); cx.fill();
		cx.restore();
	}
	function leaf(p) {
		cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(p.s, p.s);
		cx.fillStyle = p.c;
		cx.beginPath(); cx.moveTo(0, -10); cx.quadraticCurveTo(8, -2, 0, 10); cx.quadraticCurveTo(-8, -2, 0, -10); cx.fill();
		cx.strokeStyle = "rgba(0,0,0,.18)"; cx.lineWidth = 0.8; cx.beginPath(); cx.moveTo(0, -9); cx.lineTo(0, 9); cx.stroke();
		cx.restore();
	}
	function seed(p) {
		cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(p.s, p.s);
		const g = cx.createRadialGradient(-1.5, -2, 0.5, 0, 0, 6);
		g.addColorStop(0, "#ffd1d1"); g.addColorStop(0.35, p.c); g.addColorStop(1, "#5b0b0b");
		cx.fillStyle = g;
		cx.beginPath(); cx.moveTo(0, -6); cx.quadraticCurveTo(5.5, -2, 3.5, 4.5); cx.quadraticCurveTo(0, 7, -3.5, 4.5); cx.quadraticCurveTo(-5.5, -2, 0, -6); cx.fill();
		cx.restore();
	}
	function flake(p) {
		cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot); cx.scale(p.s, p.s);
		cx.strokeStyle = p.c; cx.lineWidth = 1.4; cx.lineCap = "round";
		for (let i = 0; i < 6; i++) { cx.rotate(Math.PI / 3); cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -7); cx.moveTo(0, -4); cx.lineTo(2.5, -6); cx.moveTo(0, -4); cx.lineTo(-2.5, -6); cx.stroke(); }
		cx.restore();
	}
	function heart(p) {
		cx.save(); cx.translate(p.x, p.y); cx.rotate(p.rot * 0.2); cx.scale(p.s, p.s);
		cx.fillStyle = p.c;
		cx.beginPath(); cx.moveTo(0, 4); cx.bezierCurveTo(-9, -3, -5, -10, 0, -5); cx.bezierCurveTo(5, -10, 9, -3, 0, 4); cx.fill();
		cx.restore();
	}
	function drawBalloon(p) {
		cx.save(); cx.translate(p.x, p.y); cx.scale(p.s, p.s);
		cx.strokeStyle = "rgba(120,120,120,.6)"; cx.lineWidth = 1;
		cx.beginPath(); cx.moveTo(0, 26); cx.bezierCurveTo(6, 40, -6, 52, 2, 70); cx.stroke();
		const g = cx.createRadialGradient(-7, -9, 2, 0, 0, 26);
		g.addColorStop(0, "rgba(255,255,255,.85)"); g.addColorStop(0.25, p.c); g.addColorStop(1, p.c);
		cx.fillStyle = g;
		cx.beginPath(); cx.ellipse(0, 0, 19, 24, 0, 0, Math.PI * 2); cx.fill();
		cx.beginPath(); cx.moveTo(-3, 24); cx.lineTo(3, 24); cx.lineTo(0, 29); cx.closePath(); cx.fill();
		cx.restore();
	}

	function step(now) {
		const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
		last = now;
		cx.clearRect(0, 0, W(), Hh());
		for (const e of emitters) {
			e.t += dt;
			e.acc += dt * e.rate;
			while (e.acc >= 1) { e.acc -= 1; e.make(); }
		}
		emitters = emitters.filter((e) => e.t < e.dur);
		const next = [];
		for (const p of parts) {
			p.life += dt;
			if (p.life > p.max) continue;
			const fade = Math.min(1, (p.max - p.life) / 0.6);
			switch (p.k) {
				case "conf": {
					p.vy += 420 * dt; p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.2 * dt;
					p.x += p.vx * dt + Math.sin(p.tilt) * 0.6; p.y += p.vy * dt;
					p.rot += p.vr; p.tilt += p.vt;
					cx.save(); cx.globalAlpha = fade; cx.translate(p.x, p.y); cx.rotate(p.rot); cx.fillStyle = p.c;
					const sy = Math.cos(p.tilt);
					if (p.shape === "circle") { cx.beginPath(); cx.ellipse(0, 0, p.w / 2, (p.w / 2) * Math.abs(sy) + 0.5, 0, 0, 6.28); cx.fill(); }
					else if (p.shape === "ribbon") { cx.strokeStyle = p.c; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(-8, 0); cx.bezierCurveTo(-3, -6 * sy, 3, 6 * sy, 8, 0); cx.stroke(); }
					else cx.fillRect(-p.w / 2, (-p.h / 2) * sy, p.w, p.h * sy || 1);
					cx.restore();
					if (p.y > Hh() + 40) continue;
					break;
				}
				case "rocket": {
					p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
					if (Math.random() < 0.7) parts.push({ k: "spark", x: p.x, y: p.y + 4, px: p.x, py: p.y + 4, vx: rnd(-20, 20), vy: rnd(20, 60), c: "#ffd59e", life: 0, max: 0.5, trail: false, r: 1.2 });
					cx.fillStyle = "#fff7d6"; cx.beginPath(); cx.arc(p.x, p.y, 2.2, 0, 6.28); cx.fill();
					if (p.vy >= -30 || p.y <= p.ty) { burst(p.x, p.y, p.colors); continue; }
					break;
				}
				case "spark": {
					p.px = p.x; p.py = p.y;
					p.vy += 160 * dt; p.vx *= 1 - 1.8 * dt; p.vy *= 1 - 1.8 * dt;
					p.x += p.vx * dt; p.y += p.vy * dt;
					cx.globalAlpha = fade * (0.6 + Math.random() * 0.4);
					cx.strokeStyle = p.c; cx.fillStyle = p.c; cx.lineWidth = p.r;
					if (p.trail) { cx.beginPath(); cx.moveTo(p.px - p.vx * 0.04, p.py - p.vy * 0.04); cx.lineTo(p.x, p.y); cx.stroke(); }
					else { cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, 6.28); cx.fill(); }
					cx.globalAlpha = 1;
					break;
				}
				case "flash": {
					const a = 1 - p.life / p.max;
					const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 90);
					g.addColorStop(0, `rgba(255,255,240,${0.55 * a})`); g.addColorStop(1, "rgba(255,255,255,0)");
					cx.fillStyle = g; cx.fillRect(p.x - 90, p.y - 90, 180, 180);
					break;
				}
				case "ember": {
					p.wob += dt * 3; p.x += (p.vx + Math.sin(p.wob) * 18) * dt; p.y += p.vy * dt; p.vy *= 1 - 0.15 * dt;
					const a = fade * (0.5 + 0.5 * Math.sin(p.life * 9 + p.wob));
					const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.5);
					g.addColorStop(0, p.c); g.addColorStop(1, "rgba(255,120,0,0)");
					cx.globalAlpha = a; cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, p.r * 3.5, 0, 6.28); cx.fill(); cx.globalAlpha = 1;
					break;
				}
				case "balloon": {
					p.wob += dt; p.x += Math.sin(p.wob * 1.3) * 22 * dt; p.y += p.vy * dt;
					drawBalloon(p);
					if (p.y < -120) continue;
					break;
				}
				default: {
					// petals, leaves, seeds, snow, hearts: fall with a gentle sway
					p.wob += dt * p.ws; p.x += (p.vx + Math.sin(p.wob) * 30) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
					cx.globalAlpha = Math.min(1, p.life * 2) * 0.95;
					({ petal, leaf, seed, snow: flake, heart })[p.k](p);
					cx.globalAlpha = 1;
					if (p.y > Hh() + 40) continue;
				}
			}
			next.push(p);
		}
		parts = next;
		if (parts.length || emitters.length) raf = requestAnimationFrame(step);
		else { raf = 0; cx.clearRect(0, 0, W(), Hh()); }
	}
	function run() {
		canvas();
		if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); }
	}
	const pal = (p) => (Array.isArray(p) ? p : PALETTES[p] || PALETTES.party);

	const Fx = {
		PALETTES,
		/** A burst of confetti from a point (defaults: two cannons at the bottom corners). */
		confetti(opts = {}) {
			const colors = pal(opts.colors);
			const n = reduce() ? 40 : opts.count || 160;
			const shoot = (x, y, dir, spread, power) => {
				for (let i = 0; i < n / (opts.x != null ? 1 : 2); i++) parts.push(confettiPiece(x, y, dir + rnd(-spread, spread), rnd(power * 0.45, power), colors));
			};
			if (opts.x != null) shoot(opts.x, opts.y, opts.dir ?? -Math.PI / 2, opts.spread ?? 1.1, opts.power ?? 700);
			else { shoot(0, Hh(), -Math.PI / 3, 0.45, 1050); shoot(W(), Hh(), (-2 * Math.PI) / 3, 0.45, 1050); }
			run();
		},
		/** Confetti raining from the top for a while. */
		shower(sec = 4, colors) {
			const c = pal(colors);
			emitters.push({ t: 0, acc: 0, dur: reduce() ? 1 : sec, rate: 60, make: () => parts.push(confettiPiece(rnd(0, W()), -20, Math.PI / 2 + rnd(-0.4, 0.4), rnd(80, 220), c)) });
			run();
		},
		fireworks(sec = 6, colors) {
			const c = pal(colors || "party");
			if (reduce()) { burst(W() / 2, Hh() / 3, c); run(); return; }
			emitters.push({ t: 0, acc: 0.9, dur: sec, rate: 1.6, make: () => parts.push(rocket(rnd(W() * 0.15, W() * 0.85), c)) });
			run();
		},
		burst(x, y, colors) { burst(x, y, pal(colors)); run(); },
		embers(sec = 8, colors) {
			const c = pal(colors || "fire");
			emitters.push({ t: 0, acc: 0, dur: reduce() ? 1 : sec, rate: 26, make: () => parts.push(ember(c)) });
			run();
		},
		/** kind: petal | leaf | seed | snow | heart */
		fall(kind, sec = 8, colors, rate = 9) {
			const c = pal(colors || (kind === "seed" ? "yalda" : kind === "snow" ? "cool" : kind === "leaf" ? ["#22c55e", "#16a34a", "#84cc16", "#65a30d"] : kind === "heart" ? ["#f43f5e", "#fb7185", "#f472b6"] : ["#fbcfe8", "#f9a8d4", "#fff1f2", "#fce7f3"]));
			emitters.push({ t: 0, acc: 0, dur: reduce() ? 1 : sec, rate, make: () => parts.push(faller(kind, c)) });
			run();
		},
		balloons(n = 14, colors) {
			const c = pal(colors || "party");
			emitters.push({ t: 0, acc: 0, dur: 3, rate: (reduce() ? 4 : n) / 3, make: () => parts.push(balloon(c)) });
			run();
		},
		clear() { parts = []; emitters = []; },
		get busy() { return parts.length > 0 || emitters.length > 0; }
	};
	window.Fx = Fx;
})();
