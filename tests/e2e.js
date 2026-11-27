/* Rubi end-to-end checks: loads the extension in Chromium and walks through the main features.
 * Run: npm install && npx playwright install chromium && npm test
 * Network calls are answered with fixed sample data, so the run needs no internet and no keys. */
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const EXT = path.resolve(__dirname, "..");
let failed = 0, passed = 0;
function check(name, ok, info) {
	if (ok) { passed++; console.log("  ✓ " + name); }
	else { failed++; console.log("  ✗ " + name + (info !== undefined ? "  → " + JSON.stringify(info) : "")); }
}

function i18nParity() {
	const sandbox = { window: {}, localStorage: { getItem: () => null }, document: { querySelectorAll: () => [], documentElement: { setAttribute() {}, lang: "" } }, navigator: { language: "fa" }, chrome: { storage: { local: { get: async () => ({}) } } } };
	const fn = new Function(...Object.keys(sandbox), fs.readFileSync(path.join(EXT, "js/i18n.js"), "utf8"));
	fn(...Object.values(sandbox));
	new Function(...Object.keys(sandbox), fs.readFileSync(path.join(EXT, "js/i18n-fun.js"), "utf8"))(...Object.values(sandbox));
	const D = sandbox.window.I18n.strings;
	const all = new Set(Object.values(D).flatMap((x) => Object.keys(x)));
	for (const l of Object.keys(D)) {
		const miss = [...all].filter((k) => !(k in D[l]));
		check(`translations: ${l} has every key`, miss.length === 0, miss.slice(0, 10));
	}
}

