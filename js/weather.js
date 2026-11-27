/* Weather from Open-Meteo (free, no API key, no account, no tracking).
 * Only the chosen city's coordinates are sent. The city is saved in settings and syncs with Drive. */
(function () {
	"use strict";
	const { $, el, num, setting } = H;
	const CACHE_KEY = "hamyar_weather_cache";
	const TTL = 30 * 60 * 1000;
	const n0 = (v) => num(Math.round(v));
	// Open-Meteo gives the city's local time without an offset ("2026-11-16T06:41"): show it as-is.
	const localTime = (iso) => {
		const [h, m] = String(iso).slice(11, 16).split(":").map(Number);
		return new Intl.DateTimeFormat(I18n.locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" }).format(Date.UTC(2000, 0, 1, h, m));
	};

	function describe(code, isDay = 1) {
		if (code === 0) return [isDay ? "☀️" : "🌙", "wxClear"];
		if (code === 1) return [isDay ? "🌤️" : "🌙", "wxMostlyClear"];
		if (code === 2) return ["⛅", "wxPartly"];
		if (code === 3) return ["☁️", "wxCloudy"];
		if (code === 45 || code === 48) return ["🌫️", "wxFog"];
		if (code >= 51 && code <= 57) return ["🌦️", "wxDrizzle"];
		if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ["🌧️", "wxRain"];
		if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["🌨️", "wxSnow"];
		if (code >= 95) return ["⛈️", "wxStorm"];
		return ["🌡️", ""];
	}

	function showForm(show) {
		$("wxForm").hidden = !show;
		$("wxResults").hidden = true;
		$("wxEdit").hidden = show && !setting("city");
		if (show) $("wxCity").focus({ preventScroll: true });
	}
	const message = (text, isError) => $("wxBody").replaceChildren(el("p", { class: isError ? "error" : "muted" }, text));

	async function fetchJson(url) {
		const res = await fetch(url);
		if (!res.ok) throw new Error("HTTP " + res.status);
		return res.json();
	}

	let data = null;
	async function load(city, force) {
		const key = `${city.lat},${city.lon}`;
		const cached = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY];
		if (!force && cached && cached.key === key && Date.now() - cached.at < TTL) return cached.data;
		const url =
			`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}` +
			"&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m" +
			"&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&timezone=auto&forecast_days=5";
		try {
			const d = await fetchJson(url);
			// Air quality (US AQI and PM2.5) from Open-Meteo's air-quality service; the weather still shows if it fails.
			try {
				const a = await fetchJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.lat}&longitude=${city.lon}&current=us_aqi,pm2_5,pm10&timezone=auto`);
				if (a.current && a.current.us_aqi != null) d.aq = { aqi: a.current.us_aqi, pm25: a.current.pm2_5, pm10: a.current.pm10 };
			} catch {}
			await chrome.storage.local.set({ [CACHE_KEY]: { key, at: Date.now(), data: d } });
			return d;
		} catch (e) {
			if (cached && cached.key === key) return { ...cached.data, stale: true };
			throw e;
		}
	}

	// US AQI bands: 0-50 good, 51-100 moderate, 101-150 unhealthy for sensitive groups, 151-200 unhealthy, 201-300 very unhealthy, 301+ hazardous.
	function aqiLevel(v) {
		const L = [[50, "aqGood", "#22c55e"], [100, "aqModerate", "#eab308"], [150, "aqSensitive", "#f97316"], [200, "aqUnhealthy", "#ef4444"], [300, "aqVeryUnhealthy", "#a855f7"], [1e9, "aqHazardous", "#7f1d1d"]];
		const i = L.findIndex(([max]) => v <= max);
		return { key: L[i][1], color: L[i][2], bad: i >= 2, i };
	}
	H.aqiLevel = aqiLevel;
	function aqiWarn(city, aq) {
		const lv = aqiLevel(aq.aqi);
		if (!lv.bad) return;
		const k = "kamyar_aqi_warned", day = new Date().toDateString() + city.name;
		try { if (localStorage.getItem(k) === day) return; localStorage.setItem(k, day); } catch {}
		H.toast(t("aqWarn", { city: city.name, n: num(Math.round(aq.aqi)), level: t(lv.key) }));
	}
	function draw(city) {
		const d = data;
		const c = d.current;
		const [icon, label] = describe(c.weather_code, c.is_day);
		H.wx = { icon, label: t(label), temp: n0(c.temperature_2m), city: city.name, hi: n0(d.daily.temperature_2m_max[0]), lo: n0(d.daily.temperature_2m_min[0]), aq: d.aq || null, code: c.weather_code, isDay: c.is_day, wind: c.wind_speed_10m };
		window.dispatchEvent(new Event("hamyar-wx"));
		const dayFmt = new Intl.DateTimeFormat(I18n.locale, { weekday: "short", timeZone: "UTC" });
		const days = el(
			"ul",
			{ class: "wx-days" },
			...d.daily.time.map((iso, i) => {
				const [ic, lb] = describe(d.daily.weather_code[i]);
				return el("li", { title: t(lb) }, el("span", { class: "muted small" }, i === 0 ? t("today") : dayFmt.format(new Date(iso + "T12:00Z"))), el("span", { class: "wx-day-icon" }, ic), el("span", { class: "small" }, `${n0(d.daily.temperature_2m_max[i])}° / ${n0(d.daily.temperature_2m_min[i])}°`));
			})
		);
		$("wxBody").replaceChildren(
			el("div", { class: "wx-now" }, el("span", { class: "wx-icon" }, icon), el("div", {}, el("div", { class: "wx-temp" }, `${n0(c.temperature_2m)}°`), el("div", { class: "muted small" }, `${city.name} · ${t(label)}`))),
			el("div", { class: "wx-meta muted small" }, [t("feels", { t: n0(c.apparent_temperature) + "°" }), t("humidity", { h: n0(c.relative_humidity_2m) }), t("wind", { w: n0(c.wind_speed_10m) }), `${t("sunrise")} ${localTime(d.daily.sunrise[0])}`, `${t("sunset")} ${localTime(d.daily.sunset[0])}`].join(" · ")),
			...(d.aq ? [(() => {
				const lv = aqiLevel(d.aq.aqi);
				return el("div", { class: "aq-row" + (lv.bad ? " bad" : ""), style: `--aq:${lv.color}` },
					el("span", { class: "aq-badge" }, num(Math.round(d.aq.aqi))),
					el("div", { class: "aq-text" }, el("strong", {}, t("aqTitle") + ": " + t(lv.key)), el("small", { class: "muted" }, "PM2.5 " + num(Math.round(d.aq.pm25 ?? 0)) + " µg/m³" + (lv.bad ? " · " + t("aqAdvice") : ""))));
			})()] : []),
			days,
			...(d.stale ? [el("p", { class: "muted small" }, t("offlineCached"))] : [])
		);
	}

	async function render(force = false) {
		if (!H.widgetOn("weather")) return;
		const city = setting("city");
		if (!city) {
			message(t("enterCity"));
			H.wx = null;
			window.dispatchEvent(new Event("hamyar-wx"));
			showForm(true);
			return;
		}
		showForm(false);
		if (!data || force) {
			if (!$("wxBody").childElementCount) message(t("loading"));
			try {
				data = await load(city, force);
			} catch {
				message(t("wxFail"), true);
				return;
			}
		}
		draw(city);
		if (data.aq) aqiWarn(city, data.aq);
	}

	$("wxEdit").addEventListener("click", () => {
		const open = $("wxForm").hidden;
		showForm(open);
		if (open) $("wxCity").value = (setting("city") || {}).name || "";
	});

	$("wxForm").addEventListener("submit", async (e) => {
		e.preventDefault();
		const q = $("wxCity").value.trim();
		if (!q) return;
		const list = $("wxResults");
		list.hidden = false;
		list.replaceChildren(el("li", { class: "muted small" }, t("searching")));
		try {
			const r = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=${I18n.lang}&format=json`);
			const results = r.results || [];
			if (!results.length) return list.replaceChildren(el("li", { class: "muted small" }, t("cityNotFound")));
			list.replaceChildren(
				...results.map((p) =>
					el("li", {}, el("button", { class: "wx-pick", type: "button", onclick: () => { data = null; $("wxBody").replaceChildren(); Store.setSetting("city", { name: p.name, lat: +p.latitude.toFixed(3), lon: +p.longitude.toFixed(3), tz: p.timezone || null }); } }, [p.name, p.admin1, p.country].filter(Boolean).join(", ")))
				)
			);
		} catch {
			list.replaceChildren(el("li", { class: "error" }, t("searchFail")));
		}
	});

	let sig = "";
	H.onRefresh(() => {
		const s = JSON.stringify([I18n.lang, setting("city") || null, H.widgetOn("weather")]);
		if (s === sig) return;
		const cityChanged = sig && JSON.parse(sig)[1] && JSON.stringify(JSON.parse(sig)[1]) !== JSON.stringify(setting("city") || null);
		sig = s;
		if (cityChanged) data = null;
		render();
	});
	setInterval(() => document.visibilityState === "visible" && render(true), TTL);
	window.addEventListener("online", () => render(true));
})();
