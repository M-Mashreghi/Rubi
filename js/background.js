importScripts("i18n-bg.js", "events-core.js", "site-flag.js");

// Clicking the toolbar icon opens a new tab (the Rubi page).
chrome.action.onClicked.addListener(() => chrome.tabs.create({}));

// Pomodoro: finish the session when its alarm fires, even if no new tab is open.
const POMO = "hamyar_pomo";
const MIN = 60000;
const DUR = { focus: 25 * MIN, short: 5 * MIN, long: 15 * MIN };

chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== "hamyar-pomo") return;
	const s = (await chrome.storage.local.get(POMO))[POMO];
	if (!s || !s.running) return;
	const today = new Date().toDateString();
	let count = s.countDate === today ? s.count || 0 : 0;
	let next;
	if (s.mode === "focus") {
		count += 1;
		next = count % 4 === 0 ? "long" : "short";
	} else next = "focus";
	await chrome.storage.local.set({ [POMO]: { ...s, running: false, mode: next, remaining: DUR[next], count, countDate: today } });
	if (s.mode === "focus") {
		// Daily log of finished focus sessions, for the report on the tools page (kept for a year).
		const d = new Date(), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		const log = (await chrome.storage.local.get("kamyar_pomo_log")).kamyar_pomo_log || {};
		log[key] = (log[key] || 0) + 1;
		const keys = Object.keys(log).sort();
		while (keys.length > 366) delete log[keys.shift()];
		await chrome.storage.local.set({ kamyar_pomo_log: log });
		// The break games on the fun page open for the length of the break (plus a few minutes).
		await chrome.storage.local.set({ rubi_break: { at: Date.now(), until: Date.now() + DUR[next] + 5 * MIN } });
	}
	const t = await bgT();
	const title = s.mode === "focus" ? t("notifFocusDone") : t("notifBreakDone");
	const message = s.mode === "focus" ? t("notifBreakNext", { m: next === "long" ? 15 : 5 }) : t("notifFocusNext");
	chrome.notifications.create("hamyar-pomo-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title, message, priority: 2 });
});

