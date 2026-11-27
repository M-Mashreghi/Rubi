/* Live camera background (Settings › Background, and a card on the fun page). Off until the person turns it on
 * and allows the camera. The picture is only shown in this tab: it is never recorded, saved or sent, and the
 * camera is switched off whenever the tab is hidden. The choice is kept on this computer only. */
(function () {
	"use strict";
	const { $, el, toast } = H;
	const KEY = "rubi_cam";
	const LOOKS = { natural: "", soft: "blur(6px) saturate(1.1)", bw: "grayscale(1) contrast(1.1)", vintage: "sepia(0.6) contrast(1.05) saturate(0.9)", neon: "saturate(2.2) contrast(1.25) hue-rotate(40deg)", dream: "blur(14px) saturate(1.5) brightness(1.05)" };
	const get = () => { try { return { on: false, mirror: true, look: "soft", ...(JSON.parse(localStorage.getItem(KEY) || "{}")) }; } catch { return { on: false, mirror: true, look: "soft" }; } };
	const put = (patch) => { const c = { ...get(), ...patch }; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {} return c; };
	let stream = null, video = null, starting = false;
	const ui = new Set();

	function node() {
		if (!video) {
			video = el("video", { id: "camBg", class: "bg-video cam-bg", muted: true, autoplay: true, playsinline: true, hidden: true });
			video.muted = true;
			$("bgVideo").after(video);
		}
		return video;
	}
	function look() {
		const c = get(), v = node();
		v.classList.toggle("mirror", !!c.mirror);
		v.style.setProperty("--cam-filter", LOOKS[c.look] ?? "");
	}
	async function start() {
		if (stream || starting) return true;
		if (!navigator.mediaDevices?.getUserMedia) { toast(t("camNone")); return false; }
		starting = true;
		try {
			stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }, audio: false });
		} catch (e) {
			starting = false;
			toast(t(e && e.name === "NotFoundError" ? "camNone" : "camDenied"));
			return false;
		}
		starting = false;
		if (!get().on || document.hidden) { stop(); return true; }
		const v = node();
		v.srcObject = stream;
		v.hidden = false;
		v.play().catch(() => {});
		look();
		wall(true);
		return true;
	}
	function stop() {
		stream?.getTracks().forEach((x) => x.stop());
		stream = null;
		if (video) { video.srcObject = null; video.hidden = true; }
		wall(false);
	}
	/** With the camera behind them, the boxes turn see-through like with a wallpaper. */
	function wall(on) {
		const root = document.documentElement;
		root.classList.toggle("cam-on", on);
		if (on) {
			root.classList.add("has-wall");
			root.style.setProperty("--wall-dim", String(Math.max(0, Math.min(85, Themes.dim())) / 100));
		} else if (!Themes.hasWall() && !Themes.hasVideo()) root.classList.remove("has-wall");
	}
	async function setOn(on) {
		put({ on });
		if (on) { const ok = await start(); if (!ok) put({ on: false }); }
		else stop();
		sync();
	}
	function sync() { ui.forEach((f) => f()); }

	/** The controls: a switch, mirror and a look. Used in settings and on the fun page. */
	function controls() {
		const c = get();
		const sw = el("input", { type: "checkbox", class: "switch", checked: c.on, onchange: (e) => setOn(e.target.checked) });
		const mirror = el("input", { type: "checkbox", checked: c.mirror, onchange: (e) => { put({ mirror: e.target.checked }); look(); sync(); } });
		const sel = el("select", { onchange: (e) => { put({ look: e.target.value }); look(); sync(); } }, ...Object.keys(LOOKS).map((k) => el("option", { value: k }, t("camLook_" + k))));
		sel.value = c.look;
		const box = el("div", { class: "cam-ctl" },
			el("label", { class: "tog-card" }, el("span", { class: "tc-ic" }, "📷"), el("span", { class: "grow" }, el("strong", {}, t("camOn")), el("small", { class: "muted" }, t("camPrivacy"))), sw),
			el("div", { class: "fun-row cam-opts" }, el("label", { class: "g-free" }, mirror, " " + t("camMirror")), el("label", { class: "g-free" }, t("camLook") + " ", sel)));
		const refresh = () => { const n = get(); sw.checked = n.on; mirror.checked = n.mirror; sel.value = n.look; box.classList.toggle("off", !n.on); };
		refresh();
		ui.add(() => (box.isConnected ? refresh() : null));
		return box;
	}

	// settings › background
	const sec = document.querySelector('.set-sec[data-sec="background"]');
	const holder = el("div", { class: "cam-set" });
	if (sec) {
		const anchor = $("wallDimRow");
		anchor.before(el("h4", { "data-i18n": "camTitle" }, t("camTitle")), holder);
		holder.append(controls());
	}
	// fun page card
	const funBody = el("div", { class: "fun-cam" }, el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("camIntro")), controls());
	H.funCard("cam", { icon: "📷", title: "camTitle", order: 65, body: funBody });
	H.onRefresh(() => {
		if (stream) wall(true);
		holder.replaceChildren(controls());
		funBody.replaceChildren(el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("camIntro")), controls());
	});
	// The camera is only on while this tab is in front.
	document.addEventListener("visibilitychange", () => {
		if (!get().on) return;
		if (document.hidden) stop(); else start();
	});
	if (get().on && !document.hidden) start();
	window.CamBg = { start, stop, setOn, get, LOOKS, get stream() { return stream; } };
})();
