/* Break games (fun page): 2048 and Snake. They open when a focus session ends, for the length of the break
 * (the background sets rubi_break), or always if the person chooses. Scores and counts feed the badges. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const hasLocal = () => !!globalThis.chrome?.storage?.local;
	const MIN = 60000;
	let brk = { at: 0, until: 0 };
	let pomo = null;
	const free = () => !!setting("gamesFree", false);
	/** The break the games are open for: the one the background set, or a break running on the timer now. */
	function breakEnd() {
		let end = brk.until || 0;
		if (pomo && pomo.running && pomo.mode !== "focus") end = Math.max(end, (pomo.endAt || 0) + 5 * MIN);
		return end;
	}
	const open = () => free() || Date.now() < breakEnd();
	const two = (n) => new Intl.NumberFormat(I18n.locale, { minimumIntegerDigits: 2, useGrouping: false }).format(n);
	const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${num(Math.floor(s / 60))}:${two(s % 60)}`; };
	const store = {
		get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } },
		set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } },
	};

	async function startFocus() {
		if (!hasLocal()) return;
		const s = (await chrome.storage.local.get("hamyar_pomo")).hamyar_pomo || {};
		const endAt = Date.now() + 25 * MIN;
		await chrome.storage.local.set({ hamyar_pomo: { ...s, mode: "focus", running: true, endAt, remaining: 25 * MIN } });
		chrome.alarms?.create("hamyar-pomo", { when: endAt });
		toast(t("gmFocusStarted"));
	}

	/* ================= 2048 ================= */
	const G = (() => {
		const N = 4;
		let board, tiles, score, best, won, keep, over, moved1, nextId, wrap, layer, pending, scoreEl, bestEl, msgEl;
		const blank = () => Array.from({ length: N }, () => Array(N).fill(null));
		function fresh() {
			board = blank(); tiles = new Map(); score = 0; won = false; keep = false; over = false; moved1 = false; nextId = 1;
			add(); add();
		}
		function add() {
			const empty = [];
			for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!board[r][c]) empty.push([r, c]);
			if (!empty.length) return;
			const [r, c] = empty[Math.floor(Math.random() * empty.length)];
			const tile = { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, born: true };
			board[r][c] = tile; tiles.set(tile.id, tile);
		}
		function canMove() {
			for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
				const x = board[r][c];
				if (!x) return true;
				if (c < N - 1 && board[r][c + 1] && board[r][c + 1].v === x.v) return true;
				if (r < N - 1 && board[r + 1][c] && board[r + 1][c].v === x.v) return true;
			}
			return false;
		}
		/** Slide every tile one way (0 up, 1 right, 2 down, 3 left); equal tiles merge once per move. */
		function move(dir) {
			if (over || (won && !keep)) return;
			flush();
			const v = [[-1, 0], [0, 1], [1, 0], [0, -1]][dir];
			const rows = [0, 1, 2, 3], cols = [0, 1, 2, 3];
			if (v[0] === 1) rows.reverse();
			if (v[1] === 1) cols.reverse();
			let moved = false, top = 0;
			const merged = new Set(), dead = [];
			for (const r of rows) for (const c of cols) {
				const tile = board[r][c];
				if (!tile) continue;
				let nr = r, nc = c, into = null;
				for (;;) {
					const tr = nr + v[0], tc = nc + v[1];
					if (tr < 0 || tr >= N || tc < 0 || tc >= N) break;
					const o = board[tr][tc];
					if (!o) { nr = tr; nc = tc; continue; }
					if (o.v === tile.v && !merged.has(o.id)) into = o;
					break;
				}
				if (into) {
					board[r][c] = null;
					tile.r = into.r; tile.c = into.c; tile.dead = true; dead.push(tile);
					into.v *= 2; into.pop = true; merged.add(into.id);
					score += into.v; top = Math.max(top, into.v);
					moved = true;
				} else if (nr !== r || nc !== c) {
					board[r][c] = null; board[nr][nc] = tile; tile.r = nr; tile.c = nc; moved = true;
				}
			}
			if (!moved) { wrap?.classList.remove("nudge"); void wrap?.offsetWidth; wrap?.classList.add("nudge"); return; }
			if (!moved1) { moved1 = true; H.bump("gamesPlayed"); }
			add();
			if (top) H.setMax("g2048_tile", top);
			if (score > best) { best = score; H.setMax("g2048_best", best); }
			if (top >= 2048 && !won) { won = true; Fx.fireworks(4, "gold"); }
			over = !canMove();
			draw(dead);
			save();
		}
		function flush() {
			if (!pending) return;
			clearTimeout(pending.t);
			pending.run();
		}
		const cls = (v) => "t2048 v" + (v > 2048 ? "big" : v) + (String(v).length > 3 ? " d4" : String(v).length > 2 ? " d3" : "");
		function tileEl(tile) {
			const e = el("div", { class: cls(tile.v) + (tile.born ? " born" : ""), "data-id": tile.id }, el("span", {}, num(tile.v)));
			e.style.setProperty("--r", tile.r); e.style.setProperty("--c", tile.c);
			return e;
		}
		function draw(dead = []) {
			if (!layer) return;
			const have = new Map([...layer.children].map((e) => [+e.dataset.id, e]));
			const show = [...tiles.values()].filter((x) => !x.dead);
			// Move the tiles that slid or merged first; new values and new tiles appear once they arrive.
			for (const tile of [...show, ...dead]) {
				const e = have.get(tile.id);
				if (e) { e.style.setProperty("--r", tile.r); e.style.setProperty("--c", tile.c); }
			}
			const run = () => {
				pending = null;
				dead.forEach((x) => { tiles.delete(x.id); have.get(x.id)?.remove(); });
				for (const tile of show) {
					let e = have.get(tile.id);
					if (!e) { layer.append(tileEl(tile)); tile.born = false; continue; }
					if (tile.pop) {
						e.className = cls(tile.v); void e.offsetWidth; e.classList.add("pop"); e.firstChild.textContent = num(tile.v); tile.pop = false;
					}
				}
				status();
			};
			pending = { run, t: setTimeout(run, 110) };
			scoreEl.textContent = num(score); bestEl.textContent = num(best);
		}
		function status() {
			msgEl.replaceChildren();
			msgEl.hidden = !(over || (won && !keep));
			if (over) msgEl.append(el("strong", {}, t("gmOver")), el("button", { type: "button", class: "btn", onclick: restart }, t("gmNew")));
			else if (won && !keep) msgEl.append(el("strong", {}, t("gmWin")),
				el("div", { class: "fun-row", style: "gap:8px" },
					el("button", { type: "button", class: "btn", onclick: () => { keep = true; status(); save(); } }, t("gmKeep")),
					el("button", { type: "button", class: "btn btn-ghost", onclick: restart }, t("gmNew"))));
		}
		function save() { store.set("rubi_2048", { cells: board.map((row) => row.map((x) => (x ? x.v : 0))), score, won, keep, over, moved1 }); }
		function load() {
			const s = store.get("rubi_2048");
			if (!s || !Array.isArray(s.cells)) return fresh();
			board = blank(); tiles = new Map(); nextId = 1;
			s.cells.forEach((row, r) => row.forEach((v, c) => { if (v) { const x = { id: nextId++, v, r, c }; board[r][c] = x; tiles.set(x.id, x); } }));
			if (!tiles.size) return fresh();
			({ score = 0, won = false, keep = false, over = false, moved1 = false } = s);
		}
		function restart() {
			flush();
			fresh();
			layer.replaceChildren(...[...tiles.values()].map(tileEl));
			tiles.forEach((x) => (x.born = false));
			scoreEl.textContent = num(score);
			status(); save();
		}
		function mount(host) {
			best = (H.funStats().g2048_best) || 0;
			if (!board) load();
			scoreEl = el("b", {}, num(score)); bestEl = el("b", {}, num(best));
			msgEl = el("div", { class: "g-msg", hidden: true });
			layer = el("div", { class: "g2048-tiles" }, ...[...tiles.values()].map(tileEl));
			tiles.forEach((x) => (x.born = false));
			const cells = el("div", { class: "g2048-cells" }, ...Array.from({ length: N * N }, () => el("i")));
			wrap = el("div", { class: "g2048", tabindex: "0", "aria-label": "2048" }, cells, layer, msgEl);
			host.append(
				el("div", { class: "g-bar" },
					el("span", { class: "g-score" }, el("small", {}, t("gmScore")), scoreEl),
					el("span", { class: "g-score" }, el("small", {}, t("gmBestLabel")), bestEl),
					el("span", { class: "grow" }),
					el("button", { type: "button", class: "btn btn-ghost small", onclick: restart }, "↻ " + t("gmNew"))),
				wrap,
				el("p", { class: "muted g-hint" }, t("gm2048Hint")));
			swipe(wrap, move);
			status();
			return wrap;
		}
		const keys = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 };
		function key(e) {
			let k = keys[e.key] ?? keys[e.key.toLowerCase()];
			if (k === undefined) return false;
			// In a right-to-left page the arrows still mean the screen directions.
			move(k);
			return true;
		}
		return { mount, key, move, get over() { return over; }, get score() { return score; }, restart, unmount() { flush(); layer = null; } };
	})();

	/* ================= Snake ================= */
	const S = (() => {
		const N = 16;
		let cv, cx, snake, dir, queue, food, star, score, best, state, timer, eaten, scoreEl, bestEl, msgEl, size = 0, played;
		function reset() {
			const m = Math.floor(N / 2);
			snake = [{ x: m, y: m }, { x: m - 1, y: m }, { x: m - 2, y: m }];
			dir = { x: 1, y: 0 }; queue = []; score = 0; eaten = 0; star = null; state = "ready"; played = false;
			food = spot();
		}
		function spot() {
			for (let i = 0; i < 500; i++) {
				const p = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
				if (!snake.some((s) => s.x === p.x && s.y === p.y) && !(food && food.x === p.x && food.y === p.y)) return p;
			}
			return { x: 0, y: 0 };
		}
		const speed = () => Math.max(65, 150 - score * 2.5);
		function turn(d) {
			const want = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][d];
			const last = queue.length ? queue[queue.length - 1] : dir;
			if (want.x === -last.x && want.y === -last.y) return;
			if (want.x === last.x && want.y === last.y) return;
			if (queue.length < 3) queue.push(want);
			if (state === "ready" || state === "paused") play();
		}
		function play() {
			if (state === "over") reset();
			if (!played) { played = true; H.bump("gamesPlayed"); }
			state = "run"; status();
			clearTimeout(timer); timer = setTimeout(tick, speed());
		}
		function pause() {
			if (state !== "run") return;
			state = "paused"; clearTimeout(timer); status(); drawAll();
		}
		function tick() {
			if (state !== "run") return;
			if (queue.length) dir = queue.shift();
			const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
			const hitWall = head.x < 0 || head.y < 0 || head.x >= N || head.y >= N;
			const grow = head.x === food.x && head.y === food.y;
			const gotStar = star && head.x === star.x && head.y === star.y;
			const body = grow ? snake : snake.slice(0, -1);
			if (hitWall || body.some((s) => s.x === head.x && s.y === head.y)) return end();
			snake.unshift(head);
			if (grow) {
				score += 1; eaten += 1;
				food = spot();
				if (eaten % 5 === 0) { star = spot(); star.until = Date.now() + 7000; }
			} else snake.pop();
			if (gotStar) { score += 3; star = null; burst(head, "gold"); }
			if (star && Date.now() > star.until) star = null;
			if (score > best) best = score;
			scoreEl.textContent = num(score); bestEl.textContent = num(best);
			drawAll();
			timer = setTimeout(tick, speed());
		}
		function burst(p, colors) {
			if (!cv) return;
			const r = cv.getBoundingClientRect(), c = r.width / N;
			Fx.confetti({ x: r.left + (p.x + 0.5) * c, y: r.top + (p.y + 0.5) * c, count: 26, power: 260, spread: 360, colors });
		}
		function end() {
			state = "over"; clearTimeout(timer);
			H.setMax("snake_best", score);
			if (score >= 20) burst(snake[0], "party");
			drawAll(true); status();
		}
		function status() {
			msgEl.replaceChildren();
			msgEl.hidden = state === "run";
			if (state === "over") msgEl.append(el("strong", {}, t("gmSnakeOver")), el("span", {}, t("gmScore") + ": " + num(score)), el("button", { type: "button", class: "btn", onclick: () => { reset(); play(); } }, t("gmNew")));
			else if (state === "paused") msgEl.append(el("strong", {}, t("gmPaused")), el("button", { type: "button", class: "btn", onclick: play }, "▶ " + t("gmPlay")));
			else if (state === "ready") msgEl.append(el("span", {}, t("gmTapStart")), el("button", { type: "button", class: "btn", onclick: play }, "▶ " + t("gmPlay")));
		}
		function fit() {
			if (!cv) return;
			const w = cv.getBoundingClientRect().width || 360, dpr = window.devicePixelRatio || 1;
			if (Math.round(w * dpr) === size) return;
			size = Math.round(w * dpr);
			cv.width = cv.height = size;
			drawAll();
		}
		function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect(x, y, w, h, r); cx.fill(); }
		function drawAll(dead) {
			if (!cx) return;
			const cs = getComputedStyle(cv), acc = cs.getPropertyValue("--accent").trim() || "#2f7d6d";
			const c = size / N;
			cx.clearRect(0, 0, size, size);
			for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
				cx.fillStyle = (x + y) % 2 ? "rgba(127,127,127,0.07)" : "rgba(127,127,127,0.13)";
				cx.fillRect(x * c, y * c, c, c);
			}
			// apple
			const fx = (food.x + 0.5) * c, fy = (food.y + 0.55) * c;
			cx.fillStyle = "#e5484d"; cx.beginPath(); cx.arc(fx, fy, c * 0.38, 0, Math.PI * 2); cx.fill();
			cx.fillStyle = "rgba(255,255,255,0.45)"; cx.beginPath(); cx.arc(fx - c * 0.13, fy - c * 0.12, c * 0.09, 0, Math.PI * 2); cx.fill();
			cx.fillStyle = "#3aa76d"; cx.beginPath(); cx.ellipse(fx + c * 0.1, fy - c * 0.4, c * 0.14, c * 0.07, -0.6, 0, Math.PI * 2); cx.fill();
			if (star) {
				const sx = (star.x + 0.5) * c, sy = (star.y + 0.5) * c, k = 0.85 + 0.15 * Math.sin(Date.now() / 120);
				cx.fillStyle = "#f5b301"; cx.beginPath();
				for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = (i % 2 ? 0.2 : 0.46) * c * k; cx.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad); }
				cx.closePath(); cx.fill();
			}
			// body, from tail to head, getting richer towards the head
			const n = snake.length;
			for (let i = n - 1; i >= 0; i--) {
				const s = snake[i], k = i / Math.max(1, n - 1);
				cx.globalAlpha = 1 - k * 0.45;
				cx.fillStyle = dead ? "#8a8f98" : acc;
				const pad = i === 0 ? c * 0.04 : c * (0.1 + k * 0.06);
				rr(s.x * c + pad, s.y * c + pad, c - pad * 2, c - pad * 2, c * 0.32);
			}
			cx.globalAlpha = 1;
			const h = snake[0], hx = (h.x + 0.5) * c, hy = (h.y + 0.5) * c;
			const px = -dir.y, py = dir.x; // perpendicular to the way it faces
			for (const sgn of [-1, 1]) {
				const ex = hx + dir.x * c * 0.14 + px * sgn * c * 0.2, ey = hy + dir.y * c * 0.14 + py * sgn * c * 0.2;
				cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(ex, ey, c * 0.13, 0, Math.PI * 2); cx.fill();
				cx.fillStyle = "#111"; cx.beginPath();
				if (dead) { cx.fillRect(ex - c * 0.08, ey - c * 0.015, c * 0.16, c * 0.03); }
				else { cx.arc(ex + dir.x * c * 0.04, ey + dir.y * c * 0.04, c * 0.065, 0, Math.PI * 2); cx.fill(); }
			}
		}
		let starTimer = 0;
		function mount(host) {
			best = (H.funStats().snake_best) || 0;
			if (!snake || state === "run") reset();
			scoreEl = el("b", {}, num(score)); bestEl = el("b", {}, num(best));
			msgEl = el("div", { class: "g-msg" });
			cv = el("canvas", { class: "snake-cv", "aria-label": t("gmSnake") });
			cx = cv.getContext("2d");
			const box = el("div", { class: "snake-box", tabindex: "0" }, cv, msgEl);
			const pad = el("div", { class: "snake-pad", "aria-hidden": "true" },
				...[["▲", 0, "u"], ["◀", 3, "l"], ["▶", 1, "r"], ["▼", 2, "d"]].map(([s, d, c]) => el("button", { type: "button", class: "icon-btn " + c, tabindex: "-1", onpointerdown: (e) => { e.preventDefault(); turn(d); } }, s)));
			host.append(
				el("div", { class: "g-bar" },
					el("span", { class: "g-score" }, el("small", {}, t("gmScore")), scoreEl),
					el("span", { class: "g-score" }, el("small", {}, t("gmBestLabel")), bestEl),
					el("span", { class: "grow" }),
					el("button", { type: "button", class: "btn btn-ghost small", onclick: () => (state === "run" ? pause() : play()) }, "⏯")),
				box, pad,
				el("p", { class: "muted g-hint" }, t("gmSnakeHint")));
			swipe(box, turn);
			requestAnimationFrame(fit);
			window.addEventListener("resize", fit);
			starTimer = setInterval(() => star && state === "run" && drawAll(), 120);
			status();
			return box;
		}
		function key(e) {
			const k = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3 }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
			if (k !== undefined) { turn(k); return true; }
			if (e.key === " " || e.key === "p") { state === "run" ? pause() : play(); return true; }
			return false;
		}
		function unmount() { pause(); clearInterval(starTimer); window.removeEventListener("resize", fit); cv = cx = null; size = 0; }
		return { mount, key, unmount, turn, pause, get state() { return state; }, get score() { return score; }, get snake() { return snake; } };
	})();

	/** Swipes on a touch screen or with the mouse, as directions (0 up, 1 right, 2 down, 3 left). */
	function swipe(node, fn) {
		let sx = 0, sy = 0, on = false;
		node.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; on = true; sx = e.clientX; sy = e.clientY; node.focus({ preventScroll: true }); });
		node.addEventListener("pointerup", (e) => {
			if (!on) return;
			on = false;
			const dx = e.clientX - sx, dy = e.clientY - sy;
			if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
			fn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
		});
		node.style.touchAction = "none";
	}

	/* ================= the dialog ================= */
	let dlg, which = "2048", grace = false, clock = 0;
	function dialog() {
		if (dlg) return dlg;
		dlg = el("dialog", { id: "gameDialog", class: "dialog game-dlg" });
		// Keys are read on the whole page while the dialog is open, so they work wherever the focus is.
		document.addEventListener("keydown", (e) => {
			if (!dlg.open || !dlg.querySelector(".g2048, .snake-box")) return;
			if (e.ctrlKey || e.metaKey || e.altKey || !open() && !grace) return;
			if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
			const used = which === "2048" ? G.key(e) : S.key(e);
			if (used) { e.preventDefault(); e.stopPropagation(); }
		});
		dlg.addEventListener("close", () => { (which === "2048" ? G : S).unmount(); clearInterval(clock); grace = false; card?.rebuild(); });
		document.body.append(dlg);
		return dlg;
	}
	function openGame(name = which) {
		const d = dialog();
		if (d.open) (which === "2048" ? G : S).unmount();
		which = name;
		render();
		if (!d.open) d.showModal();
		tickClock();
		clearInterval(clock);
		clock = setInterval(tickClock, 1000);
		d.querySelector(".g2048, .snake-box")?.focus({ preventScroll: true });
	}
	function render() {
		const d = dialog();
		const tabs = el("div", { class: "seg g-tabs", role: "tablist" },
			...[["2048", "🔢", "gm2048"], ["snake", "🐍", "gmSnake"]].map(([id, ic, k]) => el("button", { type: "button", role: "tab", class: "seg-btn" + (which === id ? " active" : ""), "aria-selected": String(which === id), onclick: () => openGame(id) }, ic + " " + t(k))));
		const host = el("div", { class: "g-host" });
		const chip = el("span", { class: "chip g-clock" });
		d.replaceChildren(el("div", { class: "dialog-body" },
			el("div", { class: "g-top" }, el("h3", {}, "🎮 " + t("gmTitle")), tabs, el("span", { class: "grow" }), chip,
				el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), title: t("close"), onclick: () => d.close() }, "✕")),
			host));
		if (open() || grace) (which === "2048" ? G : S).mount(host);
		else host.append(locked(false));
		tickClock();
	}
	function locked(over) {
		return el("div", { class: "g-locked" },
			el("div", { class: "g-lock-ic" }, over ? "⏰" : "🔒"),
			el("strong", {}, t(over ? "gmBreakOver" : "gmLockedTitle")),
			el("p", { class: "muted" }, t(over ? "gmBreakOverMsg" : "gmLocked")),
			el("div", { class: "fun-row", style: "gap:8px;justify-content:center" },
				el("button", { type: "button", class: "btn", onclick: () => { startFocus(); dlg?.open && dlg.close(); } }, "🎯 " + t(over ? "gmBackFocus" : "gmStartFocus")),
				over ? el("button", { type: "button", class: "btn btn-ghost", onclick: () => { grace = true; render(); } }, t("gmFinish")) : null),
			over ? null : el("label", { class: "g-free" }, el("input", { type: "checkbox", onchange: (e) => { Store.setSetting("gamesFree", e.target.checked); setTimeout(() => dlg?.open && render(), 50); } }), " " + t("gmFree")));
	}
	function tickClock() {
		if (!dlg?.open) return;
		const chip = dlg.querySelector(".g-clock");
		const left = breakEnd() - Date.now();
		chip.hidden = free() || left <= 0;
		if (!chip.hidden) chip.textContent = "⏳ " + mmss(left);
		// The break ended while playing: offer to go back, or to finish the round being played.
		const playing = dlg.querySelector(".g2048, .snake-box");
		if (playing && !open() && !grace && !dlg.querySelector(".g-locked")) {
			if (which === "snake") S.pause();
			const host = dlg.querySelector(".g-host");
			host.replaceChildren(locked(true));
			(which === "2048" ? G : S).unmount();
		}
		if (grace && (which === "2048" ? G.over : S.state === "over")) grace = false;
	}

	/* ================= break card at the page edge ================= */
	function invite() {
		if (document.getElementById("celebrate") || document.querySelector(".care-card.game-pop")) return;
		const card = el("div", { class: "care-card game-pop", role: "status" },
			el("span", { class: "care-ic" }, "🎮"),
			el("div", { class: "care-body" }, el("strong", {}, t("gmBreakTitle")), el("p", {}, t("gmBreakMsg")),
				el("div", { class: "care-actions" },
					el("button", { type: "button", class: "btn small", onclick: () => { card.remove(); openGame("2048"); } }, "🔢 " + t("gm2048")),
					el("button", { type: "button", class: "btn small", onclick: () => { card.remove(); openGame("snake"); } }, "🐍 " + t("gmSnake")),
					el("button", { type: "button", class: "btn btn-ghost small", onclick: () => card.remove() }, t("gmLater")))),
			el("button", { type: "button", class: "care-x", "aria-label": t("close"), onclick: () => card.remove() }, "✕"));
		$("careStack").append(card);
		requestAnimationFrame(() => card.classList.add("in"));
		Fx.confetti({ x: card.getBoundingClientRect().left + 30, y: card.getBoundingClientRect().top + 10, count: 40, power: 380 });
		setTimeout(() => card.isConnected && (card.classList.add("out"), setTimeout(() => card.remove(), 300)), 60000);
	}
	/** Show the break card once per break, in the tab the person is looking at. */
	function maybeInvite() {
		if (!brk.at || Date.now() > brk.until || document.visibilityState !== "visible") return;
		if (store.get("rubi_break_seen") === brk.at) return;
		store.set("rubi_break_seen", brk.at);
		invite();
	}

	/* ================= the fun page card ================= */
	let card;
	function cardBody() {
		const body = el("div", { class: "fun-games" });
		const status = el("p", { class: "muted g-status" });
		const st = H.funStats();
		const tile = (id, ic, k, best) => el("button", { type: "button", class: "g-tile", onclick: () => openGame(id) },
			el("span", { class: "g-tile-ic" }, ic), el("strong", {}, t(k)), el("small", { class: "muted" }, t("gmBest", { n: num(best || 0) })));
		body.append(
			el("div", { class: "g-tiles" }, tile("2048", "🔢", "gm2048", st.g2048_best), tile("snake", "🐍", "gmSnake", st.snake_best)),
			status,
			el("label", { class: "g-free" }, el("input", { type: "checkbox", checked: free(), onchange: (e) => { Store.setSetting("gamesFree", e.target.checked); setTimeout(refresh, 50); } }), " " + t("gmFree")));
		function refresh() {
			const left = breakEnd() - Date.now();
			body.classList.toggle("locked", !open());
			status.textContent = free() ? t("gmPlayed", { n: num(H.funStats().gamesPlayed || 0) }) : left > 0 ? "⏳ " + t("gmOpenFor", { t: mmss(left) }) : "🔒 " + t("gmLocked");
			body.querySelector(".g-free input").checked = free();
		}
		body.refresh = refresh;
		refresh();
		return body;
	}
	function buildCard() {
		let body = cardBody();
		const c = H.funCard("games", { icon: "🎮", title: "gmTitle", order: 35, body });
		card = {
			el: c,
			refresh: () => body.refresh(),
			rebuild: () => { const nb = cardBody(); body.replaceWith(nb); body = nb; },
		};
		setInterval(() => !$("viewFun").hidden && card.refresh(), 1000);
	}

	buildCard();
	if (hasLocal()) {
		chrome.storage.local.get(["rubi_break", "hamyar_pomo"]).then((r) => {
			brk = r.rubi_break || brk; pomo = r.hamyar_pomo || null;
			card.refresh();
		});
		chrome.storage.onChanged.addListener((ch, area) => {
			if (area !== "local") return;
			if (ch.hamyar_pomo) pomo = ch.hamyar_pomo.newValue || null;
			if (ch.rubi_break && ch.rubi_break.newValue) { brk = ch.rubi_break.newValue; maybeInvite(); }
			card.refresh();
		});
		document.addEventListener("visibilitychange", maybeInvite);
	}
	// Settings change often (every game bumps a counter); redraw the open game only when the language changes.
	let lang = I18n.lang;
	H.onRefresh(() => {
		card.rebuild();
		if (I18n.lang !== lang) { lang = I18n.lang; if (dlg?.open) openGame(which); }
	});
	H.openGame = openGame;
	window.BreakGames = { open, openGame, G, S, invite, breakEnd };
})();