// Task reminders: the new-tab page schedules an alarm "todo:<id>" for each task with a reminder.
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (!alarm.name.startsWith("todo:")) return;
	const id = alarm.name.slice(5);
	const data = (await chrome.storage.local.get("hamyar_data")).hamyar_data;
	const x = data && data.items && data.items[id];
	if (!x || x.deleted || x.done) return;
	const t = await bgT();
	chrome.notifications.create("hamyar-todo-" + id + "-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title: t("notifTask"), message: String(x.text || "").slice(0, 200) + (x.desc ? "\n" + String(x.desc).slice(0, 200) : ""), priority: 2 });
});
// Personal events and birthdays: notify, then schedule the next occurrence of a repeating event.
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (!alarm.name.startsWith("ev:")) return;
	const id = alarm.name.slice(3);
	const data = (await chrome.storage.local.get("hamyar_data")).hamyar_data;
	const ev = data && data.items && data.items[id];
	if (!ev || ev.deleted) return;
	const t = await bgT();
	const days = Math.round(Number(ev.remind || 0) / 1440);
	const when = days <= 0 ? t("whenToday") : days === 1 ? t("whenTomorrow") : t("whenInDays", { n: days });
	const occ = new Date(Date.now() + Number(ev.remind || 0) * 60000);
	occ.setHours(12, 0, 0, 0);
	let title, message;
	if (ev.kind === "birthday") {
		const age = EvCore.ageOn(ev, occ);
		title = age > 0 ? t("notifBirthdayAge", { name: ev.title, n: age }) : t("notifBirthday", { name: ev.title });
		message = when;
	} else {
		title = t("notifEvent");
		message = String(ev.title || "").slice(0, 200) + "\n" + when + (ev.start && !ev.allDay ? " · " + ev.start : "");
	}
	chrome.notifications.create("hamyar-ev-" + id + "-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title, message, priority: 2 });
	const next = EvCore.nextFire(ev, Date.now() + 60000);
	if (next) chrome.alarms.create(alarm.name, { when: next.when });
});
// Countdown timer from the tools widget.
chrome.alarms.onAlarm.addListener(async (alarm) => {
	if (alarm.name !== "hamyar-timer") return;
	await chrome.storage.local.set({ hamyar_timer: { running: false, remaining: 0, total: 0, endAt: 0 } });
	const t = await bgT();
	chrome.notifications.create("hamyar-timer-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title: t("notifTimer"), message: t("notifTimerMsg"), priority: 2, requireInteraction: true });
});
chrome.notifications.onClicked.addListener((nid) => {
	if (nid.startsWith("hamyar-")) chrome.tabs.create({});
});

// Right-click menu: "Save to Read later". The link waits in local storage until a Rubi tab picks it up.
const LATER_TITLE = { fa: "ذخیره در «بعداً بخوانم» روبی", en: "Save to Rubi Read later", fr: "Enregistrer dans Rubi · À lire plus tard", de: "In Rubi · Später lesen speichern" };
const SNIP_TITLE = { fa: "قطعه‌متن‌های روبی", en: "Rubi snippets", fr: "Extraits Rubi", de: "Rubi-Textbausteine" };
const snippetsOf = (data) => Object.values((data && data.items) || {}).filter((x) => x && x.type === "snippet" && !x.deleted).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)).slice(0, 30);
let menuSig = "";
async function setupMenu(force) {
	const { hamyar_lang: lang, hamyar_data: data } = await chrome.storage.local.get(["hamyar_lang", "hamyar_data"]);
	const snips = snippetsOf(data);
	const sig = (lang || "") + "|" + snips.map((x) => x.id + ":" + x.title).join(",");
	if (sig === menuSig && !force) return;
	menuSig = sig;
	chrome.contextMenus.removeAll(() => {
		chrome.contextMenus.create({ id: "kamyar-later", title: LATER_TITLE[lang] || LATER_TITLE.fa, contexts: ["page", "link"] });
		// Screenshots: one parent item with the ways to capture.
		const st = SHOT_TITLES[lang] || SHOT_TITLES.fa;
		chrome.contextMenus.create({ id: "kamyar-shot", title: st.parent, contexts: ["page", "link", "image", "selection", "video"] });
		for (const k of ["visible", "full", "area", "delay"]) chrome.contextMenus.create({ id: "shot:" + k, parentId: "kamyar-shot", title: st[k], contexts: ["page", "link", "image", "selection", "video"] });
		if (!snips.length) return;
		chrome.contextMenus.create({ id: "kamyar-snip", title: SNIP_TITLE[lang] || SNIP_TITLE.fa, contexts: ["editable"] });
		for (const x of snips) chrome.contextMenus.create({ id: "snip:" + x.id, parentId: "kamyar-snip", title: String(x.title || x.text || "").slice(0, 60).replace(/&/g, "&&"), contexts: ["editable"] });
	});
}
chrome.runtime.onInstalled.addListener(() => setupMenu(true));
chrome.runtime.onStartup.addListener(() => setupMenu(true));
chrome.storage.onChanged.addListener((c, area) => area === "local" && (c.hamyar_lang || c.hamyar_data) && setupMenu());
// Puts a snippet's text where the cursor is, in the page the person right-clicked.
function insertSnippet(text) {
	const el = document.activeElement;
	if (el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && /^(text|search|email|url|tel|)$/i.test(el.type)))) {
		const a = el.selectionStart ?? el.value.length, b = el.selectionEnd ?? el.value.length;
		el.setRangeText(text, a, b, "end");
		el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
		return true;
	}
	if (el && el.isContentEditable) return document.execCommand("insertText", false, text);
	return false;
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
	if (String(info.menuItemId).startsWith("snip:")) {
		const id = String(info.menuItemId).slice(5);
		const { hamyar_data: data } = await chrome.storage.local.get("hamyar_data");
		const x = data && data.items && data.items[id];
		if (!x || x.deleted || !tab) return;
		try {
			await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [info.frameId || 0] }, func: insertSnippet, args: [String(x.text || "")] });
		} catch {}
		return;
	}
	if (String(info.menuItemId).startsWith("shot:")) return tab && takeShot(String(info.menuItemId).slice(5), tab);
	if (info.menuItemId !== "kamyar-later") return;
	const url = info.linkUrl || info.pageUrl;
	if (!/^https?:/i.test(url || "")) return;
	const title = info.linkUrl ? info.selectionText || "" : (tab && tab.title) || "";
	const { kamyar_inbox: box = [] } = await chrome.storage.local.get("kamyar_inbox");
	box.push({ url, title: String(title).slice(0, 200) });
	await chrome.storage.local.set({ kamyar_inbox: box.slice(-200) });
});

// Focus mode: while it is on, the sites the person listed are blocked with declarativeNetRequest.
async function applyFocus() {
	const { kamyar_focus: f } = await chrome.storage.local.get("kamyar_focus");
	const old = await chrome.declarativeNetRequest.getDynamicRules();
	const removeRuleIds = old.filter((r) => r.id >= 9000 && r.id < 9100).map((r) => r.id);
	const sites = f && f.on ? (f.sites || []).map((s) => String(s).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]).filter((s) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s)).slice(0, 60) : [];
	const addRules = sites.map((s, i) => ({ id: 9000 + i, priority: 1, action: { type: "block" }, condition: { urlFilter: "||" + s, resourceTypes: ["main_frame"] } }));
	await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
}
chrome.storage.onChanged.addListener((c, area) => area === "local" && c.kamyar_focus && applyFocus());
chrome.runtime.onStartup.addListener(applyFocus);
chrome.runtime.onInstalled.addListener(applyFocus);