(async () => {
	console.log("Translations");
	i18nParity();

	const ctx = await chromium.launchPersistentContext("", {
		headless: true, channel: "chromium",
		// A fake camera and microphone that are allowed without a prompt, for the voice changer and camera background.
		args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
		viewport: { width: 1440, height: 900 }
	});
	const sw = ctx.serviceWorkers()[0] || (await ctx.waitForEvent("serviceworker", { timeout: 20000 }));
	const id = sw.url().split("/")[2];
	// Sample answers for every outside service.
	await ctx.route(/^https?:\/\//, (r) => {
		const u = r.request().url();
		if (u.includes("air-quality-api.open-meteo.com")) return r.fulfill({ json: { current: { us_aqi: 42, pm2_5: 8 } } });
		if (u.includes("api.open-meteo.com")) return r.fulfill({ json: { current: { temperature_2m: 20, apparent_temperature: 19, relative_humidity_2m: 40, weather_code: 0, is_day: 1, wind_speed_10m: 5 }, daily: { time: ["2026-01-01"], weather_code: [0], temperature_2m_max: [22], temperature_2m_min: [10], sunrise: ["2026-01-01T07:00"], sunset: ["2026-01-01T17:00"] } } });
		if (u.includes("translate.googleapis.com")) return r.fulfill({ json: [[["Hello", "سلام"]], null, "fa"] });
		if (u.includes("thesportsdb.com")) return r.fulfill({ json: { teams: [{ idTeam: "1", strTeam: "Test FC", strSport: "Soccer" }], results: [], events: [] } });
		return r.abort();
	});
	const page = await ctx.newPage();
	const errors = [];
	page.on("pageerror", (e) => errors.push(e.message));
	await page.addInitScript(() => {
		localStorage.setItem("kamyar_brief_day", new Date().toISOString().slice(0, 10));
		localStorage.setItem("kamyar_week_shown", "x");
		localStorage.setItem("kamyar_journal_nudge", "x");
		if (!sessionStorage.getItem("promo-test")) localStorage.setItem("kamyar_upd_dismissed", "store");
	});
	const url = `chrome-extension://${id}/newtab.html`;

	console.log("First run");
	await page.goto(url);
	// Wait for the setup instead of a fixed time: the CI machines are slower than a desktop.
	// (The page can reload once on a first run, which cancels a single wait, so keep trying until a deadline.)
	for (const end = Date.now() + 15000; Date.now() < end; ) {
		const ok = await page.evaluate(() => !document.getElementById("setup").hidden).catch(() => false);
		if (ok) break;
		await page.waitForTimeout(250);
	}
	check("setup opens on first run (before the tour)", await page.evaluate(() => !document.getElementById("setup").hidden && document.getElementById("tour").hidden), await page.evaluate(() => ({ setup: document.getElementById("setup").hidden, tour: document.getElementById("tour").hidden, ls: Object.keys(localStorage), wall: localStorage.getItem("hamyar_wall_id") })));
	await page.click("#setupNext"); // welcome → data
	await page.click("#setupNext"); // data → you
	await page.click("#setupBody .av-btn >> nth=9");
	check("an avatar can be picked in setup", (await page.evaluate(() => H.setting("avatar", ""))) === "avatars/man-2.svg");
	await page.fill('#setupBody input[type="text"]', "Sam");
	await page.click("#setupNext"); // you → city
	await page.click("#setupNext"); // city → look
	await page.click("#setupNext"); // look → boxes
	check("prayer reminder starts off in setup", await page.evaluate(() => [...document.querySelectorAll("#setupBody .manage-item")].some((x) => /prayer|نماز/i.test(x.textContent) && !x.querySelector("input").checked)));
	await page.click("#setupNext"); // boxes → site flag
	check("site flag is offered in setup and starts off", await page.evaluate(() => document.getElementById("setupBody").dataset.step === "flag" && !H.setting("siteFlag", false)));
	await page.click("#setupNext"); // site flag → done
	check("setup saved the name", (await page.textContent("#setupBody")).includes("Sam"));
	await page.click("#setupNext"); // done → tour
	await page.waitForTimeout(500);
	check("tour opens after setup", await page.evaluate(() => !document.getElementById("tour").hidden && localStorage.getItem("kamyar_setup_done") === "1"));
	await page.click("#tourSkip");
	check("tour closes and is remembered", await page.evaluate(() => localStorage.getItem("kamyar_tour_done") === "1"));
	await page.evaluate(async () => { await window.hamyarReady; Store.setSetting("lang", "en"); });
	await page.waitForTimeout(300);

	console.log("Search");
	check("calculator answers sums", await page.evaluate(() => H.calcAnswer("12*(3+4)")?.text === "84"));
	check("unit converter", await page.evaluate(() => /6\.2/.test(H.calcAnswer("10 km to miles")?.text || "")));

	console.log("Shortcuts and folders");
	await page.evaluate(() => {
		const a = Store.add("folder", { title: "Outer" });
		const b = Store.add("folder", { title: "Inner", folder: a.id });
		Store.add("bookmark", { title: "Inside", url: "https://example.com", folder: b.id });
	});
	await page.waitForTimeout(300);
	const top = await page.$$eval("#bookmarkList .bm-name", (a) => a.map((x) => x.textContent));
	check("nested folder is not on the main grid", top.includes("Outer") && !top.includes("Inner"), top);
	await page.click("#bookmarkList .bm-open");
	await page.click("#folderList .bm-open");
	await page.waitForTimeout(200);
	check("inner folder opens with a breadcrumb", (await page.textContent("#folderTitle")).includes("Outer"));
	await page.keyboard.press("Escape");

	console.log("Tasks and calendar");
	await page.evaluate(() => Store.add("todo", { text: "Test task" }));
	check("task is stored", await page.evaluate(() => Store.list("todo").some((x) => x.text === "Test task")));
	check("calendar has days", (await page.$$("#calGrid > *")).length > 27);

	console.log("Reminders");
	await page.evaluate(() => H.careShow("water"));
	await page.waitForTimeout(300);
	check("water card shows", (await page.$$(".care-card.water")).length === 1);
	await page.click(".care-card.water .care-x");
	await page.waitForTimeout(400);
	check("card closes with ✕", (await page.$$(".care-card.water")).length === 0);

	console.log("Countdown");
	await page.click(".trip-add");
	await page.click("#tripPresets .chip >> nth=0");
	check("preset fills a future date", (await page.inputValue("#tripDate")) > new Date().toISOString().slice(0, 10));
	await page.click('#tripForm button[value="save"]');
	await page.waitForTimeout(300);
	check("countdown card shows days", /\d/.test(await page.textContent("#tripCard .trip-days")));

	console.log("Goals, journal, world clock");
	await page.click('.rail-btn[data-go="tools"]');
	await page.waitForTimeout(300);
	await page.evaluate(() => { const d = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }; Store.add("goal", { title: "Books", target: 10, done: 5, start: d(-10), end: d(10) }); });
	await page.waitForTimeout(200);
	check("goal forecast", /on track|pace/i.test(await page.textContent("#goalList")));
	await page.fill("#journalForm .j-line >> nth=0", "Sunshine");
	await page.click("#journalForm button[type=submit]");
	await page.waitForTimeout(200);
	check("journal entry saved", await page.evaluate(() => Store.list("journal").length === 1));
	check("world clock shows cities", (await page.$$(".wc")).length >= 3);
	const cols = await page.evaluate(() => new Set([...document.querySelectorAll("#viewTools [data-widget]:not([hidden])")].map((w) => Math.round(w.getBoundingClientRect().left))).size);
	check("tools page uses several columns", cols >= 3, cols);
	const toolsOrder = () => page.evaluate(() => [...document.querySelectorAll("#viewTools .widgets > [data-widget]")].map((b) => b.dataset.widget));
	const firstBox = (await toolsOrder())[0];
	await page.hover(`[data-widget="${firstBox}"]`);
	await page.focus(`[data-widget="${firstBox}"] > .drag-h`);
	await page.keyboard.press("ArrowDown");
	await page.waitForTimeout(200);
	check("a box moves and its place is saved", (await toolsOrder())[1] === firstBox && (await page.evaluate(() => H.setting("toolsOrder")[1])) === firstBox);
	await page.click(`[data-widget="${firstBox}"] > .box-size`);
	await page.waitForTimeout(200);
	check("a box can be made wide", await page.evaluate((w) => document.querySelector(`[data-widget="${w}"]`).classList.contains("wide"), firstBox));
	await page.click("#viewTools .tools-bar .chip:last-child");
	await page.waitForTimeout(200);
	check("default layout comes back", (await toolsOrder())[0] === firstBox && !(await page.evaluate(() => document.querySelector("#viewTools .wide"))));

	console.log("Family sharing");
	await page.evaluate(() => Store.add("event", { kind: "birthday", title: "Mum", date: "1970-03-05", repeat: "yearly", allDay: true }));
	const roundTrip = await page.evaluate(async () => {
		H.openShare();
		document.getElementById("shCopy").click();
		await new Promise((r) => setTimeout(r, 500));
		return true;
	});
	check("share dialog works", roundTrip && (await page.evaluate(() => document.getElementById("shareDialog").open)));
	await page.keyboard.press("Escape");

	await page.click('.rail-btn[data-go="home"]');
	console.log("Boxes and features");
	await page.hover('[data-widget="daily"]');
	await page.click('[data-widget="daily"] > .box-x');
	await page.waitForTimeout(200);
	check("✕ hides a box", await page.evaluate(() => document.querySelector('[data-widget="daily"]').hidden));
	await page.click("#toast .link-btn");
	await page.waitForTimeout(200);
	check("undo brings it back", await page.evaluate(() => !document.querySelector('[data-widget="daily"]').hidden));
	await page.evaluate(() => H.openManage());
	await page.click("#manageRail .manage-item:nth-child(4) input");
	await page.waitForTimeout(200);
	check("side bar button can be turned off", await page.evaluate(() => document.getElementById("trBtn").hidden));
	await page.click("#manageAllOn");
	await page.waitForTimeout(200);
	check("turn everything on", await page.evaluate(() => !document.getElementById("trBtn").hidden));
	await page.keyboard.press("Escape");

	console.log("Services");
	await page.click('.rail-btn[data-go="apps"]');
	await page.waitForTimeout(400);
	await page.click('.svc-tab[data-g="iran"]');
	await page.waitForTimeout(200);
	check("Iranian tab lists Iranian categories only", (await page.$("#apps-ir-bank")) !== null && (await page.$("#apps-google")) === null);
	await page.fill(".svc-search", "digikala");
	await page.waitForTimeout(200);
	check("search finds a site across tabs", (await page.textContent("#svcBody")).includes("Digikala"));
	await page.fill(".svc-search", "");
	await page.click('.svc-tab[data-g="iran"]');
	await page.waitForTimeout(200);
	await page.hover("#apps-ir-sport");
	await page.click("#apps-ir-sport .svc-hide");
	await page.waitForTimeout(200);
	check("a category can be hidden", (await page.$("#apps-ir-sport")) === null);
	await page.click(".svc-manage");
	await page.fill("#svcNewName", "Work");
	await page.click("#svcNewForm button");
	await page.waitForTimeout(500);
	await page.fill(".apps-sec.mine .svc-add-site input >> nth=0", "Example");
	await page.fill(".apps-sec.mine .svc-add-site input >> nth=1", "example.com");
	await page.click(".apps-sec.mine .svc-add-site button");
	await page.waitForTimeout(300);
	check("own category with a site", (await page.textContent(".apps-sec.mine")).includes("Example"));
	await page.evaluate(() => Store.setSetting("svcOff", {}));
	await page.click('.rail-btn[data-go="home"]');

	console.log("Prayer reminder");
	check("prayer reminder is off by default", await page.evaluate(() => !document.getElementById("salatChk").checked && !H.setting("salat", {})?.on));

	console.log("Translator");
	await page.keyboard.press("Alt+t");
	await page.fill("#trIn", "سلام");
	await page.waitForTimeout(900);
	check("translation shows", (await page.textContent("#trOut")).includes("Hello"));
	await page.keyboard.press("Escape");

	console.log("Languages");
	for (const l of ["fa", "fr", "de", "en"]) {
		await page.evaluate((l) => Store.setSetting("lang", l), l);
		await page.waitForTimeout(250);
		check(`page switches to ${l}`, (await page.evaluate(() => document.documentElement.lang)) === l);
	}

	console.log("Welcome sound");
	check("welcome sound is off by default", !(await page.evaluate(() => (H.setting("welcomeSound", {}) || {}).on)));
	const chimes = await page.evaluate(async () => { const out = []; for (const id of Chimes.ids) { const c = new OfflineAudioContext(1, 44100 * 3, 44100); Chimes.play(c, id, 0.6); const d = (await c.startRendering()).getChannelData(0); let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x)); out.push(pk); } return out; });
	check("every built-in chime makes a sound without clipping", chimes.length >= 6 && chimes.every((p) => p > 0.05 && p < 1), chimes);

	console.log("Dastyar import");
	const ds = await page.evaluate(() => {
		const before = Store.list("bookmark").length + Store.list("folder").length;
		const B = (id, name, url, parentId, position) => ({ id, name, url, parentId, position, type: "bookmark", icon: { type: "x", data: "" } });
		const F = (id, name, parentId, position) => ({ id, name, parentId, position, type: "folder" });
		const json = { source: "dastyar", storage: {
			bookmarks_new: { root: [B("a", "Alpha", "https://alpha.test/", "root", 0), F("f1", "Work", "root", 1), B("c", "Gamma", "https://gamma.test/", "root", 2)],
				f1: [B("d", "Delta", "https://delta.test/", "f1", 0), F("f2", "Deep", "f1", 1)], f2: [B("e", "Eps", "https://eps.test/", "f2", 0)] },
			bookmarks: [{ title: "Old", items: [{ name: "Legacy", url: "https://legacy.test/" }] }],
			pinned_bookmark: [{ name: "Ad", url: "https://ad.test/" }],
			favicons: { "https://alpha.test": "data:image/png;base64,iVBORw0KGgo=" } } };
		const res = DastyarImport.importInto(json, { replace: true });
		const items = [...Store.list("bookmark"), ...Store.list("folder")];
		const top = items.filter((x) => !x.folder).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((x) => x.title);
		const work = items.find((x) => x.title === "Work"), deep = items.find((x) => x.title === "Deep");
		const shape = [top.join(","), items.filter((x) => x.folder === work?.id).map((x) => x.title).sort().join(","), items.filter((x) => x.folder === deep?.id).map((x) => x.title).join(","), items.some((x) => /Legacy|Ad/.test(x.title))];
		res.undo && res.undo();
		const after = Store.list("bookmark").length + Store.list("folder").length;
		return { shape, restored: before === after };
	});
	check("Dastyar shortcuts keep their order and nested folders", ds.shape.join("|") === "Alpha,Work,Gamma|Deep,Delta|Eps|false", ds.shape);
	check("undo brings back the old shortcuts", ds.restored);

	console.log("Readable text over see-through boxes");
	const ink = await page.evaluate(async () => {
		const wait = () => new Promise((r) => setTimeout(r, 400));
		const c = document.createElement("canvas"); c.width = c.height = 8;
		const g = c.getContext("2d"); g.fillStyle = "#0a0c14"; g.fillRect(0, 0, 8, 8);
		const dark = c.toDataURL("image/png");
		Store.setSetting("theme", "light"); Themes.setWallpaper(dark); Themes.setBoxAlpha(5, 30); await wait();
		const a = document.documentElement.className;
		Themes.setBoxAlpha(90, 95); await wait();
		const b = document.documentElement.className;
		Themes.setWallpaper(null); Themes.setBoxAlpha(60, 85); Store.setSetting("theme", "dark"); await wait();
		return [a.includes("ink-light"), !/ink-/.test(b)];
	});
	check("light text on a dark picture when boxes are almost clear", ink[0], ink);
	check("theme text stays when boxes are solid", ink[1], ink);

	console.log("Hiding boxes");
	const boxes = await page.evaluate(async () => {
		const out = [];
		for (const w of ["daily", "trip"]) {
			const box = document.querySelector(`[data-widget="${w}"]`);
			const x = box.querySelector(":scope > .box-x");
			out.push(!!x);
			x && x.click();
			await new Promise((r) => setTimeout(r, 300));
			out.push(box.offsetParent === null);
			Store.setSetting("widgets", { ...(H.setting("widgets", {}) || {}), [w]: true });
			await new Promise((r) => setTimeout(r, 300));
			out.push(box.offsetParent !== null);
		}
		return out;
	});
	check("the daily and countdown boxes can be hidden with ✕ and turned back on", boxes.every(Boolean), boxes);

	console.log("Fonts and glass theme");
	const fonts = await page.evaluate(async () => { const r = []; for (const [, fam] of Themes.FONT_LIST.filter(([id]) => ["roboto", "garamond", "fira", "jost"].includes(id))) { const f = fam.split(",")[0]; await document.fonts.load(`16px ${f}`, "Grüße Été"); r.push(document.fonts.check(`16px ${f}`, "Grüße Été")); } return r; });
	check("English, French and German fonts are bundled", fonts.length === 4 && fonts.every(Boolean), fonts);
	const glass = await page.evaluate(async () => { Store.setSetting("theme", "glass"); await new Promise((r) => setTimeout(r, 300)); const on = document.documentElement.classList.contains("theme-glass"); Store.setSetting("theme", "dark"); await new Promise((r) => setTimeout(r, 300)); return [on, !document.documentElement.classList.contains("theme-glass")]; });
	check("glass theme switches on and off", glass.every(Boolean), glass);

	console.log("Updates");
	const upd = await page.evaluate(async () => {
		localStorage.removeItem("kamyar_upd_dismissed");
		await chrome.storage.local.set({ kamyar_update: null });
		await new Promise((r) => setTimeout(r, 200));
		location.hash = "";
		return true;
	});
	await page.evaluate(() => sessionStorage.setItem("promo-test", "1"));
	await page.reload(); await page.waitForTimeout(1200);
	const promo = await page.evaluate(() => { const b = document.getElementById("updateBar"); return [!b.hidden, !!b.querySelector('a[href*="chromewebstore.google.com/detail/ohpaebogaegajgcgeemadkdinfohpemp"]')]; });
	check("a copy from the zip points to the Chrome Web Store", promo.every(Boolean), promo);
	await page.evaluate(async () => { await chrome.storage.local.set({ kamyar_update: { at: Date.now(), latest: "99.0.0", newer: true, store: true, ready: true } }); await new Promise((r) => setTimeout(r, 300)); });
	const ready = await page.evaluate(() => { const b = document.getElementById("updateBar"); return [!b.hidden, b.textContent.includes("99.0.0")]; });
	check("a downloaded store update offers Update now", ready.every(Boolean), ready);
	await page.evaluate(async () => { await chrome.storage.local.set({ kamyar_update: null }); localStorage.setItem("kamyar_upd_dismissed", "store"); sessionStorage.removeItem("promo-test"); });

	console.log("Site flag");
	const geo = await sw.evaluate(async () => Promise.all(["8.8.8.8", "2.144.0.1", "2a01:4f8::1", "::ffff:8.8.4.4", "192.168.1.1"].map((ip) => KamyarFlag.countryOf(ip))));
	check("server addresses map to countries inside the extension", geo.join(",") === "US,IR,DE,US,", geo);
	const icon = await sw.evaluate(async () => { const d = await KamyarFlag.drawIcon("IR"); return [d[16].width, d[32].width]; });
	check("flag icon is drawn at 16 and 32 px", icon.join() === "16,32", icon);

	console.log("Fun page");
	await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach((d) => d.close()); document.getElementById("celebrate")?.remove(); });
	await page.click('.rail-btn[data-go="fun"]');
	check("fun page opens with its cards", await page.evaluate(() => !document.getElementById("viewFun").hidden && ["history", "saying", "cele", "badges", "games", "pet", "sky", "astro", "voice", "cam", "capsule", "fortune", "breathe", "wxscene", "composer"].every((id) => document.getElementById("fun-" + id))));
	const hist = await page.evaluate(async () => {
		H.openHistory(new Date(2026, 10, 27, 12));
		await new Promise((r) => setTimeout(r, 200));
		const b = document.getElementById("histBody").textContent;
		const r = [b.includes("Nobel"), /1895/.test(b) && /1274/.test(b), b.includes("Khordad")];
		document.getElementById("histDialog").close();
		return r;
	});
	check("today in history shows an event with both its Gregorian and Persian dates, and the ancient day name", hist.every(Boolean), hist);
	const eq = await page.evaluate(() => [Celebrate.equinox(2026).toISOString(), Celebrate.equinox(2027).toISOString()]);
	check("the new year moment is computed to the minute", Math.abs(new Date(eq[0]) - Date.UTC(2026, 2, 20, 14, 46)) < 120000 && Math.abs(new Date(eq[1]) - Date.UTC(2027, 2, 20, 20, 25)) < 120000, eq);
	const suri = await page.evaluate(() => [Celebrate.todays(new Date(2027, 2, 16, 12)).some((c) => c.id === "suri"), Celebrate.todays(new Date(2026, 11, 21, 12)).some((c) => c.id === "yalda"), Celebrate.todays(new Date(2027, 2, 21, 12)).some((c) => c.id === "nowruz")]);
	check("Chaharshanbe Suri, Yalda and Nowruz fall on the right days", suri.every(Boolean), suri);
	const cele = await page.evaluate(async () => {
		H.celebrate("birthday");
		await new Promise((r) => setTimeout(r, 300));
		const o = document.getElementById("celebrate");
		const shown = !!o && !!o.querySelector(".cake");
		o.querySelector(".cele-actions .btn").click();
		await new Promise((r) => setTimeout(r, 200));
		const blown = o.querySelector(".cake").classList.contains("out");
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await new Promise((r) => setTimeout(r, 500));
		return [shown, blown, !document.getElementById("celebrate")];
	});
	check("a birthday scene opens, the candles blow out, and Escape closes it", cele.every(Boolean), cele);
	const story = await page.evaluate(async () => {
		H.openStory();
		await new Promise((r) => setTimeout(r, 1200));
		const c = document.getElementById("storyCanvas");
		const px = c.getContext("2d").getImageData(540, 960, 1, 1).data;
		document.getElementById("storyDialog").close();
		return [c.width === 1080 && c.height === 1920, px[3] === 255];
	});
	check("the saying of the day draws a 1080×1920 story picture", story.every(Boolean), story);
	const badge = await page.evaluate(async () => { H.bump("fal"); await new Promise((r) => setTimeout(r, 400)); return !!(H.setting("badges", {}) || {}).fal1; });
	check("a Hafez fal earns the first badge", badge);
	await page.evaluate(() => { document.querySelectorAll(".badge-pop").forEach((c) => c.remove()); Fx.clear(); });
	const games = await page.evaluate(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		await Store.setSetting("gamesFree", false);
		await chrome.storage.local.set({ rubi_break: { at: 1, until: 0 } });
		await wait(100);
		const lockedFirst = !BreakGames.open();
		H.openGame("2048");
		const lockShown = !!document.querySelector("#gameDialog .g-locked");
		// A focus session ends: the break opens the games and offers them.
		await chrome.storage.local.set({ rubi_break: { at: Date.now(), until: Date.now() + 5 * 60000 } });
		await wait(200);
		const invited = !!document.querySelector(".care-card.game-pop");
		document.querySelectorAll(".care-card.game-pop").forEach((c) => c.remove());
		H.openGame("2048");
		localStorage.removeItem("rubi_2048");
		BreakGames.G.restart();
		for (let i = 0; i < 40 && !BreakGames.G.over; i++) { BreakGames.G.move(i % 4); await wait(5); }
		const played = BreakGames.G.score > 0 && (H.funStats().gamesPlayed || 0) >= 1;
		H.openGame("snake");
		BreakGames.S.turn(2);
		await wait(400);
		const moving = BreakGames.S.state === "run";
		document.getElementById("gameDialog").close();
		return [lockedFirst, lockShown, BreakGames.open(), invited, played, moving];
	});
	check("break games stay locked until a focus session ends, then open and invite, and 2048 and Snake play", games.every(Boolean), games);
	const pet = await page.evaluate(async () => {
		const wait = (ms) => new Promise((r) => setTimeout(r, ms));
		const offFirst = !document.getElementById("petHome") && !(H.setting("pet", {}) || {}).on;
		localStorage.removeItem("rubi_pet_asked"); await Store.setSetting("petAsked", false);
		document.querySelectorAll("dialog[open]").forEach((d) => d.close());
		const asked = Pet.invite() && !!document.querySelector(".care-card.pet-ask");
		document.querySelector(".pet-ask .btn:not(.btn-ghost)").click();
		await wait(100);
		document.querySelectorAll(".pet-kind")[2].click();
		document.querySelector("#petDialog .dialog-actions .btn:not(.btn-ghost)").click();
		await wait(300);
		const home = document.querySelector("#petHome .pet-svg.parrot");
		const before = Pet.stats().xp;
		await Store.add("todo", { text: "pet test", done: true, doneAt: Date.now() });
		await wait(300);
		const grew = Pet.stats().xp === before + 10;
		const bubble = !document.querySelector("#petHome .pet-bubble").hidden;
		const tricked = Object.keys(PetFx.TRICKS).length === 8 && !!Pet.show("flip") === false && document.querySelector("#petHome .pet-body").classList.contains("tr-flip");
		Pet.feed();
		await wait(100);
		const fed = Date.now() - H.setting("pet", {}).fed < 5000;
		await Store.setSetting("pet", { ...H.setting("pet", {}), on: false });
		await wait(100);
		return [offFirst, asked, !!home, grew, bubble, tricked, fed, !document.getElementById("petHome"), !Pet.invite()];
	});
	check("the pet is off until asked, can be adopted, grows with a finished task, reacts, does its own tricks, eats and can be turned off", pet.every(Boolean), pet);
	const sky = await page.evaluate(() => {
		const m = Sky.moonSvg(0.25);
		const ev = Sky.events(new Date(2026, 10, 27, 12));
		const r1 = Sky.reading(6, new Date(2026, 10, 27)), r2 = Sky.reading(6, new Date(2026, 10, 27));
		return [/<path d="M50 10 A40 40 0 0 1 50 90/.test(m), ev[0].name.length > 0 && ev[0].at.getMonth() === 11, r1.gen === r2.gen && r1.lucky === r2.lucky, Sky.animalOf(1405) === 6 && Sky.animalOf(1403) === 4, Sky.signOf(new Date(1990, 9, 5, 12)) === 6, !!document.getElementById("fun-sky") && !!document.getElementById("fun-astro")];
	});
	check("the sky card draws the moon, lists coming events, and the horoscope gives one reading a day with the Persian animal year", sky.every(Boolean), sky);
	const voice = await page.evaluate(async () => {
		const sr = 22050, x = new Float32Array(sr);
		for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 180 * i) / sr) * 0.5;
		VoiceFx.ready(x, sr);
		const res = [];
		for (const id of ["robot", "girl", "monster", "cave", "reverse"]) { await VoiceFx.apply(id); const o = VoiceFx.out; res.push(o.length >= x.length && o.every((v) => Number.isFinite(v)) && o.some((v) => Math.abs(v) > 0.5)); }
		const w = VoiceFx.wav(VoiceFx.out, sr);
		res.push(w.size === 44 + VoiceFx.out.length * 2, (H.funStats().voice || 0) >= 1);
		return res;
	});
	check("the voice changer turns a recording into robot, girl, monster, cave and reverse voices and saves a WAV", voice.every(Boolean), voice);
	const cam = await page.evaluate(async () => {
		const off = !CamBg.get().on && !document.getElementById("camBg")?.srcObject;
		await CamBg.setOn(true);
		await new Promise((r) => setTimeout(r, 600));
		const on = !!CamBg.stream && !document.getElementById("camBg").hidden && document.documentElement.classList.contains("cam-on");
		await CamBg.setOn(false);
		return [off, on, !CamBg.stream, document.getElementById("camBg").hidden];
	});
	check("the camera background is off until turned on, shows the camera and turns it off again", cam.every(Boolean), cam);
	const cap = await page.evaluate(async () => {
		document.querySelectorAll("dialog[open]").forEach((d) => d.close());
		Capsule.write();
		const d = document.getElementById("capsuleDialog");
		d.querySelector("textarea").value = "Dear future me";
		const tomorrow = H.dayKey(new Date(Date.now() + 2 * 864e5));
		d.querySelector("input[type=date]").value = tomorrow;
		d.querySelector(".dialog-actions .btn").click();
		await new Promise((r) => setTimeout(r, 400));
		const sealed = Store.list("capsule").find((c) => c.text === "Dear future me");
		const card = document.getElementById("fun-capsule");
		const locked = !!sealed && sealed.openAt === tomorrow && !Capsule.due(sealed) && card.querySelector("li.sealed") && !card.querySelector("li.sealed .btn");
		await new Promise((r) => setTimeout(r, 2500));
		await Store.update(sealed.id, { openAt: H.dayKey() });
		localStorage.removeItem("rubi_cap_seen");
		Capsule.arrived();
		const pop = document.querySelector(".care-card.cap-pop");
		pop?.querySelector(".btn").click();
		await new Promise((r) => setTimeout(r, 300));
		const read = d.open && d.querySelector(".cap-body")?.textContent === "Dear future me" && Store.list("capsule").some((x) => x.id === sealed.id && x.opened);
		d.close();
		return [!!locked, !!pop, read, (H.funStats().capsules || 0) >= 1];
	});
	check("a time-capsule letter stays sealed until its day, then arrives and opens (kept with the synced data)", cap.every(Boolean), cap);
	const fr = await page.evaluate(async () => {
		const c = document.createElement("canvas"); c.width = c.height = 300; const x = c.getContext("2d");
		x.fillStyle = "#eee4d6"; x.fillRect(0, 0, 300, 300); x.fillStyle = "#2b1a10";
		[[90, 90, 30], [210, 140, 20], [150, 230, 35]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
		const img = new Image(); img.src = c.toDataURL(); await img.decode();
		const r = Fortune.readCup(img);
		const blank = document.createElement("canvas"); blank.width = blank.height = 100; const bx = blank.getContext("2d"); bx.fillStyle = "#fff"; bx.fillRect(0, 0, 100, 100);
		const bimg = new Image(); bimg.src = blank.toDataURL(); await bimg.decode();
		const rb = Fortune.readCup(bimg);
		Fortune.spread();
		await new Promise((res) => setTimeout(res, 300));
		const sp = document.querySelectorAll("#tarotDialog .tarot").length;
		document.querySelectorAll("dialog[open]").forEach((d) => d.close());
		const daily = Fortune.dailyIndex();
		return [r.marks.length === 3, r.marks.every((m) => m.sym >= 0 && m.sym < FortuneData.coffee.length), rb.marks.length === 3, sp === 3, daily === Fortune.dailyIndex() && daily >= 0 && daily < 22, ["fa", "en", "fr", "de"].every((l) => FortuneData.text[l].tarot.length === 22 && FortuneData.text[l].coffee.length === FortuneData.coffee.length && FortuneData.text[l].ball.length === 20)];
	});
	check("fortunes: the coffee cup photo gives three readings, a three-card tarot spread and a steady card of the day", fr.every(Boolean), fr);
	const br = await page.evaluate(async () => {
		Store.setSetting("breathe", { pattern: "box", min: 1, sound: false });
		Breathe.start();
		await new Promise((r) => setTimeout(r, 1500));
		const ov = document.getElementById("breathe");
		const ok = Breathe.running && ov && ov.dataset.phase === "0" && ov.querySelector(".br-circle").classList.contains("big");
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await new Promise((r) => setTimeout(r, 500));
		return [!!ok, !Breathe.running, !document.getElementById("breathe")];
	});
	check("the breathing exercise grows the circle on the in-breath and stops with Esc", br.every(Boolean), br);
	const wxs = await page.evaluate(async () => {
		const saved = H.wx;
		const kinds = [[63, 1], [73, 1], [95, 0], [45, 1], [3, 1], [0, 0], [0, 1], [53, 1]].map(([c, d]) => WxScene.kindOf(c, d));
		H.wx = { ...(saved || {}), city: "Test", code: 73, isDay: 1, wind: 10 };
		window.dispatchEvent(new Event("hamyar-wx"));
		await new Promise((r) => setTimeout(r, 400));
		const cv = document.getElementById("wxScene");
		const snowing = WxScene.kind === "snow" && !cv.hidden && cv.width > 0;
		Store.setSetting("wxScene", { on: false });
		await new Promise((r) => setTimeout(r, 200));
		const off = cv.hidden && !WxScene.kind;
		Store.setSetting("wxScene", { on: true });
		H.wx = saved; window.dispatchEvent(new Event("hamyar-wx"));
		return [kinds.join() === "rain,snow,storm,fog,clouds,night,sun,drizzle", snowing, off];
	});
	check("the live weather scene follows the weather (rain, snow, storm, fog, clouds, night sky) and turns off", wxs.every(Boolean), wxs);
	const cmp = await page.evaluate(async () => {
		Store.setSetting("composer", { dg: "shur", inst: "santour" });
		Composer.open();
		const keys = document.querySelectorAll("#composerDialog .cmp-key").length;
		const shur = [7, 8, 9].map((n) => Composer.cents("shur", n));
		const mahurOct = Composer.cents("mahur", 14) - Composer.cents("mahur", 7);
		document.querySelector("#composerDialog .cmp-rec").click();
		for (const code of ["KeyA", "KeyS", "KeyD"]) { document.dispatchEvent(new KeyboardEvent("keydown", { code, key: "x" })); await new Promise((r) => setTimeout(r, 60)); document.dispatchEvent(new KeyboardEvent("keyup", { code, key: "x" })); }
		document.querySelector("#composerDialog .cmp-rec").click();
		const notes = (Composer.last?.notes || []).map((x) => x[1]).join();
		const b = await Composer.toWav({ ...Composer.last, dg: "segah", inst: "ney" });
		const before = (Store.get().settings.tunes || []).length;
		Composer.keep();
		const after = (Store.get().settings.tunes || []).length;
		document.getElementById("composerDialog").close();
		return [keys === 22, shur.join() === "-500,-350,-200", mahurOct === 1200, notes === "7,8,9", b.size > 44 * 1000, after === before + 1];
	});
	check("the composer plays a dastgah from the keyboard (quarter tones included), records, keeps and saves a WAV", cmp.every(Boolean), cmp);
	await page.evaluate(() => { Fx.clear(); document.querySelectorAll(".care-card").forEach((c) => c.remove()); H.showView("home"); });

	check("no page errors", errors.length === 0, errors);
	await ctx.close();
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
