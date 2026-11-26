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
		args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
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

	console.log("Site flag");
	const geo = await sw.evaluate(async () => Promise.all(["8.8.8.8", "2.144.0.1", "2a01:4f8::1", "::ffff:8.8.4.4", "192.168.1.1"].map((ip) => KamyarFlag.countryOf(ip))));
	check("server addresses map to countries inside the extension", geo.join(",") === "US,IR,DE,US,", geo);
	const icon = await sw.evaluate(async () => { const d = await KamyarFlag.drawIcon("IR"); return [d[16].width, d[32].width]; });
	check("flag icon is drawn at 16 and 32 px", icon.join() === "16,32", icon);

	check("no page errors", errors.length === 0, errors);
	await ctx.close();
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