// Focus sounds: an offscreen document plays the mix so it continues in every tab.
const SOUNDS = "kamyar_sounds";
async function soundsState() {
	return (await chrome.storage.local.get(SOUNDS))[SOUNDS] || null;
}
async function hasOffscreen() {
	if (!chrome.runtime.getContexts) return false;
	const c = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
	return c.length > 0;
}
let offscreenBusy = null;
async function applySounds() {
	const s = await soundsState();
	const on = !!(s && s.playing && Object.values(s.mix || {}).some((v) => v > 0));
	if (on) {
		if (!(await hasOffscreen())) {
			offscreenBusy ||= chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play the focus sounds the person chose (rain, cafe, noise) while they browse." }).catch(() => {});
			await offscreenBusy;
			offscreenBusy = null;
		}
		chrome.runtime.sendMessage({ target: "kamyar-offscreen", type: "sounds", state: s }).catch(() => {});
		if (s.endAt && s.endAt > Date.now()) chrome.alarms.create("kamyar-sounds-end", { when: s.endAt });
		else chrome.alarms.clear("kamyar-sounds-end");
	} else {
		chrome.alarms.clear("kamyar-sounds-end");
		if (await hasOffscreen()) {
			chrome.runtime.sendMessage({ target: "kamyar-offscreen", type: "sounds", state: s }).catch(() => {});
			// Let the sound fade out, then close the document.
			setTimeout(async () => {
				const now = await soundsState();
				if (!(now && now.playing) && (await hasOffscreen())) chrome.offscreen.closeDocument().catch(() => {});
			}, 1600);
		}
	}
}
// Welcome chime through the offscreen document; it closes again unless the focus sounds use it.
let welcomeClose = 0;
async function playWelcome(m) {
	if (!(await hasOffscreen())) {
		offscreenBusy ||= chrome.offscreen.createDocument({ url: "offscreen.html", reasons: ["AUDIO_PLAYBACK"], justification: "Play the welcome chime the person chose when a Rubi tab opens." }).catch(() => {});
		await offscreenBusy;
		offscreenBusy = null;
	}
	chrome.runtime.sendMessage({ target: "kamyar-offscreen", type: "welcome", id: m.id, vol: m.vol, data: m.data }).catch(() => {});
	clearTimeout(welcomeClose);
	welcomeClose = setTimeout(async () => {
		const s = await soundsState();
		if (!(s && s.playing) && (await hasOffscreen())) chrome.offscreen.closeDocument().catch(() => {});
	}, 15000);
}
chrome.storage.onChanged.addListener((c, area) => {
	if (area !== "local") return;
	if (c[SOUNDS]) applySounds();
	// Focus mode can start and stop the sounds with it.
	if (c.kamyar_focus) {
		const was = c.kamyar_focus.oldValue && c.kamyar_focus.oldValue.on, now = c.kamyar_focus.newValue && c.kamyar_focus.newValue.on;
		if (was === now) return;
		soundsState().then((s) => {
			if (!s || s.auto === false || !Object.values(s.mix || {}).some((v) => v > 0)) return;
			// Start with focus; on leaving focus, stop only what focus mode started.
			if (now && !s.playing) chrome.storage.local.set({ [SOUNDS]: { ...s, playing: true, byFocus: true, endAt: 0 } });
			else if (!now && s.playing && s.byFocus) chrome.storage.local.set({ [SOUNDS]: { ...s, playing: false, byFocus: false } });
		});
	}
});
chrome.runtime.onMessage.addListener((m, _sender, reply) => {
	if (m && m.type === "kamyar-sounds-get") {
		soundsState().then(reply);
		return true;
	}
	if (m && m.type === "kamyar-welcome-play") {
		playWelcome(m);
		return;
	}
	if (m && m.type === "kamyar-alerts-check") {
		checkAlerts().then(() => reply(true), () => reply(false));
		return true;
	}
});
chrome.runtime.onStartup.addListener(async () => {
	// Sounds never start by themselves when Chrome opens.
	const s = await soundsState();
	if (s && s.playing) chrome.storage.local.set({ [SOUNDS]: { ...s, playing: false } });
});

