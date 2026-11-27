/* Today in history: occasions, events, births and deaths for any day, each shown with its date in both the
 * Persian and the Gregorian calendar; plus the ancient Iranian name of the day, the sky (sun sign, moon phase,
 * day length) and a "did you know" line. Content comes from js/history-data.js, so it works offline. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const D = window.HistoryData;
	const L = () => (I18n.lang === "fa" ? 0 : 1);
	const tx = (s) => { const p = s.split("|"); return p[L()] || p[1] || p[0]; };
	const noon = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
	const addDays = (d, n) => { const x = noon(d); x.setDate(x.getDate() + n); return x; };

	/* ---------- the ancient Iranian calendar: every day of the month had a name ---------- */
	const DAYNAMES = [
		["اورمزد", "Hormozd", "خداوند دانا و خرد", "the wise Lord"], ["بهمن", "Bahman", "اندیشه‌ی نیک", "good thought"], ["اردیبهشت", "Ordibehesht", "بهترین راستی", "best truth"],
		["شهریور", "Shahrivar", "شهریاری نیک", "good rule"], ["سپندارمذ", "Sepandarmaz", "فروتنی و زمین", "humility and the earth"], ["خرداد", "Khordad", "رسایی و کمال", "wholeness"],
		["امرداد", "Amordad", "بی‌مرگی", "immortality"], ["دی‌به‌آذر", "Dey-be-Azar", "آفریدگار", "the Creator"], ["آذر", "Azar", "آتش", "fire"], ["آبان", "Aban", "آب‌ها", "the waters"],
		["خور", "Khor", "خورشید", "the sun"], ["ماه", "Mah", "ماه", "the moon"], ["تیر", "Tir", "ستاره‌ی باران", "the star of rain"], ["گوش", "Goosh", "جهان زنده", "the living world"],
		["دی‌به‌مهر", "Dey-be-Mehr", "آفریدگار", "the Creator"], ["مهر", "Mehr", "پیمان و دوستی", "friendship and promise"], ["سروش", "Soroush", "پیام و فرمانبرداری", "listening"],
		["رشن", "Rashn", "دادگری", "justice"], ["فروردین", "Farvardin", "فروهر نیاکان", "the guardian spirits"], ["ورهرام", "Varahram", "پیروزی", "victory"], ["رام", "Ram", "شادی", "joy"],
		["باد", "Bad", "باد", "the wind"], ["دی‌به‌دین", "Dey-be-Din", "آفریدگار", "the Creator"], ["دین", "Din", "وجدان", "conscience"], ["ارد", "Ard", "توانگری و پاداش", "reward"],
		["اشتاد", "Ashtad", "راستی", "truth"], ["آسمان", "Asman", "آسمان", "the sky"], ["زامیاد", "Zamyad", "زمین", "the earth"], ["مانتره‌سپند", "Manthra-Spand", "گفتار پاک", "the holy word"], ["انارام", "Aneram", "روشنایی بی‌پایان", "endless light"]
	];
	// When the day's name matches the month's, it was a festival.
	const FEASTS = { "1-19": ["فروردینگان", "Farvardingan"], "2-3": ["اردیبهشتگان", "Ordibeheshtgan"], "3-6": ["خردادگان", "Khordadgan"], "4-13": ["تیرگان", "Tirgan"], "5-7": ["امردادگان", "Amordadgan"], "6-4": ["شهریورگان", "Shahrivargan"], "7-16": ["مهرگان (در گاه‌شماری کهن)", "Mehregan (in the old reckoning)"], "8-10": ["آبانگان", "Abangan"], "9-9": ["آذرگان", "Azargan"], "10-1": ["خرّم‌روز (دیگان)", "Khorram-ruz (Deygan)"], "10-8": ["دیگان", "Deygan"], "10-15": ["دیگان", "Deygan"], "10-23": ["دیگان", "Deygan"], "11-2": ["بهمنگان", "Bahmanagan"], "12-5": ["سپندارمذگان (جشن زن و زمین)", "Sepandarmazgan (festival of women and the earth)"] };
	const MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
	// The sun's sign follows the Persian months exactly (Farvardin = Aries …).
	const SIGNS = [["حمل", "Aries", "♈"], ["ثور", "Taurus", "♉"], ["جوزا", "Gemini", "♊"], ["سرطان", "Cancer", "♋"], ["اسد", "Leo", "♌"], ["سنبله", "Virgo", "♍"], ["میزان", "Libra", "♎"], ["عقرب", "Scorpio", "♏"], ["قوس", "Sagittarius", "♐"], ["جدی", "Capricorn", "♑"], ["دلو", "Aquarius", "♒"], ["حوت", "Pisces", "♓"]];

	/* ---------- moon ---------- */
	function moon(d = new Date()) {
		const jd = d.getTime() / 864e5 + 2440587.5;
		const syn = 29.530588853;
		let age = ((jd - 2451550.1) / syn) % 1;
		if (age < 0) age += 1;
		const illum = (1 - Math.cos(age * 2 * Math.PI)) / 2;
		const i = Math.round(age * 8) % 8;
		const next = (target) => new Date(d.getTime() + (((target - age + 1) % 1) || 1) * syn * 864e5);
		return { age: age * syn, illum, idx: i, emoji: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"][i], nextFull: next(0.5), nextNew: next(0) };
	}
	H.moon = moon;
	const MOON_NAMES = ["moonNew", "moonWaxC", "moonFirstQ", "moonWaxG", "moonFull", "moonWanG", "moonLastQ", "moonWanC"];
	H.moonName = (i) => t(MOON_NAMES[i]);

	/* ---------- data for a day ---------- */
	function yearsAgo(y, nowY) { return nowY - y; }
	function itemsFor(d) {
		const j = H.jparts(d), m = d.getMonth() + 1, day = d.getDate();
		const out = [];
		for (const r of D.G) if (r[0] === m && r[1] === day) out.push({ cal: "g", y: r[2], m, d: day, emoji: r[3], text: tx(r[4]), kind: r[5], sortY: r[2] });
		for (const r of D.S) if (r[0] === j.month && r[1] === j.day) out.push({ cal: "s", y: r[2], m: j.month, d: j.day, emoji: r[3], text: tx(r[4]), kind: r[5], sortY: r[2] + 621 });
		return out.sort((a, b) => b.sortY - a.sortY);
	}
	// Both dates of an event: "6 Azar 1358 · 27 November 1979".
	function bothDates(it) {
		const fa = I18n.lang === "fa";
		const fmtJ = (dt) => new Intl.DateTimeFormat(I18n.locale + "-u-ca-persian", { day: "numeric", month: "long", year: "numeric" }).format(dt);
		const fmtG = (dt) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-gregory" : I18n.locale, { day: "numeric", month: "long", year: "numeric" }).format(dt);
		let g;
		if (it.cal === "s") g = new Date(DastyarImport.j2g(it.y, it.m, it.d) + "T12:00:00");
		else { g = new Date(2000, it.m - 1, it.d, 12); g.setFullYear(it.y); }
		// Before 1582 old dates are in the Julian calendar, so only the year is converted.
		if (it.cal === "g" && it.y < 1582) {
			const jy = new Intl.DateTimeFormat(I18n.locale + "-u-ca-persian", { year: "numeric" }).format(g);
			return [fmtG(g), t("histSolarYear", { y: jy })];
		}
		return fa ? [fmtJ(g), fmtG(g)] : [fmtG(g), fmtJ(g)];
	}
	function dayInfo(d) {
		const j = H.jparts(d);
		const name = j.day <= 30 ? DAYNAMES[j.day - 1] : null;
		const feast = FEASTS[j.month + "-" + j.day];
		const sign = SIGNS[j.month - 1];
		const start = new Date(d.getFullYear(), 0, 1, 12);
		const doy = Math.round((noon(d) - start) / 864e5) + 1;
		const leap = new Date(d.getFullYear(), 1, 29).getDate() === 29;
		// Day of the Persian year: count back to 1 Farvardin.
		let jdoy = j.month <= 6 ? (j.month - 1) * 31 + j.day : 186 + (j.month - 7) * 30 + j.day;
		const jlen = H.jparts(addDays(d, 366 - jdoy)).month === 12 ? 366 : 365;
		return { j, name, feast, sign, doy, gleft: (leap ? 366 : 365) - doy, jdoy, jleft: jlen - jdoy };
	}
	function dayLength(d) {
		const city = setting("city") || { lat: 35.6892, lon: 51.389, tz: "Asia/Tehran", name: I18n.lang === "fa" ? "تهران" : "Tehran" };
		if (!window.Prayer) return null;
		const off = Prayer.tzOffset(city.tz, d);
		const r = Prayer.compute(noon(d), city.lat, city.lon, off);
		if (!isFinite(r.sunrise) || !isFinite(r.sunset)) return null;
		return { rise: r.sunrise, set: r.sunset, len: r.sunset - r.sunrise, city: city.name };
	}
	H.dayLength = dayLength;
	const hmLen = (h) => { const m = Math.round(h * 60); return t("hoursMin", { h: num(Math.floor(m / 60)), m: num(m % 60) }); };
	H.hmLen = hmLen;

	/* ---------- dialog ---------- */
	let shown = noon(new Date());
	function dlg() {
		let d = $("histDialog");
		if (d) return d;
		d = el("dialog", { id: "histDialog", class: "dialog hist-dlg" },
			el("div", { class: "dialog-body" },
				el("div", { class: "hist-top" },
					el("button", { class: "icon-btn small cal-nav", type: "button", id: "histPrev", title: t("histPrev"), onclick: () => go(-1) }, el("span", { class: "arrow-prev" })),
					el("div", { class: "hist-title grow" }, el("h3", { id: "histDate" }), el("div", { id: "histDate2", class: "muted small" })),
					el("button", { class: "icon-btn small cal-nav", type: "button", id: "histNext", title: t("histNext"), onclick: () => go(1) }, el("span", { class: "arrow-next" })),
					el("button", { class: "icon-btn small", type: "button", "data-close": "", title: t("close"), onclick: () => d.close() }, "✕")),
				el("div", { class: "hist-tools" },
					el("button", { class: "chip", type: "button", id: "histToday", onclick: () => { shown = noon(new Date()); draw(); } }, "☀️ " + t("today")),
					el("input", { type: "date", id: "histPick", "aria-label": t("histPick"), onchange: (e) => { if (e.target.value) { shown = new Date(e.target.value + "T12:00:00"); draw(); } } }),
					el("span", { class: "grow" }),
					el("button", { class: "chip", type: "button", id: "histCopy", onclick: copyDay }, "📋 " + t("histCopy"))),
				el("div", { id: "histBody", class: "hist-body" })));
		d.addEventListener("click", (e) => e.target === d && d.close());
		d.addEventListener("keydown", (e) => {
			if (e.target.tagName === "INPUT") return;
			if (e.key === "ArrowLeft") go(I18n.rtl ? 1 : -1);
			if (e.key === "ArrowRight") go(I18n.rtl ? -1 : 1);
		});
		document.body.append(d);
		return d;
	}
	function go(n) { shown = addDays(shown, n); draw(); }
	function open(d) {
		shown = noon(d || new Date());
		const x = dlg();
		draw();
		if (!x.open) x.showModal();
		H.bump?.("histOpen");
		try { localStorage.setItem("rubi_hist_seen", H.dayKey()); } catch {}
	}
	H.openHistory = open;

	function section(icon, title, ...kids) {
		return el("section", { class: "hist-sec" }, el("h4", {}, el("span", { "aria-hidden": "true" }, icon), " ", title), ...kids);
	}
	function itemRow(it, nowY, nowJY) {
		const [a, b] = bothDates(it);
		const ago = it.cal === "s" ? nowJY - it.y : nowY - it.y;
		const label = it.kind === "b" ? t("histBorn") : it.kind === "d" ? t("histDied") : "";
		return el("li", { class: "hist-item k-" + it.kind },
			el("span", { class: "hist-emoji", "aria-hidden": "true" }, it.emoji),
			el("div", { class: "hist-text" },
				el("p", { dir: "auto" }, label ? el("span", { class: "hist-kind" }, label) : "", label ? " " : "", it.text),
				el("div", { class: "hist-dates" }, el("span", { class: "hd-main" }, a), el("span", { class: "hd-sep" }, "·"), el("span", {}, b), ago > 0 ? el("span", { class: "hist-ago" }, t("histAgo", { n: num(ago) })) : "")));
	}
	function draw() {
		const d = shown, fa = I18n.lang === "fa";
		const isToday = H.dayKey(d) === H.dayKey();
		const info = dayInfo(d);
		$("histDate").textContent = (isToday ? t("histToday") + " · " : "") + H.fmtDate(d, "persian");
		$("histDate2").textContent = [H.fmtDate(d, "gregory"), H.fmtDate(d, "islamic-umalqura", false)].join(" · ");
		$("histPick").value = H.dayKey(d);
		const occ = window.Occasions ? Occasions.forDay(d) : [];
		const items = itemsFor(d);
		const nowY = new Date().getFullYear(), nowJY = H.jparts(new Date()).year;
		const events = items.filter((x) => x.kind === "e"), people = items.filter((x) => x.kind !== "e");
		const m = moon(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 21));
		const len = dayLength(d);
		const fact = D.F[(info.doy + d.getFullYear()) % D.F.length];
		const sign = info.sign;
		const body = [];
		if (occ.length) body.push(section("🎗️", t("histOccasions"), el("ul", { class: "hist-occ" }, ...occ.map((o) => el("li", { class: o.off ? "off" : "" }, el("span", { "aria-hidden": "true" }, o.emoji), " ", el("span", { dir: "auto" }, o.name), o.off ? el("small", { class: "hist-off" }, t("histHoliday")) : "")))));
		body.push(section("📜", t("histEvents"), events.length ? el("ul", { class: "hist-list" }, ...events.map((x) => itemRow(x, nowY, nowJY))) : el("p", { class: "muted small" }, t("histNoEvents"))));
		if (people.length) body.push(section("👤", t("histPeople"), el("ul", { class: "hist-list" }, ...people.map((x) => itemRow(x, nowY, nowJY)))));
		body.push(section("🏺", t("histAncient"), el("div", { class: "hist-anc" },
			info.name ? el("p", {}, fa ? `روز «${info.name[0]}» از ماه ${MONTHS_FA[info.j.month - 1]}، به معنی ${info.name[2]}.` : `The day "${info.name[1]}" of the month, meaning ${info.name[3]}.`) : el("p", { class: "muted small" }, t("histDay31")),
			info.feast ? el("p", { class: "hist-feast" }, "🎊 " + t("histFeast", { name: info.feast[L()] })) : "")));
		body.push(section("🌌", t("histSky"), el("div", { class: "hist-sky" },
			el("div", { class: "sky-tile" }, el("span", { class: "sky-big" }, sign[2]), el("strong", {}, t("histSunIn", { sign: fa ? sign[0] : sign[1] })), el("small", { class: "muted" }, fa ? sign[1] : "")),
			el("div", { class: "sky-tile" }, el("span", { class: "sky-big" }, m.emoji), el("strong", {}, H.moonName(m.idx)), el("small", { class: "muted" }, t("moonLit", { n: num(Math.round(m.illum * 100)) }))),
			len ? el("div", { class: "sky-tile" }, el("span", { class: "sky-big" }, "🌅"), el("strong", {}, hmLen(len.len)), el("small", { class: "muted" }, t("histDayLen", { city: len.city, rise: Prayer.hm(len.rise), set: Prayer.hm(len.set) }))) : "",
			el("div", { class: "sky-tile" }, el("span", { class: "sky-big" }, "📆"), el("strong", {}, t("histDoy", { n: num(info.jdoy) })), el("small", { class: "muted" }, t("histLeft", { n: num(info.jleft), g: num(info.doy), gl: num(info.gleft) }))))));
		body.push(section("💡", t("histFact"), el("p", { class: "hist-fact", dir: "auto" }, tx(fact))));
		$("histBody").replaceChildren(...body);
		$("histBody").scrollTop = 0;
	}
	function copyDay() {
		const d = shown;
		const lines = [H.fmtDate(d, "persian") + " · " + H.fmtDate(d, "gregory", false)];
		(window.Occasions ? Occasions.forDay(d) : []).forEach((o) => lines.push(o.emoji + " " + o.name));
		itemsFor(d).forEach((x) => lines.push(`${x.emoji} ${bothDates(x)[0]}: ${x.text}`));
		lines.push("— " + t("brandFull"));
		navigator.clipboard.writeText(lines.join("\n")).then(() => toast(t("copied")), () => {});
	}

	/* ---------- small views (home daily card tab and fun page card) ---------- */
	function preview(max = 3) {
		const d = noon(new Date());
		const occ = window.Occasions ? Occasions.forDay(d) : [];
		const items = itemsFor(d);
		const rows = [
			...occ.slice(0, 1).map((o) => el("li", {}, el("span", { class: "hist-emoji" }, o.emoji), el("span", { dir: "auto" }, o.name))),
			...items.slice(0, max - Math.min(1, occ.length)).map((x) => el("li", {}, el("span", { class: "hist-emoji" }, x.emoji), el("span", { dir: "auto" }, el("b", {}, num(x.y, { useGrouping: false }) + (I18n.lang === "fa" ? (x.cal === "s" ? " ش" : " م") : "") + " · "), x.text)))
		];
		if (!rows.length) {
			const info = dayInfo(d);
			rows.push(el("li", {}, el("span", { class: "hist-emoji" }, "🏺"), el("span", {}, info.name ? (I18n.lang === "fa" ? `امروز در گاه‌شماری ایران باستان روز «${info.name[0]}» است.` : `In the ancient Iranian calendar today is the day of ${info.name[1]}.`) : tx(D.F[info.doy % D.F.length]))));
		}
		return el("ul", { class: "hist-mini" }, ...rows);
	}
	H.historyPreview = preview;

	const body = el("div", { class: "fun-hist" });
	function drawCard() {
		body.replaceChildren(
			el("p", { class: "muted small" }, H.fmtDate(new Date(), "persian") + " · " + H.fmtDate(new Date(), "gregory", false)),
			preview(4),
			el("button", { class: "btn", type: "button", onclick: () => open() }, "📅 " + t("histOpen")));
	}
	H.funCard("history", { icon: "📅", title: "histTitle", order: 10, body, wide: true });
	drawCard();
	H.onRefresh(drawCard);
	// The home daily card may have been left on this tab: draw it now that the content is here.
	if (document.querySelector(".daily-tab.active")?.dataset.daily === "hist") document.querySelector('.daily-tab[data-daily="hist"]').click();
	I18n.onChange(() => { const x = $("histDialog"); if (x) { x.remove(); } });
	window.TodayInHistory = { itemsFor, dayInfo, open, moon };
})();
