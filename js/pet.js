/* Virtual pet: off until the person says yes (asked once, or from the fun page). It lives in a corner of the page,
 * grows with finished tasks, habits, focus sessions and journal entries, and is happier when looked after. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	const hasLocal = () => !!globalThis.chrome?.storage?.local;
	const KINDS = ["cat", "dog", "parrot", "rabbit", "fox", "panda", "penguin", "hamster"];
	const FOOD = { cat: "🐟", dog: "🦴", parrot: "🌻", rabbit: "🥕", fox: "🫐", panda: "🎋", penguin: "🐟", hamster: "🌰" };
	const HOUR = 3600000;
	const cfg = () => ({ on: false, kind: "cat", name: "", side: "start", since: 0, fed: 0, petted: 0, treats: 0, sound: true, ...(setting("pet", {}) || {}) });
	const save = (patch) => Store.setSetting("pet", { ...cfg(), ...patch });
	const petName = (c = cfg()) => c.name || t("petN_" + c.kind);
	let focusLog = {};

	/* ---------- growth and mood ---------- */
	const dk = (ts) => H.dayKey(new Date(ts));
	function counts(since) {
		const sDay = dk(since || 0), today = H.dayKey();
		const c = { tasks: 0, habits: 0, focus: 0, journal: 0, todayActs: 0, lastAct: 0 };
		for (const x of Store.list("todo")) if (x.done && x.doneAt >= since) { c.tasks++; if (dk(x.doneAt) === today) c.todayActs++; c.lastAct = Math.max(c.lastAct, x.doneAt); }
		for (const h of Store.list("habit")) for (const [d, n] of Object.entries(h.log || {})) if (d >= sDay && n > 0) { c.habits += Math.min(n, h.target || n); if (d === today) c.todayActs++; }
		for (const [d, n] of Object.entries(focusLog)) if (d >= sDay) { c.focus += n; if (d === today) c.todayActs += n; }
		for (const j of Store.list("journal")) if ((j.date || "") >= sDay) { c.journal++; if (j.date === today) c.todayActs++; }
		return c;
	}
	function stats(c = cfg()) {
		const k = counts(c.since);
		const xp = k.tasks * 10 + k.habits * 6 + k.focus * 12 + k.journal * 8 + (c.treats || 0) * 2;
		const level = Math.min(20, 1 + Math.floor(Math.sqrt(xp / 25)));
		const from = 25 * (level - 1) ** 2, to = 25 * level ** 2;
		const now = Date.now();
		const last = Math.max(k.lastAct, c.fed || 0, c.petted || 0, c.since || 0);
		let joy = 50 + Math.min(30, k.todayActs * 10);
		if (now - (c.fed || 0) < 6 * HOUR) joy += 15;
		if (now - (c.petted || 0) < 3 * HOUR) joy += 10;
		const away = (now - last) / HOUR;
		if (away > 24) joy -= Math.min(40, (away - 24) / 3);
		joy = Math.max(5, Math.min(100, Math.round(joy)));
		const h = new Date().getHours();
		const hungry = now - (c.fed || 0) > 8 * HOUR;
		const mood = (h >= 23 || h < 6) && now - (c.petted || 0) > 60000 ? "sleep" : joy >= 75 ? "happy" : joy >= 45 ? "ok" : "sad";
		return { xp, level, from, to, joy, mood, hungry, k };
	}
	const accOf = (level) => ({ scarf: level >= 3, hat: level >= 5 && level < 10, glasses: level >= 7, crown: level >= 10 });

	/* ---------- drawing ---------- */
	const LOOK = {
		cat: { body: "#f4a259", belly: "#fde6c8", ear: "pointy", inner: "#f7b7a3", tail: "curl", nose: "#e66b80", whisk: true },
		dog: { body: "#c8915c", belly: "#f3e1c7", ear: "floppy", earC: "#8b5a2b", tail: "wag", nose: "#2b2b2b", spot: "#a87140" },
		parrot: { body: "#3bb273", belly: "#f6d743", ear: "crest", tail: "feather", beak: "#f08c2e", wing: "#2a8f5a" },
		rabbit: { body: "#ebe6e1", belly: "#ffffff", ear: "long", inner: "#f6b8c4", tail: "puff", nose: "#e66b80", teeth: true },
		fox: { body: "#ef7d32", belly: "#ffffff", ear: "pointy", inner: "#3a2a20", tail: "bushy", nose: "#2b2b2b", snout: "#fff", whisk: true },
		panda: { body: "#ffffff", belly: "#ffffff", ear: "round", earC: "#2b2b2b", tail: "none", nose: "#2b2b2b", patch: "#2b2b2b", arms: "#2b2b2b" },
		penguin: { body: "#2f3446", belly: "#ffffff", ear: "none", tail: "none", beak: "#f5a524", feet: "#f5a524", flipper: true },
		hamster: { body: "#e8b77f", belly: "#fff3e0", ear: "small", inner: "#f7b7a3", tail: "none", nose: "#e66b80", cheeks: true, whisk: true },
	};
	function svg(kind, mood = "happy", level = 1, extra = "") {
		const L = LOOK[kind] || LOOK.cat, a = accOf(level), dark = "#2b2b2b";
		const p = [];
		p.push('<ellipse class="pet-shadow" cx="60" cy="112" rx="30" ry="5" fill="rgba(0,0,0,.18)"/>');
		// tail (behind)
		if (L.tail === "curl") p.push(`<path class="pet-tail" d="M84 96 C108 98 108 70 96 66" fill="none" stroke="${L.body}" stroke-width="8" stroke-linecap="round"/>`);
		if (L.tail === "wag") p.push(`<path class="pet-tail wag" d="M86 92 Q102 84 100 70" fill="none" stroke="${L.body}" stroke-width="8" stroke-linecap="round"/>`);
		if (L.tail === "bushy") p.push(`<g class="pet-tail"><path d="M82 100 C112 104 116 70 100 62 C104 80 94 90 82 92 Z" fill="${L.body}"/><path d="M100 62 C108 66 110 74 107 80 C103 74 101 68 100 62 Z" fill="#fff"/></g>`);
		if (L.tail === "puff") p.push(`<circle cx="88" cy="100" r="8" fill="#fff"/>`);
		if (L.tail === "feather") p.push(`<g class="pet-tail"><path d="M70 100 L92 122 L84 102 Z" fill="#3a7bd5"/><path d="M66 102 L80 124 L76 104 Z" fill="#e5484d"/></g>`);
		// body
		p.push(`<ellipse cx="60" cy="90" rx="30" ry="24" fill="${L.body}"/>`);
		p.push(`<ellipse cx="60" cy="95" rx="19" ry="16" fill="${L.belly}"/>`);
		if (L.arms) p.push(`<ellipse cx="34" cy="90" rx="8" ry="13" fill="${L.arms}"/><ellipse cx="86" cy="90" rx="8" ry="13" fill="${L.arms}"/>`);
		if (L.flipper) p.push(`<path class="pet-flip" d="M32 80 Q22 96 30 104 Q36 92 36 82 Z" fill="${L.body}"/><path class="pet-flip r" d="M88 80 Q98 96 90 104 Q84 92 84 82 Z" fill="${L.body}"/>`);
		if (L.wing) p.push(`<path class="pet-flip" d="M33 78 Q26 96 40 106 Q40 90 42 80 Z" fill="${L.wing}"/><path class="pet-flip r" d="M87 78 Q94 96 80 106 Q80 90 78 80 Z" fill="${L.wing}"/>`);
		// feet
		const foot = L.feet || (L.arms ? L.arms : L.body);
		p.push(`<ellipse cx="47" cy="111" rx="9" ry="5" fill="${foot}"/><ellipse cx="73" cy="111" rx="9" ry="5" fill="${foot}"/>`);
		if (a.scarf) p.push('<path d="M36 70 Q60 82 84 70 L84 77 Q60 89 36 77 Z" fill="#e5484d"/><path d="M74 76 L80 96 L70 94 L68 78 Z" fill="#c43a3f"/>');
		// ears (behind the head)
		if (L.ear === "pointy") p.push(`<path d="M36 40 L38 12 L58 30 Z" fill="${L.body}"/><path d="M84 40 L82 12 L62 30 Z" fill="${L.body}"/><path d="M40 34 L41 19 L52 29 Z" fill="${L.inner}"/><path d="M80 34 L79 19 L68 29 Z" fill="${L.inner}"/>`);
		if (L.ear === "long") p.push(`<g class="pet-ears"><ellipse cx="46" cy="16" rx="8" ry="22" fill="${L.body}" transform="rotate(-10 46 30)"/><ellipse cx="74" cy="16" rx="8" ry="22" fill="${L.body}" transform="rotate(10 74 30)"/><ellipse cx="46" cy="16" rx="4" ry="16" fill="${L.inner}" transform="rotate(-10 46 30)"/><ellipse cx="74" cy="16" rx="4" ry="16" fill="${L.inner}" transform="rotate(10 74 30)"/></g>`);
		if (L.ear === "round") p.push(`<circle cx="38" cy="30" r="10" fill="${L.earC}"/><circle cx="82" cy="30" r="10" fill="${L.earC}"/>`);
		if (L.ear === "small") p.push(`<circle cx="40" cy="30" r="8" fill="${L.body}"/><circle cx="80" cy="30" r="8" fill="${L.body}"/><circle cx="40" cy="30" r="4.5" fill="${L.inner}"/><circle cx="80" cy="30" r="4.5" fill="${L.inner}"/>`);
		if (L.ear === "crest") p.push(`<path d="M58 26 Q52 8 60 4 Q60 16 64 24 Z" fill="#e5484d"/><path d="M62 26 Q66 10 74 10 Q68 18 66 26 Z" fill="#f5a524"/>`);
		// head
		p.push(`<circle cx="60" cy="50" r="28" fill="${L.body}"/>`);
		if (kind === "penguin") p.push('<path d="M60 30 C44 30 38 44 40 56 C42 70 52 76 60 76 C68 76 78 70 80 56 C82 44 76 30 60 30 Z" fill="#fff"/>');
		if (kind === "parrot") p.push(`<circle cx="60" cy="56" r="18" fill="${L.belly}" opacity=".5"/>`);
		if (L.snout) p.push(`<path d="M40 56 Q60 80 80 56 Q70 66 60 66 Q50 66 40 56 Z" fill="${L.snout}"/>`);
		if (L.spot) p.push(`<ellipse cx="72" cy="42" rx="9" ry="7" fill="${L.spot}" opacity=".7"/>`);
		if (L.ear === "floppy") p.push(`<g class="pet-ears"><path d="M36 34 Q24 40 28 62 Q36 60 40 44 Z" fill="${L.earC}"/><path d="M84 34 Q96 40 92 62 Q84 60 80 44 Z" fill="${L.earC}"/></g>`);
		if (L.patch) p.push(`<ellipse cx="48" cy="50" rx="7" ry="9" fill="${L.patch}" transform="rotate(20 48 50)"/><ellipse cx="72" cy="50" rx="7" ry="9" fill="${L.patch}" transform="rotate(-20 72 50)"/>`);
		if (L.cheeks) p.push(`<circle cx="40" cy="60" r="9" fill="${L.belly}"/><circle cx="80" cy="60" r="9" fill="${L.belly}"/>`);
		// eyes
		const eyeC = L.patch ? "#fff" : dark, glint = L.patch ? dark : "#fff";
		if (mood === "sleep") p.push(`<path d="M43 51 Q48 55 53 51 M67 51 Q72 55 77 51" fill="none" stroke="${eyeC}" stroke-width="2.4" stroke-linecap="round"/>`);
		else {
			p.push(`<g class="pet-look"><g class="pet-eyes"><circle cx="48" cy="50" r="${mood === "happy" ? 5 : 4.5}" fill="${eyeC}"/><circle cx="72" cy="50" r="${mood === "happy" ? 5 : 4.5}" fill="${eyeC}"/><circle cx="49.6" cy="48.3" r="1.6" fill="${glint}"/><circle cx="73.6" cy="48.3" r="1.6" fill="${glint}"/></g></g>`);
			if (mood === "sad") p.push(`<path d="M42 41 L52 44 M78 41 L68 44" stroke="${L.patch ? dark : "#5b4636"}" stroke-width="2" stroke-linecap="round"/>`);
		}
		// blush
		if (mood === "happy" || mood === "sleep") p.push('<circle cx="40" cy="60" r="4.5" fill="#ff7b9c" opacity=".45"/><circle cx="80" cy="60" r="4.5" fill="#ff7b9c" opacity=".45"/>');
		// nose, mouth or beak
		if (L.beak) {
			p.push(kind === "parrot" ? `<path d="M54 56 Q60 52 66 56 Q66 68 58 70 Q62 62 54 56 Z" fill="${L.beak}"/>` : `<path d="M54 58 L66 58 L60 66 Z" fill="${L.beak}"/>`);
		} else {
			p.push(`<path d="M57 58 L63 58 L60 61.5 Z" fill="${L.nose}"/>`);
			const m = mood === "happy" ? "M52 63 Q56 69 60 63 Q64 69 68 63" : mood === "sad" ? "M54 67 Q60 62 66 67" : mood === "sleep" ? "M57 65 Q60 67 63 65" : "M54 64 Q57 66 60 63.5 Q63 66 66 64";
			p.push(`<path d="${m}" fill="none" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`);
			if (kind === "dog" && mood === "happy") p.push('<path d="M57 66 Q60 74 63 66 Z" fill="#ff7b9c"/>');
			if (L.teeth) p.push('<rect x="58" y="63" width="4" height="4" rx="1" fill="#fff" stroke="#ddd" stroke-width=".6"/>');
		}
		if (L.whisk) p.push('<path d="M38 58 L26 56 M38 62 L26 64 M82 58 L94 56 M82 62 L94 64" stroke="rgba(60,40,30,.45)" stroke-width="1.2" stroke-linecap="round"/>');
		// accessories on the head
		if (a.glasses && mood !== "sleep") p.push(`<g fill="none" stroke="${dark}" stroke-width="2"><circle cx="48" cy="50" r="8"/><circle cx="72" cy="50" r="8"/><path d="M56 50 L64 50"/></g>`);
		if (a.hat) p.push('<path d="M48 26 L60 0 L72 26 Z" fill="#7c5cff"/><circle cx="60" cy="1" r="4" fill="#f5b301"/><path d="M50 22 L70 22" stroke="#f5b301" stroke-width="3"/>');
		if (a.crown) p.push('<path d="M44 26 L46 8 L53 18 L60 4 L67 18 L74 8 L76 26 Z" fill="#f5b301" stroke="#d99a00" stroke-width="1.2"/><circle cx="60" cy="14" r="2.6" fill="#e5484d"/>');
		if (mood === "sleep") p.push('<text class="pet-z" x="88" y="22" font-size="14" font-weight="700" fill="#7c8cff">z</text><text class="pet-z two" x="98" y="12" font-size="10" font-weight="700" fill="#7c8cff">z</text>');
		return `<svg class="pet-svg ${kind} ${mood}" viewBox="0 0 120 124" aria-hidden="true">${p.join("")}${extra}</svg>`;
	}

	/* ---------- the pet in the corner ---------- */
	let home, bubbleT = 0, lastLevel = 0, seen = null;
	function place() {
		const c = cfg();
		if (!c.on) { home?.remove(); home = null; return; }
		if (!home) {
			home = el("div", { id: "petHome", class: "pet-home" });
			home.addEventListener("click", (e) => { if (!e.target.closest(".pet-menu")) love(); });
			home.addEventListener("dblclick", (e) => { if (!e.target.closest(".pet-menu")) show(); });
			document.body.append(home);
		}
		const s = stats(c);
		home.classList.toggle("start", c.side === "start");
		home.style.setProperty("--pet-scale", String(0.8 + Math.min(s.level, 15) * 0.035));
		const kindMood = c.kind + s.mood + s.level;
		if (home.dataset.k !== kindMood) {
			home.dataset.k = kindMood;
			home.replaceChildren(
				el("div", { class: "pet-bubble", hidden: true }),
				el("div", { class: "pet-body", title: `${petName(c)} · ${t("petLevel", { n: num(s.level) })}`, role: "button", "aria-label": petName(c) }),
				el("div", { class: "pet-menu" },
					el("button", { type: "button", class: "icon-btn small", title: t("petFeed"), onclick: feed }, FOOD[c.kind]),
					el("button", { type: "button", class: "icon-btn small", title: t("petPet"), onclick: love }, "🤚"),
					el("button", { type: "button", class: "icon-btn small", title: t("petTrick"), onclick: show }, "🎪"),
					el("button", { type: "button", class: "icon-btn small", title: t("petManage"), onclick: () => openDialog() }, "⚙")));
			home.querySelector(".pet-body").innerHTML = svg(c.kind, s.mood, s.level);
		}
		if (s.level > lastLevel && lastLevel) levelUp(s.level);
		lastLevel = s.level;
		H.setMax("petLevel", s.level);
	}
	function say(text, ms = 4200) {
		if (!home) return;
		const b = home.querySelector(".pet-bubble");
		b.textContent = text; b.hidden = false;
		b.classList.remove("in"); void b.offsetWidth; b.classList.add("in");
		clearTimeout(bubbleT);
		bubbleT = setTimeout(() => (b.hidden = true), ms);
	}
	function hop() {
		const b = home?.querySelector(".pet-body");
		if (!b) return;
		b.classList.remove("hop"); void b.offsetWidth; b.classList.add("hop");
	}
	/** The pet's voice, when sounds are on (only after the person does something, never on its own). */
	function voice(what) {
		const c = cfg();
		if (c.sound === false) return;
		PetFx.sound(what || c.kind, stats(c).mood);
	}
	/** A trick of the pet's own kind, with its voice. */
	function show(name) {
		const c = cfg(), b = home?.querySelector(".pet-body");
		if (!b) return;
		stopWalk();
		PetFx.trick(b, c.kind, typeof name === "string" ? name : "");
		voice();
	}
	function hearts() {
		const r = home?.querySelector(".pet-body")?.getBoundingClientRect();
		if (!r) return;
		for (let i = 0; i < 5; i++) {
			const h = el("span", { class: "pet-heart" }, "❤");
			h.style.left = r.left + r.width * (0.25 + Math.random() * 0.5) + "px"; h.style.top = r.top + 10 + "px";
			h.style.animationDelay = i * 0.12 + "s";
			document.body.append(h);
			setTimeout(() => h.remove(), 1600);
		}
	}
	function love() {
		save({ petted: Date.now() });
		hop(); hearts();
		const c = cfg();
		voice(c.kind === "cat" ? "purr" : c.kind);
		say(stats(c).hungry ? t("petHungry", { food: FOOD[c.kind] }) : t(["petLove1", "petLove2", "petLove3"][Math.floor(Math.random() * 3)]));
		setTimeout(place, 60);
	}
	function feed() {
		const c = cfg();
		const fresh = Date.now() - (c.fed || 0) > 2 * HOUR;
		save({ fed: Date.now(), treats: (c.treats || 0) + (fresh ? 1 : 0) });
		hop();
		voice("munch");
		if (fresh) setTimeout(() => voice(), 800);
		const r = home?.querySelector(".pet-body")?.getBoundingClientRect();
		if (r) {
			const f = el("span", { class: "pet-food" }, FOOD[c.kind]);
			f.style.left = r.left + r.width / 2 + "px"; f.style.top = r.top + "px";
			document.body.append(f);
			setTimeout(() => f.remove(), 1100);
		}
		say(fresh ? t("petThanks") : t("petFull"));
		setTimeout(place, 60);
		dialogRefresh();
	}
	function levelUp(n) {
		setTimeout(() => show("flip"), 50);
		voice("chime");
		say(t("petGrew", { n: num(n) }), 6000);
		const r = home?.querySelector(".pet-body")?.getBoundingClientRect();
		if (r) Fx.confetti({ x: r.left + r.width / 2, y: r.top, count: 70, power: 420, colors: "party" });
	}
	/** React when something good happens: a task done, a habit checked, a focus session or a journal entry. */
	function react() {
		const c = cfg();
		if (!c.on) return;
		const k = counts(c.since);
		if (seen) {
			const msg = k.tasks > seen.tasks ? "petTask" : k.habits > seen.habits ? "petHabit" : k.focus > seen.focus ? "petFocus" : k.journal > seen.journal ? "petJournal" : "";
			if (msg) { show(); say(t(msg)); }
		}
		seen = k;
	}
	function greet() {
		const c = cfg();
		if (!c.on || !home) return;
		const s = stats(c);
		const last = Math.max(c.fed || 0, c.petted || 0);
		const msg = s.mood === "sleep" ? t("petSleepy") : s.hungry ? t("petHungry", { food: FOOD[c.kind] }) : Date.now() - last > 48 * HOUR ? t("petMiss") : t("petHi", { name: setting("name", "") || "" }).replace(/\s+!/, "!");
		setTimeout(() => say(msg), 1800);
	}

	/* ---------- a life of its own: looks at the pointer, walks about, does tricks now and then ---------- */
	const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
	let walkT = 0;
	function walk() {
		if (!home || still()) return;
		const r = home.getBoundingClientRect();
		const toCenter = r.left + r.width / 2 < innerWidth / 2 ? 1 : -1;
		const dist = Math.min(260, innerWidth * 0.18);
		home.style.setProperty("--walk", toCenter * dist + "px");
		home.classList.remove("walking"); void home.offsetWidth; home.classList.add("walking");
		clearTimeout(walkT);
		walkT = setTimeout(stopWalk, 7000);
	}
	function stopWalk() { clearTimeout(walkT); home?.classList.remove("walking"); }
	function idle() {
		const c = cfg();
		if (!c.on || !home || document.hidden || home.matches(":hover") || still() || document.querySelector("dialog[open]")) return;
		if (stats(c).mood === "sleep") return;
		const r = Math.random();
		if (r < 0.35) walk();
		else if (r < 0.75) PetFx.trick(home.querySelector(".pet-body"), c.kind);
	}
	(function loop() { setTimeout(() => { idle(); loop(); }, 14000 + Math.random() * 16000); })();
	let lookRaf = 0, lastX = 0, lastY = 0;
	document.addEventListener("pointermove", (e) => {
		lastX = e.clientX; lastY = e.clientY;
		if (lookRaf || !home) return;
		lookRaf = requestAnimationFrame(() => {
			lookRaf = 0;
			const g = home?.querySelector(".pet-look"), svgEl = home?.querySelector(".pet-svg");
			if (!g || !svgEl) return;
			const b = svgEl.getBoundingClientRect();
			const cx = b.left + b.width / 2, cy = b.top + b.height * 0.4;
			const dx = lastX - cx, dy = lastY - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
			g.style.transform = `translate(${((dx / d) * 2.6 * k).toFixed(2)}px, ${((dy / d) * 2.2 * k).toFixed(2)}px)`;
		});
	}, { passive: true });

	/* ---------- adopt and manage ---------- */
	let dlg, pick = null;
	function openDialog() {
		if (!dlg) {
			dlg = el("dialog", { id: "petDialog", class: "dialog pet-dlg" });
			document.body.append(dlg);
		}
		pick = null;
		renderDialog();
		if (!dlg.open) dlg.showModal();
	}
	function dialogRefresh() { if (dlg?.open) renderDialog(); }
	function renderDialog() {
		const c = cfg(), on = c.on;
		const kind = pick || c.kind;
		const s = stats(c);
		const name = el("input", { type: "text", maxlength: "24", value: c.name && kind === c.kind ? c.name : "", placeholder: t("petN_" + kind) });
		const kinds = el("div", { class: "pet-kinds", role: "radiogroup" }, ...KINDS.map((k) => {
			const b = el("button", { type: "button", role: "radio", "aria-checked": String(k === kind), class: "pet-kind" + (k === kind ? " on" : ""), onclick: () => { pick = k; renderDialog(); } });
			b.innerHTML = svg(k, "happy", on && k === c.kind ? s.level : 1);
			b.append(el("span", {}, t("petK_" + k)));
			return b;
		}));
		const snd = el("input", { type: "checkbox", checked: c.sound !== false });
		const side = el("select", {}, el("option", { value: "start" }, t("petSideStart")), el("option", { value: "end" }, t("petSideEnd")));
		side.value = c.side;
		const body = el("div", { class: "dialog-body" },
			el("div", { class: "fun-row", style: "align-items:center;gap:8px" }, el("h3", { class: "grow" }, "🐾 " + t(on ? "petManage" : "petAdoptTitle")),
				el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => dlg.close() }, "✕")),
			on ? meter(c, s) : el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("petIntro")),
			el("strong", {}, t("petChoose")), kinds,
			el("div", { class: "pet-fields" }, el("label", {}, t("petName"), name), el("label", {}, t("petSide"), side)),
			el("label", { class: "g-free" }, snd, " 🔊 " + t("petSound")),
			el("p", { class: "muted small", style: "margin:0" }, t("petHow")),
			el("div", { class: "dialog-actions" },
				on ? el("button", { type: "button", class: "btn btn-ghost", onclick: () => { save({ on: false }); place(); dlg.close(); H.toast(t("petBye", { name: petName(c) })); card?.rebuild(); } }, t("petOff")) : el("span"),
				el("span", { class: "grow" }),
				el("button", { type: "button", class: "btn", onclick: () => {
					const nc = { ...cfg(), on: true, kind, name: name.value.trim(), side: side.value, sound: snd.checked };
					// Growth counts from the first adoption and stays when the pet is changed or turned off and on.
					if (!c.since) nc.since = Date.now();
					Store.setSetting("pet", nc);
					markAsked();
					dlg.close();
					seen = null; lastLevel = 0;
					setTimeout(() => { place(); react(); if (!on) { hop(); say(t("petHello", { name: petName(nc) }), 6000); const r = home?.getBoundingClientRect(); r && Fx.confetti({ x: r.left + r.width / 2, y: r.top, count: 60, power: 380 }); } card?.rebuild(); }, 80);
				} }, on ? t("save") : "🐾 " + t("petAdopt"))));
		dlg.replaceChildren(body);
	}
	function meter(c, s) {
		const pct = Math.round(((s.xp - s.from) / Math.max(1, s.to - s.from)) * 100);
		return el("div", { class: "pet-meter" },
			el("div", { class: "pet-meter-row" }, el("span", {}, "⭐ " + t("petLevel", { n: num(s.level) })), el("span", { class: "bar" }, el("i", { style: `width:${pct}%` })), el("small", { class: "muted" }, `${num(s.xp)} / ${num(s.to)}`)),
			el("div", { class: "pet-meter-row" }, el("span", {}, (s.joy >= 75 ? "😊 " : s.joy >= 45 ? "🙂 " : "🥺 ") + t("petJoy")), el("span", { class: "bar joy" }, el("i", { style: `width:${s.joy}%` })), el("small", { class: "muted" }, num(s.joy) + (I18n.lang === "fa" ? "٪" : "%"))),
			el("small", { class: "muted" }, t("petFrom", { t: num(s.k.tasks), h: num(s.k.habits), f: num(s.k.focus), j: num(s.k.journal) })));
	}

	/* ---------- invitation, asked once ---------- */
	function asked() {
		try { if (localStorage.getItem("rubi_pet_asked")) return true; } catch {}
		return !!setting("petAsked", false) || cfg().on || cfg().since;
	}
	function markAsked() {
		try { localStorage.setItem("rubi_pet_asked", "1"); } catch {}
		Store.setSetting("petAsked", true);
	}
	function invite() {
		if (asked() || document.querySelector("dialog[open]") || document.getElementById("celebrate") || H.tourOpen?.() || document.querySelector(".care-card.pet-ask")) return false;
		const row = el("div", { class: "pet-ask-row" }, ...["cat", "dog", "parrot"].map((k) => { const s = el("span"); s.innerHTML = svg(k, "happy"); return s; }));
		const card = el("div", { class: "care-card pet-ask", role: "dialog", "aria-label": t("petAskTitle") },
			el("div", { class: "care-body grow" }, row, el("strong", {}, t("petAskTitle")), el("p", {}, t("petAskMsg")),
				el("div", { class: "care-actions" },
					el("button", { type: "button", class: "btn small", onclick: () => { markAsked(); card.remove(); openDialog(); } }, "🐾 " + t("petAskYes")),
					el("button", { type: "button", class: "btn btn-ghost small", onclick: () => { markAsked(); card.remove(); H.toast(t("petAskLater")); } }, t("petAskNo")))),
			el("button", { type: "button", class: "care-x", "aria-label": t("close"), onclick: () => card.remove() }, "✕"));
		$("careStack").append(card);
		requestAnimationFrame(() => card.classList.add("in"));
		return true;
	}

	/* ---------- the fun page card ---------- */
	let card;
	function cardBody() {
		const c = cfg();
		if (!c.on) {
			const row = el("div", { class: "pet-ask-row big" }, ...["cat", "dog", "parrot", "rabbit"].map((k) => { const s = el("span"); s.innerHTML = svg(k, "happy"); return s; }));
			return el("div", { class: "fun-pet" }, row, el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("petIntro")),
				el("button", { type: "button", class: "btn", onclick: openDialog }, "🐾 " + t("petAdopt")));
		}
		const s = stats(c);
		const pic = el("div", { class: "pet-big", onclick: love, title: t("petPet") });
		pic.innerHTML = svg(c.kind, s.mood, s.level);
		return el("div", { class: "fun-pet on" },
			el("div", { class: "fun-row", style: "gap:14px;align-items:center" }, pic,
				el("div", { class: "grow" }, el("strong", { class: "pet-title" }, petName(c)), el("small", { class: "muted", style: "display:block" }, t("petK_" + c.kind) + " · " + t("petMood_" + s.mood)), meter(c, s))),
			el("div", { class: "fun-row", style: "gap:8px" },
				el("button", { type: "button", class: "btn small", onclick: () => { feed(); card.rebuild(); } }, FOOD[c.kind] + " " + t("petFeed")),
				el("button", { type: "button", class: "btn small", onclick: () => { love(); card.rebuild(); } }, "🤚 " + t("petPet")),
				el("button", { type: "button", class: "btn small", onclick: (e) => { const b = e.target.closest(".fun-pet").querySelector(".pet-big"); PetFx.trick(b, cfg().kind); voice(); } }, "🎪 " + t("petTrick")),
				el("button", { type: "button", class: "btn btn-ghost small", onclick: openDialog }, "⚙ " + t("petManage"))));
	}
	function buildCard() {
		let body = cardBody();
		const c = H.funCard("pet", { icon: "🐾", title: "petTitle", order: 45, body });
		card = { el: c, rebuild() { const nb = cardBody(); body.replaceWith(nb); body = nb; } };
	}

	buildCard();
	H.onRefresh(() => { place(); react(); card.rebuild(); dialogRefresh(); });
	if (hasLocal()) {
		chrome.storage.local.get("kamyar_pomo_log").then((r) => { focusLog = r.kamyar_pomo_log || {}; place(); react(); card.rebuild(); greet(); });
		chrome.storage.onChanged.addListener((ch, area) => {
			if (area === "local" && ch.kamyar_pomo_log) { focusLog = ch.kamyar_pomo_log.newValue || {}; place(); react(); card.rebuild(); }
		});
	} else { place(); react(); }
	setInterval(place, 5 * 60000);
	// Ask once, a little after the page settles, and never on the very first visit (setup and the tour come first).
	setTimeout(function tryAsk() {
		if (asked()) return;
		try { if (!localStorage.getItem("kamyar_setup_done")) return; } catch { return; }
		if (!invite()) setTimeout(tryAsk, 20000);
	}, 9000);
	H.openPet = openDialog;
	window.Pet = { svg, stats, invite, openDialog, place, KINDS, say, feed, love, show, walk };
})();