// Price alerts: checked every 5 minutes; each alert fires once until it is re-armed on the new-tab page.
const ALERT_STR = {
	fa: { title: "🔔 هشدار قیمت", below: "{name} به {price} رسید (زیر {target})", above: "{name} به {price} رسید (بالای {target})" },
	en: { title: "🔔 Price alert", below: "{name} is at {price} (below {target})", above: "{name} is at {price} (above {target})" },
	fr: { title: "🔔 Alerte de prix", below: "{name} est à {price} (sous {target})", above: "{name} est à {price} (au-dessus de {target})" },
	de: { title: "🔔 Preisalarm", below: "{name} steht bei {price} (unter {target})", above: "{name} steht bei {price} (über {target})" }
};
const NAVASAN_FIELDS = ["usd_sell", "eur", "gbp", "aed", "try", "18ayar", "sekkeh", "bahar", "nim", "rob", "usdt"];
async function priceOf(assets, navKey) {
	const out = {};
	const coins = assets.filter((a) => a.startsWith("c:")).map((a) => a.slice(2));
	if (coins.length) {
		try {
			const d = await (await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${[...new Set(coins)].join(",")}&vs_currencies=usd`)).json();
			for (const c of coins) if (d[c] && d[c].usd != null) out["c:" + c] = d[c].usd;
		} catch {}
	}
	for (const a of assets.filter((x) => x.startsWith("s:"))) {
		try {
			const d = await (await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.slice(2))}?range=1d&interval=1d`)).json();
			const m = d.chart.result[0].meta;
			if (m.regularMarketPrice != null) out[a] = m.regularMarketPrice;
		} catch {}
	}
	if (navKey && assets.some((a) => a.startsWith("ir:"))) {
		try {
			const d = await (await fetch(`https://api.navasan.tech/latest/?api_key=${encodeURIComponent(navKey)}`)).json();
			for (const f of NAVASAN_FIELDS) if (d[f] && d[f].value != null) out["ir:" + f] = Number(String(d[f].value).replace(/,/g, ""));
		} catch {}
	}
	return out;
}
async function checkAlerts() {
	const { hamyar_data: data, kamyar_alert_fired: fired = {}, hamyar_lang: lang } = await chrome.storage.local.get(["hamyar_data", "kamyar_alert_fired", "hamyar_lang"]);
	const alerts = Object.values((data && data.items) || {}).filter((x) => x && x.type === "alert" && !x.deleted && x.asset && Number(x.value) > 0);
	if (!alerts.length) return;
	const prices = await priceOf([...new Set(alerts.map((x) => x.asset))], data.settings && data.settings.navasanKey);
	const S = ALERT_STR[lang] || ALERT_STR.fa;
	const fmt = (v, ir) => new Intl.NumberFormat(lang === "fa" ? "fa-IR" : lang || "en", ir ? { maximumFractionDigits: 0 } : { style: "currency", currency: "USD", maximumFractionDigits: v < 10 ? 4 : 2 }).format(v) + (ir ? (lang === "fa" ? " تومان" : " IRT") : "");
	const changed = { ...fired };
	for (const x of alerts) {
		const p = prices[x.asset];
		if (p == null) continue;
		const hit = x.op === "<" ? p <= Number(x.value) : p >= Number(x.value);
		if (hit && !fired[x.id]) {
			const ir = x.asset.startsWith("ir:");
			changed[x.id] = { at: Date.now(), price: p };
			chrome.notifications.create("kamyar-alert-" + x.id + "-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title: S.title, message: S[x.op === "<" ? "below" : "above"].replace("{name}", x.name || x.asset).replace("{price}", fmt(p, ir)).replace("{target}", fmt(Number(x.value), ir)), priority: 2 });
		}
	}
	await chrome.storage.local.set({ kamyar_alert_fired: changed, kamyar_alert_last: { at: Date.now(), prices } });
}
chrome.alarms.onAlarm.addListener((a) => {
	if (a.name === "kamyar-alerts") checkAlerts();
	if (a.name === "kamyar-sounds-end") soundsState().then((s) => s && chrome.storage.local.set({ [SOUNDS]: { ...s, playing: false, endAt: 0 } }));
});
const ensureAlertAlarm = () => chrome.alarms.get("kamyar-alerts", (a) => !a && chrome.alarms.create("kamyar-alerts", { periodInMinutes: 5, delayInMinutes: 1 }));
chrome.runtime.onInstalled.addListener(ensureAlertAlarm);
chrome.runtime.onStartup.addListener(ensureAlertAlarm);

// Water and eye-break reminders. Settings live in hamyar_data.settings.care; the last time each one fired is in kamyar_care_state.
// A visible Rubi tab shows its own card at the page edge; otherwise Chrome shows a notification (if allowed in the settings).
const CARE_STR = {
	fa: { water: "💧 وقت یک لیوان آب", waterMsg: "چند دقیقه‌ای است آب نخورده‌اید. یک لیوان آب بنوشید.", eye: "👀 به چشم‌هایت استراحت بده", eyeMsg: "۲۰ ثانیه به چیزی در فاصله‌ی دور (حدود ۶ متر) نگاه کنید.", drank: "نوشیدم ✓", later: "۱۰ دقیقه‌ی دیگر" },
	en: { water: "💧 Time for a glass of water", waterMsg: "It's been a while. Have a glass of water.", eye: "👀 Rest your eyes", eyeMsg: "Look at something about 6 metres (20 feet) away for 20 seconds.", drank: "Done ✓", later: "In 10 minutes" },
	fr: { water: "💧 Un verre d'eau ?", waterMsg: "Cela fait un moment. Buvez un verre d'eau.", eye: "👀 Reposez vos yeux", eyeMsg: "Regardez quelque chose à environ 6 mètres pendant 20 secondes.", drank: "C'est fait ✓", later: "Dans 10 minutes" },
	de: { water: "💧 Zeit für ein Glas Wasser", waterMsg: "Schon eine Weile her. Trink ein Glas Wasser.", eye: "👀 Gönn deinen Augen eine Pause", eyeMsg: "Schau 20 Sekunden lang auf etwas etwa 6 Meter entfernt.", drank: "Erledigt ✓", later: "In 10 Minuten" }
};
const CARE_DEF = { water: { on: true, every: 60 }, eye: { on: true, every: 20 }, sys: true, side: "end", quiet: true };
const careCfg = (data) => {
	const c = (data && data.settings && data.settings.care) || {};
	return { ...CARE_DEF, ...c, water: { ...CARE_DEF.water, ...(c.water || {}) }, eye: { ...CARE_DEF.eye, ...(c.eye || {}) } };
};
const dkey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
async function logWater(n = 1) {
	const { kamyar_water: w = {} } = await chrome.storage.local.get("kamyar_water");
	const k = dkey();
	await chrome.storage.local.set({ kamyar_water: { ...w, [k]: (w[k] || 0) + n } });
}
async function checkCare() {
	const { hamyar_data: data, kamyar_care_state: st = {}, hamyar_lang: lang } = await chrome.storage.local.get(["hamyar_data", "kamyar_care_state", "hamyar_lang"]);
	const cfg = careCfg(data);
	const now = Date.now();
	const next = { ...st };
	// Away from the computer (idle 5+ minutes or locked): the clocks start again on return.
	let idle = "active";
	try { idle = await chrome.idle.queryState(300); } catch {}
	const h = new Date().getHours();
	const night = cfg.quiet && (h >= 23 || h < 7);
	const focus = (await chrome.storage.local.get("kamyar_focus")).kamyar_focus;
	for (const kind of ["water", "eye"]) {
		const k = cfg[kind];
		if (!k.on) { delete next[kind]; continue; }
		if (idle !== "active" || night || !next[kind]) { next[kind] = now; continue; }
		if (now - next[kind] < Math.max(5, Number(k.every) || 20) * 60000) continue;
		next[kind] = now;
		// Eye breaks wait while a focus session runs; water reminders still come.
		if (kind === "eye" && focus && focus.on) continue;
		let shown = false;
		try { shown = !!(await chrome.runtime.sendMessage({ type: "kamyar-care", kind }))?.shown; } catch {}
		if (!shown && cfg.sys) {
			const S = CARE_STR[lang] || CARE_STR.fa;
			chrome.notifications.create("kamyar-care-" + kind + "-" + now, { type: "basic", iconUrl: "icons/icon-128.png", title: S[kind], message: S[kind + "Msg"], priority: 1, buttons: kind === "water" ? [{ title: S.drank }, { title: S.later }] : [{ title: S.later }] });
		}
	}
	await chrome.storage.local.set({ kamyar_care_state: next });
}
chrome.notifications.onButtonClicked.addListener(async (nid, btn) => {
	const m = /^kamyar-care-(water|eye)-/.exec(nid);
	if (!m) return;
	chrome.notifications.clear(nid);
	const later = m[1] === "eye" || btn === 1;
	if (m[1] === "water" && btn === 0) await logWater();
	if (later) {
		const { hamyar_data: data, kamyar_care_state: st = {} } = await chrome.storage.local.get(["hamyar_data", "kamyar_care_state"]);
		const every = careCfg(data)[m[1]].every;
		await chrome.storage.local.set({ kamyar_care_state: { ...st, [m[1]]: Date.now() - Math.max(0, every - 10) * 60000 } });
	}
});

// Updates. Copies from the Chrome Web Store update themselves: we ask Chrome to check every few hours and,
// when a new version is there, restart into it straight away if no Rubi tab is open (otherwise the new-tab
// page offers "Update now", and it happens by itself once the last Rubi tab closes).
// Copies installed from the zip can't update themselves, so they look at GitHub and point people to the store.
const REPO = "M-Mashreghi/Rubi";
const STORE_URL = "https://chromewebstore.google.com/detail/ohpaebogaegajgcgeemadkdinfohpemp";
const fromStore = () => !!chrome.runtime.getManifest().update_url;
const newer = (a, b) => {
	const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number);
	for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
	return false;
};
async function rubiTabsOpen() {
	try {
		if (chrome.runtime.getContexts) return (await chrome.runtime.getContexts({ contextTypes: ["TAB"] })).length > 0;
		const base = chrome.runtime.getURL("");
		return (await chrome.tabs.query({})).some((t) => (t.url || t.pendingUrl || "").startsWith(base));
	} catch { return true; }
}
async function applyStoreUpdate(version) {
	await chrome.storage.local.set({ kamyar_update: { at: Date.now(), latest: version, newer: true, store: true, ready: true } });
	if (!(await rubiTabsOpen())) chrome.runtime.reload();
}
if (chrome.runtime.onUpdateAvailable) chrome.runtime.onUpdateAvailable.addListener((d) => applyStoreUpdate(d.version));
chrome.tabs.onRemoved.addListener(async () => {
	const u = (await chrome.storage.local.get("kamyar_update")).kamyar_update;
	if (u && u.ready && !(await rubiTabsOpen())) chrome.runtime.reload();
});
async function checkUpdate(force) {
	if (fromStore()) {
		try {
			const r = await chrome.runtime.requestUpdateCheck();
			const status = r && (r.status || r[0]), version = r && (r.version || (r[1] && r[1].version));
			if (status === "update_available" && version) await applyStoreUpdate(version);
			else await chrome.storage.local.set({ kamyar_update: { at: Date.now(), latest: chrome.runtime.getManifest().version, newer: false, store: true } });
		} catch {}
		return;
	}
	// Once a week is enough; the "check now" button in Settings › About skips the wait.
	const last = (await chrome.storage.local.get("kamyar_update")).kamyar_update;
	if (!force && last && last.at && Date.now() - last.at < 7 * 864e5) return;
	try {
		const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
		if (!r.ok) return;
		const d = await r.json();
		const ver = String(d.tag_name || "").replace(/^v/, "");
		await chrome.storage.local.set({ kamyar_update: { at: Date.now(), latest: ver, url: STORE_URL, newer: newer(ver, chrome.runtime.getManifest().version) } });
	} catch {}
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
	if (m && m.type === "kamyar-update-now") {
		// Rubi's open tabs close while it restarts, so open a fresh one when it's back.
		chrome.storage.local.set({ kamyar_reopen: true }).then(() => chrome.runtime.reload());
		return;
	}
	if (m && m.type === "kamyar-update-check") {
		checkUpdate(true).then(() => reply(true));
		return true;
	}
	if (m && m.type === "kamyar-water") {
		logWater(m.n || 1).then(() => reply(true));
		return true;
	}
});
chrome.alarms.onAlarm.addListener((a) => {
	if (a.name === "kamyar-care") checkCare();
	if (a.name === "kamyar-update") checkUpdate();
});
const ensureKamyarAlarms = () => {
	chrome.alarms.get("kamyar-care", (a) => !a && chrome.alarms.create("kamyar-care", { periodInMinutes: 1, delayInMinutes: 1 }));
	chrome.alarms.get("kamyar-update", (a) => !a && chrome.alarms.create("kamyar-update", { periodInMinutes: 360, delayInMinutes: 2 }));
};
chrome.runtime.onInstalled.addListener((d) => {
	ensureKamyarAlarms();
	if (d.reason === "update") chrome.storage.local.set({ kamyar_whatsnew: chrome.runtime.getManifest().version, kamyar_update: null });
	chrome.storage.local.get("kamyar_reopen").then((r) => { if (r.kamyar_reopen) { chrome.storage.local.remove("kamyar_reopen"); chrome.tabs.create({}); } });
});
chrome.runtime.onStartup.addListener(ensureKamyarAlarms);

