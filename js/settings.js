/* Settings window: side sections (profile, background, theme, general, calendar, privacy, data, about),
 * Google account (Chrome profile) with avatar, font cards, colour circles, video background and occasion categories. */
(function () {
	"use strict";
	const { $, el, setting } = H;
	const ls = (k, v) => {
		try {
			if (v === undefined) return localStorage.getItem(k);
			localStorage.setItem(k, v);
		} catch {}
	};

	/* ---------- sections ---------- */
	let sec = ls("hamyar_set_sec") || "profile";
	function showSec(s) {
		if (!document.querySelector(`.set-sec[data-sec="${s}"]`)) s = "profile";
		sec = s;
		ls("hamyar_set_sec", s);
		document.querySelectorAll(".set-sec").forEach((x) => (x.hidden = x.dataset.sec !== s));
		document.querySelectorAll(".set-tab").forEach((x) => x.classList.toggle("active", x.dataset.sec === s));
		$("setSecTitle").textContent = t("sec_" + s);
		document.querySelector(".set-body").scrollTop = 0;
	}
	document.querySelectorAll(".set-tab").forEach((b) => b.addEventListener("click", () => showSec(b.dataset.sec)));
	H.settingsSection = (s) => {
		showSec(s);
		$("settingsBtn").click();
	};

	/* ---------- profile & Google account ---------- */
	let email = "";
	async function loadEmail() {
		try {
			const info = await chrome.identity.getProfileUserInfo({ accountStatus: "ANY" });
			email = (info && info.email) || "";
		} catch {
			email = "";
		}
	}
	function avatarEl(size) {
		const a = setting("avatar", "");
		if (a) return el("img", { src: a, alt: "", width: String(size), height: String(size), class: "avatar-img" });
		const who = setting("name", "") || email || "H";
		return el("span", { class: "avatar-letter", style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px` }, who.trim().charAt(0).toUpperCase());
	}
	/* Ready-made avatars (girls and boys), drawn for Rubi. The setting keeps just the file path. */
	const AV_KINDS = ["woman", "man", "girl", "boy"];
	const AVATARS = Object.fromEntries(AV_KINDS.map((k) => [k, [1, 2, 3, 4, 5, 6, 7, 8].map((n) => "avatars/" + k + "-" + n + ".svg")]));
	const AV_LABEL = { woman: "avWomen", man: "avMen", girl: "avGirls", boy: "avBoys" };
	function avatarPicker(withUpload) {
		const box = el("div", { class: "av-pick" });
		const draw = () => {
			const cur = setting("avatar", "");
			const row = (k) => el("div", { class: "av-group" }, el("span", { class: "av-label muted small" }, t(AV_LABEL[k])),
				el("div", { class: "av-row" }, ...AVATARS[k].map((src) => el("button", { type: "button", class: "av-btn" + (cur === src ? " on" : ""), "aria-pressed": String(cur === src), title: t("avPick"), onclick: () => { Store.setSetting("avatar", src); draw(); } }, el("img", { src, alt: "", width: "56", height: "56" })))));
			box.replaceChildren(...AV_KINDS.map(row),
				withUpload ? el("div", { class: "av-more" },
					el("button", { type: "button", class: "setup-chip", onclick: () => $("avatarInput").click() }, "📷 " + t("avOwn")),
					cur ? el("button", { type: "button", class: "link-btn", onclick: () => { Store.setSetting("avatar", ""); draw(); } }, t("removeAvatar")) : "") : "");
		};
		draw();
		box.redraw = draw;
		H.onRefresh(() => box.isConnected && draw());
		return box;
	}
	H.avatarPicker = avatarPicker;
	const profPick = avatarPicker(false);
	$("avatarPick").replaceChildren(profPick);
	function renderProfile() {
		$("profAvatar").replaceChildren(avatarEl(88));
		profPick.redraw();
		$("profName").textContent = setting("name", "") || t("noName");
		$("profEmail").textContent = setting("username", "") ? "@" + setting("username", "") : email;
		$("avatarRemove").hidden = !setting("avatar", "");
		$("acctStatus").textContent = email ? t("acctSignedIn", { email }) : t("acctSignedOut");
		$("acctBtn").textContent = t(email ? "acctManage" : "acctSignIn");
		$("acctBtn").className = email ? "btn btn-ghost" : "btn";
		$("usernameInput").value = setting("username", "");
		const bd = setting("birthday", "");
	}
	// Chrome's own page for signing in, switching or signing out of the Google account.
	$("acctBtn").addEventListener("click", () => chrome.tabs.create({ url: "chrome://settings/people" }));
	$("avatarBtn").addEventListener("click", () => $("avatarInput").click());
	$("avatarInput").addEventListener("change", async (e) => {
		const f = e.target.files[0];
		e.target.value = "";
		if (!f) return;
		try {
			Store.setSetting("avatar", await squareImage(f, 128));
		} catch {
			H.toast(t("wallBad"));
		}
	});
	$("avatarRemove").addEventListener("click", () => Store.setSetting("avatar", ""));
	$("usernameInput").addEventListener("change", (e) => Store.setSetting("username", e.target.value.trim().replace(/^@/, "")));
	/* Birthday picker: Persian (Solar Hijri) or Gregorian, whichever is easier; saved as a Gregorian date
	 * plus the calendar it was entered in ({ date: "yyyy-mm-dd", cal }). Used in Settings and in the first-run setup. */
	const PMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
	const PMONTHS_LATIN = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];
	function partsOf(iso, cal) {
		if (!iso) return null;
		const d = new Date(iso + "T12:00:00");
		if (cal !== "persian") return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
		const p = {};
		for (const x of new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d)) p[x.type] = parseInt(x.value, 10);
		return { y: p.year, m: p.month, d: p.day };
	}
	H.bdayPicker = function () {
		const saved = setting("birthday", "") || {};
		let cal = saved.cal || (I18n.lang === "fa" ? "persian" : "gregory");
		const box = el("div", { class: "bday" });
		function draw() {
			const cur = setting("birthday", "") || {};
			const p = partsOf(cur.date, cal) || {};
			const months = cal === "persian" ? (I18n.lang === "fa" ? PMONTHS : PMONTHS_LATIN) : Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat(I18n.locale, { month: "long" }).format(new Date(2001, i, 1)));
			const day = el("select", { "aria-label": t("bdayDay") }, el("option", { value: "" }, t("bdayDay")), ...Array.from({ length: 31 }, (_, i) => el("option", { value: i + 1, selected: p.d === i + 1 }, H.num(i + 1))));
			const month = el("select", { "aria-label": t("bdayMonth") }, el("option", { value: "" }, t("bdayMonth")), ...months.map((n, i) => el("option", { value: i + 1, selected: p.m === i + 1 }, n)));
			const year = el("input", { type: "number", inputmode: "numeric", placeholder: cal === "persian" ? "۱۳۷۰" : "1990", min: cal === "persian" ? 1280 : 1900, max: cal === "persian" ? 1420 : 2040, value: p.y || "", "aria-label": t("bdayYear") });
			const save = () => {
				const y = Number(year.value), m = Number(month.value), d = Number(day.value);
				if (!y || !m || !d) return;
				const iso = cal === "persian" ? DastyarImport.j2g(y, m, d) : `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
				Store.setSetting("birthday", { date: iso, cal });
			};
			[day, month, year].forEach((x) => x.addEventListener("change", save));
			box.replaceChildren(...[
				el("div", { class: "bday-cal" }, ...[["persian", "bdayPersian"], ["gregory", "bdayGregorian"]].map(([c, label]) =>
					el("button", { type: "button", class: "bday-chip" + (c === cal ? " on" : ""), onclick: () => { cal = c; draw(); } }, t(label)))),
				el("div", { class: "bday-row" }, day, month, year),
				cur.date ? el("button", { type: "button", class: "link-btn small", onclick: () => { Store.setSetting("birthday", ""); draw(); } }, t("bdayClear")) : null].filter(Boolean));
		}
		draw();
		return box;
	};
	const bdayBox = H.bdayPicker();
	$("bdayInput").replaceWith(bdayBox);
	bdayBox.id = "bdayInput";
	H.onRefresh(() => {
		const cur = $("bdayInput");
		if (cur && !cur.contains(document.activeElement)) cur.replaceWith(Object.assign(H.bdayPicker(), { id: "bdayInput" }));
	});
	// Small square JPEG so the avatar fits in Chrome Sync next to everything else.
	function squareImage(file, size) {
		return new Promise((resolve, reject) => {
			if (!/^image\//.test(file.type)) return reject(new Error("type"));
			const url = URL.createObjectURL(file);
			const im = new Image();
			im.onload = () => {
				URL.revokeObjectURL(url);
				const s = Math.min(im.naturalWidth, im.naturalHeight);
				const c = document.createElement("canvas");
				c.width = c.height = size;
				c.getContext("2d").drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, size, size);
				let q = 0.85, data = c.toDataURL("image/jpeg", q);
				while (data.length > 14000 && q > 0.4) data = c.toDataURL("image/jpeg", (q -= 0.1));
				resolve(data);
			};
			im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
			im.src = url;
		});
	}

	/* ---------- rail: avatar instead of the gear ---------- */
	const gear = $("settingsBtn").innerHTML;
	function renderRailAvatar() {
		if (setting("avatar", "")) $("settingsBtn").replaceChildren(avatarEl(34));
		else $("settingsBtn").innerHTML = gear;
		$("settingsBtn").classList.toggle("has-avatar", !!setting("avatar", ""));
	}

	/* ---------- theme: modes, colours, fonts ---------- */
	const MODES = [["light", "mode-light"], ["dark", "mode-dark"], ["auto", "mode-auto"], ["daynight", "mode-dn"]];
	const ACCENTS = [["#3f75ff", "blue"], ["#3db985", "green"], ["#6c4ff0", "purple"], ["#ec4899", "pink"], ["#ef4444", "red"], ["#f28c28", "orange"], ["#14b8a6", "teal"]];
	const LATIN = new Set(["inter", "lora", "jetbrains", "roboto", "opensans", "montserrat", "poppins", "lato", "nunito", "garamond", "playfair", "fira", "jost"]);
	// French- and German-flavoured fonts show off their accents.
	const SAMPLE = { garamond: "Café · Été 123", playfair: "Château · Aa 123", fira: "Grüße · Straße 123", jost: "Größe · Über 123" };
	function renderTheme() {
		const cur = setting("theme", "dark");
		$("modeRow").replaceChildren(...MODES.map(([id, cls]) => {
			const th = Themes.byId[id];
			return el("button", { type: "button", class: "circle-opt", "aria-pressed": String(cur === id), onclick: () => Store.setSetting("theme", id) },
				el("span", { class: "circle " + cls }, cur === id ? "✓" : ""), el("small", {}, th.names[I18n.lang] || th.names.en));
		}));
		const acc = (setting("accent", "") || "").toLowerCase();
		$("accentRow").replaceChildren(...ACCENTS.map(([hex, name]) =>
			el("button", { type: "button", class: "circle-opt", "aria-pressed": String(acc === hex), title: t("c_" + name), onclick: () => Store.setSetting("accent", hex) },
				el("span", { class: "circle", style: `background:${hex}` }, acc === hex ? "✓" : ""), el("small", {}, t("c_" + name)))));
		const font = setting("font", "vazir");
		const ai = $("accentInput"); if (ai && /^#[0-9a-f]{6}$/.test(acc)) ai.value = acc;
		if (!$("fontSelect").options.length) $("fontSelect").replaceChildren(...Themes.FONT_LIST.map(([id, , name]) => el("option", { value: id }, name)));
		$("fontSelect").value = font;
		$("fontGrid").replaceChildren(...Themes.FONT_LIST.map(([id, fam, name]) =>
			el("button", { type: "button", class: "font-card" + (font === id ? " on" : ""), "aria-pressed": String(font === id), "data-font": id, onclick: () => { $("fontSelect").value = id; $("fontSelect").dispatchEvent(new Event("change")); } },
				el("span", { class: "fc-sample", style: `font-family:${fam}`, dir: LATIN.has(id) ? "ltr" : null }, LATIN.has(id) ? SAMPLE[id] || "Rubi · Aa Bb 123" : t("fontSample")), el("small", {}, name))));
	}

	/* ---------- video background ---------- */
	let videoUrl = null;
	async function playVideo() {
		const v = $("bgVideo");
		if (videoUrl) URL.revokeObjectURL(videoUrl);
		videoUrl = null;
		const rec = Themes.hasVideo() ? await Themes.getVideo().catch(() => null) : null;
		if (!rec || !rec.blob) {
			v.hidden = true;
			v.removeAttribute("src");
			v.load();
			return;
		}
		videoUrl = URL.createObjectURL(rec.blob);
		v.src = videoUrl;
		v.hidden = false;
		v.play().catch(() => {});
	}
	async function renderVideo() {
		const rec = Themes.hasVideo() ? await Themes.getVideo().catch(() => null) : null;
		$("videoInfo").textContent = rec ? `🎬 ${rec.name || "video"} · ${(rec.size / 1048576).toFixed(1)} MB` : "";
		$("videoRemove").hidden = !rec;
		$("wallDimRow").hidden = !(Themes.hasWall() || Themes.hasVideo());
	}
	$("videoInput").addEventListener("change", async (e) => {
		const f = e.target.files[0];
		e.target.value = "";
		if (!f) return;
		if (!/^video\//.test(f.type)) return H.toast(t("videoBad"));
		if (f.size > 120 * 1048576) return H.toast(t("videoTooBig"));
		try {
			await Themes.setVideo(f);
		} catch {
			return H.toast(t("videoTooBig"));
		}
		await playVideo();
		renderVideo();
	});
	$("videoRemove").addEventListener("click", async () => {
		await Themes.setVideo(null);
		await playVideo();
		renderVideo();
	});
	// Save battery: pause the video when the tab is hidden.
	document.addEventListener("visibilitychange", () => {
		const v = $("bgVideo");
		if (v.hidden) return;
		document.hidden ? v.pause() : v.play().catch(() => {});
	});

	/* ---------- calendar occasion categories ---------- */
	function renderCats() {
		const off = setting("occCats", {}) || {};
		$("occCats").replaceChildren(...Occasions.CATS.map(([id, emoji]) =>
			el("label", { class: "tog-card" }, el("span", { class: "tc-ic" }, emoji),
				el("span", { class: "grow" }, el("strong", {}, t("cat_" + id)), el("small", { class: "muted" }, t("catd_" + id))),
				el("input", { type: "checkbox", class: "switch", checked: off[id] !== false, onchange: (e) => Store.setSetting("occCats", { ...(setting("occCats", {}) || {}), [id]: e.target.checked }) }))));
	}

	function renderAll() {
		renderProfile();
		renderTheme();
		renderVideo();
		renderCats();
		$("aboutVer").textContent = chrome.runtime.getManifest().version;
	}
	$("settingsBtn").addEventListener("click", () => {
		showSec(sec);
		loadEmail().then(renderProfile);
		renderAll();
	});
	H.onRefresh(() => {
		renderRailAvatar();
		if ($("settingsDialog").open) renderAll();
	});
	loadEmail();
	playVideo();
})();
