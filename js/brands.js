/* Bundled brand logos for popular sites (icons/brands), so shortcuts and services look right offline.
 * Unknown sites use Google's public favicon service, then a letter badge. */
(function () {
	"use strict";
	// "host[/path]": [file, needs a light backing (dark logo)]
	const MAP = {"claude.ai":["claude-ai.svg",0],"bing.com":["bing-com.svg",0],"search.brave.com":["search-brave-com.svg",0],"duckduckgo.com":["duckduckgo-com.svg",0],"yandex.com":["yandex-com.svg",0],"chatgpt.com":["chatgpt-com.svg",1],"chat.qwen.ai":["chat-qwen-ai.svg",0],"chat.deepseek.com":["chat-deepseek-com.svg",0],"notebooklm.google.com":["notebooklm-google-com.svg",1],"gemini.google.com":["gemini-google-com.svg",0],"perplexity.ai":["perplexity-ai.svg",0],"copilot.microsoft.com":["copilot-microsoft-com.svg",0],"grok.com":["grok-com.svg",1],"chat.mistral.ai":["chat-mistral-ai.svg",0],"huggingface.co":["huggingface-co.svg",0],"google.com":["google-com.svg",0],"mail.google.com":["mail-google-com.svg",0],"drive.google.com":["drive-google-com.svg",0],"docs.google.com/document":["docs-google-com-document.svg",0],"docs.google.com/spreadsheets":["docs-google-com-spreadsheets.svg",0],"docs.google.com/presentation":["docs-google-com-presentation.svg",0],"docs.google.com/forms":["docs-google-com-forms.svg",0],"docs.google.com":["docs-google-com.svg",0],"calendar.google.com":["calendar-google-com.svg",0],"meet.google.com":["meet-google-com.svg",0],"chat.google.com":["chat-google-com.svg",0],"keep.google.com":["keep-google-com.svg",0],"tasks.google.com":["tasks-google-com.svg",0],"contacts.google.com":["contacts-google-com.svg",0],"photos.google.com":["photos-google-com.svg",0],"maps.google.com":["maps-google-com.svg",0],"earth.google.com":["earth-google-com.svg",0],"translate.google.com":["translate-google-com.svg",0],"youtube.com":["youtube-com.svg",0],"music.youtube.com":["music-youtube-com.svg",0],"news.google.com":["news-google-com.svg",0],"scholar.google.com":["scholar-google-com.svg",0],"books.google.com":["books-google-com.svg",0],"google.com/finance":["google-com-finance.svg",0],"google.com/travel":["google-com-travel.svg",0],"play.google.com":["play-google-com.svg",0],"classroom.google.com":["classroom-google-com.svg",0],"sites.google.com":["sites-google-com.svg",0],"colab.research.google.com":["colab-research-google-com.svg",0],"lens.google.com":["lens-google-com.svg",0],"trends.google.com":["trends-google-com.svg",0],"artsandculture.google.com":["artsandculture-google-com.svg",0],"fonts.google.com":["fonts-google-com.svg",0],"blogger.com":["blogger-com.svg",0],"analytics.google.com":["analytics-google-com.svg",0],"search.google.com":["search-google-com.svg",0],"ads.google.com":["ads-google-com.svg",0],"console.cloud.google.com":["console-cloud-google-com.svg",0],"console.firebase.google.com":["console-firebase-google-com.svg",0],"one.google.com":["one-google-com.svg",0],"passwords.google.com":["passwords-google-com.svg",0],"myaccount.google.com":["myaccount-google-com.svg",0],"open.spotify.com":["open-spotify-com.svg",0],"spotify.com":["spotify-com.svg",0],"soundcloud.com":["soundcloud-com.svg",0],"music.apple.com":["music-apple-com.svg",0],"deezer.com":["deezer-com.svg",0],"instagram.com":["instagram-com.svg",0],"x.com":["x-com.svg",1],"twitter.com":["twitter-com.svg",1],"web.telegram.org":["web-telegram-org.svg",0],"telegram.org":["telegram-org.svg",0],"web.whatsapp.com":["web-whatsapp-com.svg",0],"whatsapp.com":["whatsapp-com.svg",0],"linkedin.com":["linkedin-com.svg",0],"reddit.com":["reddit-com.svg",0],"facebook.com":["facebook-com.svg",0],"threads.net":["threads-net.svg",1],"threads.com":["threads-com.svg",1],"discord.com":["discord-com.svg",0],"pinterest.com":["pinterest-com.svg",0],"netflix.com":["netflix-com.svg",0],"twitch.tv":["twitch-tv.svg",0],"imdb.com":["imdb-com.svg",0],"github.com":["github-com.svg",1],"gitlab.com":["gitlab-com.svg",0],"stackoverflow.com":["stackoverflow-com.svg",0],"vercel.com":["vercel-com.svg",1],"app.netlify.com":["app-netlify-com.svg",0],"netlify.com":["netlify-com.svg",0],"dash.cloudflare.com":["dash-cloudflare-com.svg",0],"cloudflare.com":["cloudflare-com.svg",0],"portal.azure.com":["portal-azure-com.svg",0],"dropbox.com":["dropbox-com.svg",0],"onedrive.live.com":["onedrive-live-com.svg",0],"mega.nz":["mega-nz.svg",0],"coursera.org":["coursera-org.svg",0],"udemy.com":["udemy-com.svg",0],"khanacademy.org":["khanacademy-org.svg",0],"edx.org":["edx-org.svg",0],"duolingo.com":["duolingo-com.svg",0],"wikipedia.org":["wikipedia-org.svg",1],"speedtest.net":["speedtest-net.svg",0],"virustotal.com":["virustotal-com.svg",0],"ilovepdf.com":["ilovepdf-com.svg",0],"fast.com":["fast-com.svg",0],"ebay.com":["ebay-com.svg",0],"aliexpress.com":["aliexpress-com.svg",0],"airbnb.com":["airbnb-com.svg",0],"booking.com":["booking-com.svg",0],"store.steampowered.com":["store-steampowered-com.svg",1],"steampowered.com":["steampowered-com.svg",1],"store.epicgames.com":["store-epicgames-com.svg",1],"epicgames.com":["epicgames-com.svg",1],"playstation.com":["playstation-com.svg",0],"ign.com":["ign-com.svg",0],"gog.com":["gog-com.svg",1],"itch.io":["itch-io.svg",1],"battle.net":["battle-net.svg",1],"rockstargames.com":["rockstargames-com.svg",0],"metacritic.com":["metacritic-com.svg",1],"ea.com":["ea-com.svg",1],"ubisoft.com":["ubisoft-com.svg",1],"deviantart.com":["deviantart-com.svg",0],"unsplash.com":["unsplash-com.svg",1],"pexels.com":["pexels-com.svg",0],"cnn.com":["cnn-com.svg",0],"nytimes.com":["nytimes-com.svg",1],"washingtonpost.com":["washingtonpost-com.svg",1],"nbcnews.com":["nbcnews-com.svg",0],"theguardian.com":["theguardian-com.svg",0],"axios.com":["axios-com.svg",0]};
	function find(url) {
		let u;
		try {
			u = new URL(url);
		} catch {
			return null;
		}
		let host = u.hostname.replace(/^www\./, "");
		const seg = u.pathname.split("/")[1];
		if (seg && MAP[host + "/" + seg]) return MAP[host + "/" + seg];
		while (host.includes(".")) {
			if (MAP[host]) return MAP[host];
			host = host.slice(host.indexOf(".") + 1);
		}
		return null;
	}
	const s2 = (url) => "https://www.google.com/s2/favicons?sz=64&domain_url=" + encodeURIComponent(url);
	function letter(name, size) {
		const s = document.createElement("span");
		s.className = "letter-icon";
		s.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.55)}px`;
		s.textContent = (name || "?").trim().charAt(0).toUpperCase();
		return s;
	}
	// Logos downloaded into icons/sites by the "Fetch site logos" workflow (js/site-icons.js).
	function siteIcon(url) {
		const map = window.SITE_ICONS || {};
		try {
			const host = new URL(url).hostname.replace(/^www\./, "");
			return map[host] ? `icons/sites/${host}.${map[host]}` : null;
		} catch {
			return null;
		}
	}
	// Site icons brought over from Dastyar (chrome.storage.local "kamyar_favicons": origin → data URL).
	const FAV = {};
	let favReady = false;
	const pending = [];
	const originOf = (url) => { try { return new URL(url).origin; } catch { return ""; } };
	function addIcons(map) {
		Object.assign(FAV, map || {});
		pending.splice(0).forEach(([i, o]) => { if (FAV[o] && i.isConnected !== false) { i.src = FAV[o]; i.className = "fav"; } });
	}
	try {
		chrome.storage.local.get("kamyar_favicons").then((r) => { favReady = true; addIcons(r.kamyar_favicons); }).catch(() => (favReady = true));
	} catch { favReady = true; }
	/** An <img> with the best logo for the site. */
	function img(url, name, size) {
		const i = document.createElement("img");
		i.alt = "";
		i.width = i.height = size;
		i.loading = "lazy";
		i.decoding = "async";
		const b = find(url);
		if (b) {
			i.src = "icons/brands/" + b[0];
			i.className = "brand" + (b[1] ? " dark-logo" : "");
		} else if (FAV[originOf(url)]) {
			i.src = FAV[originOf(url)];
			i.className = "fav";
		} else {
			const local = siteIcon(url);
			i.src = local || s2(url);
			if (!local && !favReady) pending.push([i, originOf(url)]);
			i.className = "fav";
			// A bundled logo that fails falls back to the online icon, then to a letter.
			if (local) {
				i.addEventListener("error", () => { i.src = s2(url); i.addEventListener("error", () => i.replaceWith(letter(name, size)), { once: true }); }, { once: true });
				return i;
			}
		}
		i.addEventListener("error", () => i.replaceWith(letter(name, size)), { once: true });
		return i;
	}
	window.Brands = { find, img, addIcons };
})();