/* ---------- Web focus: the floating timer on every site (js/web-timer.js) ----------
 * kamyar_webtimer.on shows it; it follows the Pomodoro state. The page asks for the optional
 * "<all_urls>" permission first; without it the timer only shows inside Rubi. */
const WEBT = "kamyar_webtimer", WEBT_ID = "kamyar-webtimer";
async function applyWebTimer() {
	const w = (await chrome.storage.local.get(WEBT))[WEBT];
	const on = !!(w && w.on);
	const can = await chrome.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false);
	const reg = await chrome.scripting.getRegisteredContentScripts({ ids: [WEBT_ID] }).catch(() => []);
	if (on && can && !reg.length) {
		await chrome.scripting.registerContentScripts([{ id: WEBT_ID, js: ["js/web-timer.js"], matches: ["http://*/*", "https://*/*"], runAt: "document_idle" }]).catch(() => {});
		// Tabs that are already open get it too.
		for (const tab of await chrome.tabs.query({})) {
			if (/^https?:/.test(tab.url || "")) chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["js/web-timer.js"] }).catch(() => {});
		}
	}
	if ((!on || !can) && reg.length) await chrome.scripting.unregisterContentScripts({ ids: [WEBT_ID] }).catch(() => {});
}
chrome.storage.onChanged.addListener((c, area) => area === "local" && c[WEBT] && applyWebTimer());
chrome.permissions.onAdded?.addListener(applyWebTimer);
chrome.permissions.onRemoved?.addListener(applyWebTimer);
chrome.runtime.onStartup.addListener(applyWebTimer);
chrome.runtime.onInstalled.addListener(applyWebTimer);

