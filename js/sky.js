/* Sky and stars (fun page): the moon tonight and its next phases, the coming eclipses and meteor showers,
 * and, for fun, the star sign from your birthday with a daily horoscope and the Persian animal year. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	const D = window.SkyData;
	const SYN = 29.530588853;
	const DAY = 864e5;
	const txt = () => D.text[I18n.lang] || D.text.en;
	const both = (d) => {
		const [a, b] = H.calOrder();
		return { main: H.fmtDate(d, a, false), alt: H.fmtDate(d, b === "islamic-umalqura" ? "gregory" : b, false) };
	};
	const daysTo = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(new Date().setHours(0, 0, 0, 0))) / DAY);
	const inDays = (n) => (n === 0 ? t("histToday") : n === 1 ? t("skyTomorrow") : t("celeInDays", { n: num(n) }));

	/** The moon as a picture: the lit part follows its age (northern sky: waxing is lit on the right). */
	function moonSvg(frac, size = 84) {
		const r = 40, cx = 50, cy = 50, k = Math.cos(2 * Math.PI * frac), right = frac < 0.5;
		const s1 = right ? 1 : 0, s2 = right ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
		const lit = `M${cx} ${cy - r} A${r} ${r} 0 0 ${s1} ${cx} ${cy + r} A${Math.abs(k) * r} ${r} 0 0 ${s2} ${cx} ${cy - r} Z`;
		return `<svg class="moon-svg" viewBox="0 0 100 100" style="width:${size}px;height:${size}px" aria-hidden="true"><defs><radialGradient id="mg" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#e9dfb8"/></radialGradient></defs><circle cx="50" cy="50" r="44" fill="rgba(255,240,180,.12)"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#2a3048"/><path d="${lit}" fill="url(#mg)"/><g fill="rgba(120,110,80,.18)"><circle cx="38" cy="38" r="6"/><circle cx="60" cy="58" r="8"/><circle cx="56" cy="30" r="4"/><circle cx="34" cy="62" r="4"/></g></svg>`;
	}

	/** The coming sky events: meteor showers this year and next, and the eclipses in the list. */
	function events(from = new Date()) {
		const out = [];
		const today = new Date(from); today.setHours(0, 0, 0, 0);
		for (const y of [from.getFullYear(), from.getFullYear() + 1])
			for (const [k, m, d, zhr] of D.showers) {
				const at = new Date(y, m - 1, d, 12);
				if (at >= today) out.push({ at, icon: "🌠", name: t("skyShower_" + k), sub: t("skyShowerSub", { n: num(zhr) }) });
			}
		for (const [day, kind, note] of D.eclipses) {
			const at = new Date(day + "T12:00:00Z");
			if (at >= today) out.push({ at, icon: /Lunar|penumbral/.test(kind) ? "🌘" : "🌒", name: t("skyEcl_" + kind), sub: note ? t(note) : "" });
		}
		return out.sort((a, b) => a.at - b.at);
	}

	/* ---------- the sky card ---------- */
	function skyBody() {
		const now = new Date(), m = H.moon(now), frac = m.age / SYN;
		const pic = el("div", { class: "sky-moon" });
		pic.innerHTML = moonSvg(frac);
		const len = H.dayLength?.(now);
		const tile = (icon, title, sub) => el("div", { class: "sky-mini" }, el("span", { class: "sky-mini-ic" }, icon), el("div", {}, el("strong", {}, title), el("small", { class: "muted" }, sub)));
		const nf = both(m.nextFull), nn = both(m.nextNew);
		const list = el("ul", { class: "sky-list" }, ...events(now).slice(0, 5).map((e) => {
			const n = daysTo(e.at), d = both(e.at);
			return el("li", {}, el("span", { class: "sky-ev-ic" }, e.icon),
				el("div", { class: "grow" }, el("strong", {}, e.name), el("small", { class: "muted" }, `${d.main} · ${d.alt}`), e.sub ? el("small", { class: "sky-sub" }, e.sub) : ""),
				el("span", { class: "chip-s" }, inDays(n)));
		}));
		return el("div", { class: "fun-sky" },
			el("div", { class: "sky-now" }, pic,
				el("div", { class: "grow" },
					el("strong", { class: "sky-moon-name" }, H.moonName(m.idx)),
					el("small", { class: "muted", style: "display:block" }, t("moonLit", { n: num(Math.round(m.illum * 100)) }) + " · " + t("skyAge", { n: num(Math.floor(m.age)) })),
					el("div", { class: "sky-minis" },
						tile("🌕", t("skyNextFull"), `${nf.main} · ${inDays(daysTo(m.nextFull))}`),
						tile("🌑", t("skyNextNew"), `${nn.main} · ${inDays(daysTo(m.nextNew))}`),
						len ? tile("🌅", H.hmLen(len.len), `${Prayer.hm(len.rise)} – ${Prayer.hm(len.set)}`) : ""))),
			el("strong", { class: "sky-h" }, "🔭 " + t("skyComing")),
			list,
			el("small", { class: "muted" }, t("skyTip")));
	}

	/* ---------- horoscope ---------- */
	function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
	/** A small seeded random generator, so a sign gets the same reading all day. */
	function rng(seed) { let x = seed || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
	function birth() {
		const bd = setting("birthday", "");
		if (!bd || !bd.date) return null;
		const d = new Date(bd.date + "T12:00:00");
		return isNaN(d) ? null : d;
	}
	/** The sun's sign at a date: the Persian months follow the signs exactly. */
	const signOf = (d) => H.jparts(d).month - 1;
	const animalOf = (jy) => (((jy + 5) % 12) + 12) % 12;
	function reading(sign, d = new Date()) {
		const T = txt(), r = rng(hash(H.dayKey(d) + ":" + sign));
		const pick = (a) => a[Math.floor(r() * a.length)];
		const color = pick(D.colors);
		return { gen: pick(T.gen), love: pick(T.love), work: pick(T.work), lucky: 1 + Math.floor(r() * 99), color, stars: 3 + Math.floor(r() * 3) };
	}
	let chosen = null;
	function astroBody() {
		const b = birth();
		const T = txt();
		const sign = chosen ?? (b ? signOf(b) : setting("astroSign", null));
		const body = el("div", { class: "fun-astro" });
		const select = el("select", { class: "astro-pick", "aria-label": t("skySign"), onchange: (e) => { chosen = +e.target.value; if (!b) Store.setSetting("astroSign", chosen); card2.rebuild(); } },
			...T.signs.map((n, i) => el("option", { value: String(i) }, `${"♈♉♊♋♌♍♎♏♐♑♒♓"[i]} ${n}`)));
		if (sign == null) {
			body.append(el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("skyNoBday")),
				el("div", { class: "fun-row" }, el("button", { type: "button", class: "btn small", onclick: () => H.settingsSection("profile") }, "🎂 " + t("celeSetBday")), el("span", { class: "muted small" }, t("skyOrPick")), select));
			select.value = "";
			select.prepend(el("option", { value: "", disabled: true, selected: true }, "—"));
			return body;
		}
		select.value = String(sign);
		const rd = reading(sign);
		const jyNow = H.jparts(new Date()).year;
		const mine = b && sign === signOf(b);
		const animal = (jy) => `${D.animals[animalOf(jy)]} ${t("skyAnimal_" + animalOf(jy))}`;
		body.append(
			el("div", { class: "astro-top" },
				el("span", { class: "astro-glyph", "aria-hidden": "true" }, "♈♉♊♋♌♍♎♏♐♑♒♓"[sign]),
				el("div", { class: "grow" },
					el("strong", { class: "astro-name" }, T.signs[sign]),
					el("small", { class: "muted", style: "display:block" }, [t("skyElem_" + D.element[sign]), t("skyRuler", { p: t("skyPlanet_" + D.ruler[sign]) })].join(" · ")),
					el("small", { style: "display:block;margin-top:2px" }, T.traits[sign])),
				select),
			el("ul", { class: "astro-lines" },
				el("li", {}, el("span", {}, "✨"), el("div", {}, el("b", {}, t("skyToday") + " "), rd.gen)),
				el("li", {}, el("span", {}, "💞"), el("div", {}, el("b", {}, t("skyLove") + " "), rd.love)),
				el("li", {}, el("span", {}, "💼"), el("div", {}, el("b", {}, t("skyWork") + " "), rd.work))),
			el("div", { class: "astro-luck" },
				el("span", {}, "🍀 " + t("skyLuckyNum") + " ", el("b", {}, num(rd.lucky))),
				el("span", {}, "🎨 " + t("skyLuckyColor") + " ", el("i", { class: "astro-swatch", style: `background:${rd.color[1]}` }), el("b", {}, t("skyColor_" + rd.color[0]))),
				el("span", { title: t("skyMood") }, "★".repeat(rd.stars) + "☆".repeat(5 - rd.stars))),
			el("div", { class: "astro-years" },
				b && mine ? el("span", {}, t("skyBornYear", { a: animal(H.jparts(b).year) })) : "",
				el("span", {}, t("skyThisYear", { y: new Intl.NumberFormat(I18n.locale, { useGrouping: false }).format(jyNow), a: animal(jyNow) }))),
			el("small", { class: "muted" }, t("skyFunOnly")));
		return body;
	}

	/* ---------- cards ---------- */
	function makeCard(id, opts, build) {
		let body = build();
		const c = H.funCard(id, { ...opts, body });
		return { el: c, rebuild() { const nb = build(); body.replaceWith(nb); body = nb; } };
	}
	const card1 = makeCard("sky", { icon: "🔭", title: "skyTitle", order: 50 }, skyBody);
	const card2 = makeCard("astro", { icon: "✨", title: "skyAstroTitle", order: 55 }, astroBody);
	H.onRefresh(() => { card1.rebuild(); card2.rebuild(); });
	// Once a day, looking at the sky counts towards the stargazer badge.
	function counted() {
		if ($("viewFun").hidden) return;
		let last = "";
		try { last = localStorage.getItem("rubi_astro_day") || ""; } catch {}
		if (last === H.dayKey()) return;
		try { localStorage.setItem("rubi_astro_day", H.dayKey()); } catch {}
		H.bump("astroDays");
	}
	new MutationObserver(counted).observe($("viewFun"), { attributes: true, attributeFilter: ["hidden"] });
	setInterval(() => !$("viewFun").hidden && card1.rebuild(), 30 * 60000);
	window.Sky = { moonSvg, events, reading, signOf, animalOf };
})();
