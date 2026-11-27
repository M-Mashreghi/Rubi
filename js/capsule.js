/* Time capsule (fun page): write a letter to your future self; it stays sealed until the day you choose and then
 * arrives with a small celebration. Letters are ordinary Rubi records ("capsule"), so they are part of the
 * Google Drive backup when Drive sync is on and come back on a new computer. */
(function () {
	"use strict";
	const { $, el, num, setting, toast } = H;
	const DAY = 864e5;
	const today = () => H.dayKey();
	const letters = () => Store.list("capsule").sort((a, b) => (a.openAt || "").localeCompare(b.openAt || ""));
	const due = (c) => !c.opened && (c.openAt || "") <= today();
	const daysLeft = (c) => Math.max(0, Math.round((new Date(c.openAt + "T12:00:00") - new Date(today() + "T12:00:00")) / DAY));
	const fmt = (key) => { const d = new Date(key + "T12:00:00"); const [a] = H.calOrder(); return H.fmtDate(d, a, false); };
	const MOODS = ["😊", "🥰", "🤞", "💪", "😌", "🌱", "✨", "😂"];

	function envelope(cls = "") {
		const w = el("div", { class: "env " + cls, "aria-hidden": "true" });
		w.innerHTML = '<svg viewBox="0 0 160 110"><rect class="env-back" x="4" y="14" width="152" height="92" rx="8"/><rect class="env-paper" x="16" y="20" width="128" height="80" rx="4"/><path class="env-lines" d="M30 40 H128 M30 52 H120 M30 64 H124 M30 76 H96"/><path class="env-front" d="M4 34 L80 76 L156 34 V98 a8 8 0 0 1 -8 8 H12 a8 8 0 0 1 -8 -8 Z"/><path class="env-flap" d="M4 22 a8 8 0 0 1 8 -8 H148 a8 8 0 0 1 8 8 L80 70 Z"/><g class="env-seal"><circle cx="80" cy="66" r="13"/><path d="M80 73 l-6.5 -6.3 a4 4 0 0 1 6.5 -5 a4 4 0 0 1 6.5 5 Z"/></g></svg>';
		return w;
	}

	/* ---------- writing ---------- */
	let dlg;
	function dialog() {
		if (!dlg) { dlg = el("dialog", { id: "capsuleDialog", class: "dialog capsule-dlg" }); document.body.append(dlg); }
		return dlg;
	}
	function addMonths(n) { const d = new Date(); d.setMonth(d.getMonth() + n); return H.dayKey(d); }
	function nextBirthday() {
		const bd = setting("birthday", "");
		if (!bd || !bd.date) return "";
		const b = new Date(bd.date + "T12:00:00"), now = new Date();
		const d = new Date(now.getFullYear(), b.getMonth(), b.getDate(), 12);
		if (H.dayKey(d) <= today()) d.setFullYear(d.getFullYear() + 1);
		return H.dayKey(d);
	}
	function nextNowruz() {
		const y = new Date().getFullYear();
		for (const yy of [y, y + 1]) { const at = window.Celebrate?.equinox(yy); if (at && H.dayKey(at) > today()) return H.dayKey(at); }
		return "";
	}
	function write() {
		const d = dialog();
		let mood = "";
		const title = el("input", { type: "text", maxlength: "80", placeholder: t("capTitlePh") });
		const text = el("textarea", { class: "capsule-text", maxlength: "20000", placeholder: t("capTextPh") });
		const date = el("input", { type: "date", min: H.dayKey(new Date(Date.now() + DAY)), value: addMonths(12) });
		const quick = [["capIn1m", addMonths(1)], ["capIn6m", addMonths(6)], ["capIn1y", addMonths(12)], ["capIn5y", addMonths(60)], ["capNowruz", nextNowruz()], ["capBday", nextBirthday()]].filter((x) => x[1]);
		const chips = el("div", { class: "fun-row cap-quick" }, ...quick.map(([k, v]) => el("button", { type: "button", class: "chip-s" + (v === date.value ? " on" : ""), onclick: (e) => { date.value = v; chips.querySelectorAll(".chip-s").forEach((c) => c.classList.toggle("on", c === e.currentTarget)); } }, t(k))));
		date.addEventListener("input", () => chips.querySelectorAll(".chip-s").forEach((c) => c.classList.remove("on")));
		const moods = el("div", { class: "fun-row cap-moods" }, ...MOODS.map((m) => el("button", { type: "button", class: "cap-mood", onclick: (e) => { mood = mood === m ? "" : m; moods.querySelectorAll(".cap-mood").forEach((b) => b.classList.toggle("on", b.textContent === mood)); } }, m)));
		const seal = el("button", { type: "button", class: "btn", onclick: async () => {
			if (!text.value.trim()) { text.focus(); return toast(t("capEmpty")); }
			if (!date.value || date.value <= today()) { date.focus(); return toast(t("capFuture")); }
			const body = d.querySelector(".dialog-body");
			const env = envelope("sealing");
			body.replaceChildren(el("div", { class: "cap-sealing" }, env, el("strong", {}, t("capSealed", { date: fmt(date.value) }))));
			await Store.add("capsule", { title: title.value.trim(), text: text.value, openAt: date.value, writtenAt: Date.now(), mood, opened: false });
			H.bump("capsules");
			const r = env.getBoundingClientRect();
			setTimeout(() => Fx.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2, count: 50, power: 360, colors: ["#e5484d", "#f5b301", "#ff7b9c"] }), 900);
			setTimeout(() => d.open && d.close(), 2600);
		} }, "💌 " + t("capSeal"));
		d.replaceChildren(el("div", { class: "dialog-body" },
			el("div", { class: "fun-row" }, el("h3", { class: "grow" }, "✍️ " + t("capWrite")), el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => d.close() }, "✕")),
			el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("capWriteHint")),
			el("label", {}, t("capTitle"), title),
			el("label", {}, t("capText"), text),
			el("label", {}, t("capOpenOn"), date), chips,
			el("div", {}, el("small", { class: "muted" }, t("capMood")), moods),
			el("p", { class: "muted small", style: "margin:0" }, "☁️ " + t(driveOn() ? "capDriveOn" : "capDriveOff")),
			el("div", { class: "dialog-actions" }, el("span"), seal)));
		if (!d.open) d.showModal();
		text.focus();
	}

	/* ---------- opening ---------- */
	function read(c, celebrate) {
		const d = dialog();
		if (celebrate && !c.opened) Store.update(c.id, { opened: true, openedAt: Date.now() });
		const ago = Math.max(1, Math.round((Date.now() - (c.writtenAt || Date.now())) / DAY));
		const env = envelope(celebrate ? "opening" : "open");
		const paper = el("div", { class: "cap-letter" + (celebrate ? " rise" : "") },
			el("small", { class: "muted" }, t("capWrittenOn", { date: fmt(H.dayKey(new Date(c.writtenAt || Date.now()))), n: num(ago) })),
			c.title ? el("h3", {}, (c.mood ? c.mood + " " : "") + c.title) : c.mood ? el("h3", {}, c.mood) : "",
			el("div", { class: "cap-body", dir: "auto" }, c.text));
		d.replaceChildren(el("div", { class: "dialog-body" },
			el("div", { class: "fun-row" }, el("h3", { class: "grow" }, "💌 " + t("capFromPast")), el("button", { type: "button", class: "icon-btn", "aria-label": t("close"), onclick: () => d.close() }, "✕")),
			celebrate ? env : "", paper,
			el("div", { class: "dialog-actions" },
				el("button", { type: "button", class: "btn btn-ghost small", onclick: () => navigator.clipboard.writeText((c.title ? c.title + "\n\n" : "") + c.text).then(() => toast(t("copied"))) }, "📋 " + t("histCopy")),
				el("span", { class: "grow" }),
				el("button", { type: "button", class: "btn small", onclick: () => { d.close(); write(); } }, "✍️ " + t("capReply")))));
		if (!d.open) d.showModal();
		if (celebrate) setTimeout(() => { const r = d.getBoundingClientRect(); Fx.confetti({ x: r.left + r.width / 2, y: r.top + 80, count: 120, power: 560, colors: "party" }); }, 700);
	}
	/** A letter whose day has come shows up at the page edge once a day. */
	function arrived() {
		const ready = letters().filter(due);
		if (!ready.length || document.querySelector(".care-card.cap-pop") || document.getElementById("celebrate")) return;
		let seen = "";
		try { seen = localStorage.getItem("rubi_cap_seen") || ""; } catch {}
		if (seen === today()) return;
		try { localStorage.setItem("rubi_cap_seen", today()); } catch {}
		const c = ready[0];
		const card = el("div", { class: "care-card cap-pop", role: "status" },
			el("span", { class: "care-ic" }, "💌"),
			el("div", { class: "care-body" }, el("strong", {}, t("capArrived")), el("p", {}, t("capArrivedMsg", { date: fmt(H.dayKey(new Date(c.writtenAt || Date.now()))) })),
				el("div", { class: "care-actions" }, el("button", { type: "button", class: "btn small", onclick: () => { card.remove(); read(c, true); } }, "📬 " + t("capOpen")))),
			el("button", { type: "button", class: "care-x", "aria-label": t("close"), onclick: () => card.remove() }, "✕"));
		$("careStack").append(card);
		requestAnimationFrame(() => card.classList.add("in"));
	}

	/* ---------- the card ---------- */
	const driveOn = () => ["ok", "syncing"].includes($("syncChip")?.dataset.state);
	function cardBody() {
		const all = letters();
		const body = el("div", { class: "fun-capsule" });
		const list = el("ul", { class: "cap-list" }, ...all.map((c) => {
			const ready = due(c), open = c.opened;
			const sub = open ? t("capOpenedOn", { date: fmt(c.openAt) }) : ready ? t("capReady") : `${fmt(c.openAt)} · ${t("celeInDays", { n: num(daysLeft(c)) })}`;
			return el("li", { class: open ? "opened" : ready ? "ready" : "sealed" },
				el("span", { class: "cap-ic" }, open ? "📖" : ready ? "📬" : "🔒"),
				el("div", { class: "grow" }, el("strong", {}, c.title || t("capUntitled")), el("small", { class: "muted" }, sub)),
				open || ready ? el("button", { type: "button", class: "btn small" + (open ? " btn-ghost" : ""), onclick: () => read(c, !open) }, t(open ? "capRead" : "capOpen"))
					: el("button", { type: "button", class: "icon-btn small", title: t("delete"), "aria-label": t("delete"), onclick: () => { const snap = { ...c }; Store.remove(c.id); toast(t("capDeleted"), { run: () => { delete snap.id; Store.add("capsule", snap); } }); } }, "🗑"));
		}));
		body.append(
			all.length ? list : el("div", { class: "cap-empty" }, envelope("idle"), el("p", { class: "muted", style: "margin:0;line-height:1.8" }, t("capIntro"))),
			el("div", { class: "fun-row" },
				el("button", { type: "button", class: "btn", onclick: write }, "✍️ " + t("capWrite")),
				el("span", { class: "grow" }),
				driveOn() ? el("small", { class: "muted" }, "☁️ " + t("capDriveShort")) : el("button", { type: "button", class: "chip-s", onclick: () => H.driveConnect?.() }, "☁️ " + t("capConnect"))));
		return body;
	}
	let body = cardBody();
	H.funCard("capsule", { icon: "💌", title: "capTitleCard", order: 25, body });
	const rebuild = () => { const nb = cardBody(); body.replaceWith(nb); body = nb; };
	H.onRefresh(() => { rebuild(); setTimeout(arrived, 1500); });
	new MutationObserver(rebuild).observe($("syncChip"), { attributes: true, attributeFilter: ["data-state"] });
	setTimeout(arrived, 6000);
	H.openCapsule = write;
	window.Capsule = { write, read, letters, arrived, due };
})();