// When a web focus session ends (the Pomodoro alarm above finished it), close the session and open blocked sites again.
chrome.storage.onChanged.addListener(async (c, area) => {
	if (area !== "local" || !c[POMO]) return;
	const was = c[POMO].oldValue, now = c[POMO].newValue;
	if (!was || !now || !was.running || now.running || was.mode !== "focus" || now.mode === "focus") return;
	const w = (await chrome.storage.local.get(WEBT))[WEBT];
	if (!w || !w.on) return;
	await endWebFocus(true);
});
async function endWebFocus(finished) {
	const w = (await chrome.storage.local.get(WEBT))[WEBT] || {};
	await chrome.storage.local.set({ [WEBT]: { ...w, on: false, finished: !!finished, at: Date.now() } });
	if (w.blocked) {
		const f = (await chrome.storage.local.get("kamyar_focus")).kamyar_focus;
		if (f && f.on) await chrome.storage.local.set({ kamyar_focus: { ...f, on: false } });
	}
}
// Buttons on the floating timer.
chrome.runtime.onMessage.addListener((m, _s, reply) => {
	if (!m || m.kamyar !== "pomo") return;
	(async () => {
		const s = (await chrome.storage.local.get(POMO))[POMO];
		if (!s) return;
		if (m.op === "toggle") {
			const next = s.running ? { ...s, running: false, remaining: Math.max(0, s.endAt - Date.now()) } : { ...s, running: true, endAt: Date.now() + (s.remaining || DUR[s.mode]) };
			await chrome.storage.local.set({ [POMO]: next });
			if (next.running) chrome.alarms.create("hamyar-pomo", { when: next.endAt });
			else chrome.alarms.clear("hamyar-pomo");
		} else if (m.op === "stop") {
			await chrome.storage.local.set({ [POMO]: { ...s, running: false, mode: "focus", remaining: DUR.focus } });
			chrome.alarms.clear("hamyar-pomo");
			await endWebFocus(false);
		}
		reply({ ok: true });
	})();
	return true;
});

/* ---------- Screenshots (right-click › Rubi screenshot, or the keyboard shortcuts) ----------
 * The capture is kept in memory here and handed to capture.html, which stitches, previews and saves it. */
const SHOT_TITLES = {
	fa: { parent: "📸 عکس از صفحه (روبی)", visible: "بخش دیده‌شده‌ی صفحه", full: "کل صفحه (تا پایین)", area: "انتخاب یک ناحیه…", delay: "بخش دیده‌شده، بعد از ۳ ثانیه" },
	en: { parent: "📸 Rubi screenshot", visible: "Visible part", full: "Entire page", area: "Select an area…", delay: "Visible part in 3 seconds" },
	fr: { parent: "📸 Capture Rubi", visible: "Partie visible", full: "Page entière", area: "Choisir une zone…", delay: "Partie visible dans 3 s" },
	de: { parent: "📸 Rubi-Screenshot", visible: "Sichtbarer Bereich", full: "Ganze Seite", area: "Bereich auswählen…", delay: "Sichtbarer Bereich in 3 s" }
};
const shots = new Map(); // id -> capture, until the capture page takes it
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let lastGrab = 0;
// Chrome allows about two captures a second.
async function grab(windowId) {
	const gap = Date.now() - lastGrab;
	if (gap < 550) await wait(550 - gap);
	lastGrab = Date.now();
	return chrome.tabs.captureVisibleTab(windowId, { format: "png" });
}
async function inTab(tabId, func, args = []) {
	const [r] = await chrome.scripting.executeScript({ target: { tabId }, func, args });
	return r && r.result;
}
function pageInfo() {
	const d = document.documentElement, b = document.body || d;
	return { w: innerWidth, h: innerHeight, total: Math.max(d.scrollHeight, b.scrollHeight), x: scrollX, y: scrollY, dpr: devicePixelRatio, title: document.title, url: location.href };
}
// While the page is stitched, things fixed to the screen (headers, chat buttons) would repeat in every strip.
function hideFixed(hide) {
	if (hide) {
		if (window.__kamyarFixed) return;
		const list = [];
		for (const el of document.querySelectorAll("body *")) {
			const p = getComputedStyle(el).position;
			if (p === "fixed" || p === "sticky") { list.push([el, el.style.visibility]); el.style.visibility = "hidden"; }
		}
		window.__kamyarFixed = list;
		document.documentElement.style.scrollBehavior = "auto";
	} else {
		for (const [el, v] of window.__kamyarFixed || []) el.style.visibility = v;
		window.__kamyarFixed = null;
	}
}
// Lets the person drag a rectangle; resolves with it (in CSS pixels of the viewport) or null on Escape.
function pickArea(labels) {
	return new Promise((done) => {
		const o = document.createElement("div");
		o.style.cssText = "position:fixed;inset:0;z-index:2147483647;cursor:crosshair;background:rgba(0,0,0,.25)";
		const box = document.createElement("div");
		box.style.cssText = "position:fixed;border:2px solid #4f8cff;background:rgba(79,140,255,.12);box-shadow:0 0 0 9999px rgba(0,0,0,.35);display:none;pointer-events:none";
		const tip = document.createElement("div");
		tip.textContent = labels.tip;
		tip.style.cssText = "position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#111a;color:#fff;font:600 13px system-ui,Tahoma,sans-serif;padding:8px 14px;border-radius:999px;pointer-events:none";
		o.append(box, tip);
		document.documentElement.append(o);
		let s = null;
		const end = (r) => { o.remove(); removeEventListener("keydown", key, true); setTimeout(() => done(r), 120); };
		const key = (e) => { if (e.key === "Escape") { e.preventDefault(); end(null); } };
		addEventListener("keydown", key, true);
		o.addEventListener("pointerdown", (e) => { s = { x: e.clientX, y: e.clientY }; o.setPointerCapture(e.pointerId); tip.remove(); });
		o.addEventListener("pointermove", (e) => {
			if (!s) return;
			const x = Math.min(s.x, e.clientX), y = Math.min(s.y, e.clientY), w = Math.abs(e.clientX - s.x), h = Math.abs(e.clientY - s.y);
			Object.assign(box.style, { display: "block", left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
			o.style.background = "transparent";
		});
		o.addEventListener("pointerup", (e) => {
			if (!s) return;
			const r = { x: Math.min(s.x, e.clientX), y: Math.min(s.y, e.clientY), w: Math.abs(e.clientX - s.x), h: Math.abs(e.clientY - s.y) };
			end(r.w > 4 && r.h > 4 ? r : null);
		});
	});
}
async function takeShot(kind, tab) {
	const t = await bgT();
	try {
		const info = await inTab(tab.id, pageInfo);
		let shot = { kind, title: info.title || tab.title || "", url: info.url || tab.url || "", dpr: info.dpr, w: info.w, at: Date.now(), parts: [] };
		if (kind === "visible" || kind === "delay") {
			if (kind === "delay") await wait(3000);
			shot.parts.push({ y: 0, data: await grab(tab.windowId) });
			shot.h = info.h;
		} else if (kind === "area") {
			const { hamyar_lang: lang } = await chrome.storage.local.get("hamyar_lang");
			const tips = { fa: "یک ناحیه را با موس بکشید (Esc برای لغو)", en: "Drag to select an area (Esc to cancel)", fr: "Glissez pour choisir une zone (Échap pour annuler)", de: "Bereich mit der Maus ziehen (Esc bricht ab)" };
			const r = await inTab(tab.id, pickArea, [{ tip: tips[lang] || tips.en }]);
			if (!r) return;
			shot.parts.push({ y: 0, data: await grab(tab.windowId) });
			shot.h = info.h;
			shot.crop = r;
		} else {
			// Entire page: scroll down a screen at a time and capture each strip (up to 40 screens).
			const total = Math.min(info.total, info.h * 40);
			await inTab(tab.id, hideFixed, [false]);
			for (let y = 0; y < total; y += info.h) {
				const at = await inTab(tab.id, (yy) => { scrollTo(0, yy); return new Promise((r) => requestAnimationFrame(() => setTimeout(() => r(scrollY), 160))); }, [y]);
				if (y > 0) await inTab(tab.id, hideFixed, [true]);
				shot.parts.push({ y: at, data: await grab(tab.windowId) });
				if (at + info.h >= total) break;
			}
			await inTab(tab.id, hideFixed, [false]);
			await inTab(tab.id, (x, y) => scrollTo(x, y), [info.x, info.y]);
			shot.h = total;
		}
		const id = "s" + Date.now().toString(36);
		shots.set(id, shot);
		// Also kept in session storage in case this worker is restarted before the page asks (small captures only).
		try { await chrome.storage.session.set({ ["kamyar_shot_" + id]: shot }); } catch {}
		chrome.tabs.create({ url: chrome.runtime.getURL("capture.html#" + id), index: tab.index + 1, openerTabId: tab.id });
	} catch (e) {
		chrome.notifications.create("hamyar-shot-" + Date.now(), { type: "basic", iconUrl: "icons/icon-128.png", title: t("shotFail"), message: String((e && e.message) || e).slice(0, 180), priority: 1 });
	}
}
chrome.runtime.onMessage.addListener((m, _s, reply) => {
	if (!m || m.kamyar !== "shot") return;
	(async () => {
		let s = shots.get(m.id);
		if (!s) s = (await chrome.storage.session.get("kamyar_shot_" + m.id).catch(() => ({})))["kamyar_shot_" + m.id];
		shots.delete(m.id);
		chrome.storage.session.remove("kamyar_shot_" + m.id).catch(() => {});
		reply(s || null);
	})();
	return true;
});
chrome.commands?.onCommand.addListener(async (cmd, tab) => {
	if (!cmd.startsWith("shot-")) return;
	tab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
	if (tab) takeShot(cmd.slice(5), tab);
});
