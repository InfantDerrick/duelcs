// ==UserScript==
// @name         duelcs — LeetCode lockout reporter
// @namespace    https://github.com/InfantDerrick/duelcs
// @version      0.2.0
// @description  Report Accepted LeetCode submissions to a friend-hosted duelcs match
// @author       duelcs
// @match        https://leetcode.com/*
// @match        https://leetcode.cn/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      *
// @connect      127.0.0.1
// @connect      localhost
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_HOST = "duelcs_host_url";
  const STORAGE_TOKEN = "duelcs_player_token";
  const reported = new Set();
  const page = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

  function log(...args) {
    console.info("[duelcs]", ...args);
  }

  function warn(...args) {
    console.warn("[duelcs]", ...args);
  }

  function currentSlug() {
    const match = page.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  function hostUrl() {
    return String(GM_getValue(STORAGE_HOST, "") || "").trim().replace(/\/$/, "");
  }

  function playerToken() {
    return String(GM_getValue(STORAGE_TOKEN, "") || "").trim();
  }

  function configure() {
    const host = prompt(
      "duelcs host URL\nUse Tailscale IP for friends, or http://127.0.0.1:3737 on the host machine.",
      hostUrl() || "http://127.0.0.1:3737",
    );
    if (host === null) return;

    const token = prompt("Your duelcs player token (from the terminal scoreboard)", playerToken());
    if (token === null) return;

    GM_setValue(STORAGE_HOST, host.trim().replace(/\/$/, ""));
    GM_setValue(STORAGE_TOKEN, token.trim());
    alert("duelcs settings saved. Open the browser console (F12) and look for [duelcs] logs.");
    log("Configured host=", hostUrl(), "token=", playerToken().slice(0, 8) + "…");
  }

  function testConnection() {
    const host = hostUrl();
    const token = playerToken();
    if (!host || !token) {
      alert("Configure duelcs first (Tampermonkey menu → Configure duelcs).");
      return;
    }

    log("Testing connection to", host + "/health");
    GM_xmlhttpRequest({
      method: "GET",
      url: host + "/health",
      onload(response) {
        log("Health status", response.status, response.responseText);
        if (response.status >= 200 && response.status < 300) {
          alert("Host reachable ✓\n" + response.responseText + "\n\nToken starts with: " + token.slice(0, 8));
        } else {
          alert("Host responded with " + response.status + "\n" + response.responseText);
        }
      },
      onerror(err) {
        warn("Health check failed", err);
        alert(
          "Could not reach " +
            host +
            "\n\nChecklist:\n• Is duelcs host still running?\n• Is the URL exactly what the terminal shows?\n• Same machine → http://127.0.0.1:PORT\n• Friend machine → http://TAILSCALE_IP:PORT",
        );
      },
    });
  }

  function reportSolve(slug, submissionUrl, source) {
    if (!slug) {
      warn("No problem slug to report");
      return;
    }
    if (reported.has(slug)) {
      log("Already reported", slug);
      return;
    }

    const host = hostUrl();
    const token = playerToken();
    if (!host || !token) {
      warn("Missing host URL or token. Configure duelcs from the Tampermonkey menu.");
      return;
    }

    log("Reporting Accepted:", slug, "via", source, "→", host + "/solve");
    GM_xmlhttpRequest({
      method: "POST",
      url: host + "/solve",
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        token,
        slug,
        submissionUrl: submissionUrl || undefined,
        reportedAt: Date.now(),
      }),
      onload(response) {
        log("Solve response", response.status, response.responseText);
        if (response.status >= 200 && response.status < 300) {
          reported.add(slug);
          log("Reported Accepted on", slug);
          return;
        }
        warn("Host rejected solve report:", response.status, response.responseText);
        // Common case: duel still in lobby
        try {
          const body = JSON.parse(response.responseText);
          if (body.message) alert("duelcs: " + body.message);
        } catch {
          // ignore
        }
      },
      onerror() {
        warn("Could not reach host at", host, "— is duelcs running / Tailscale up?");
        alert("duelcs could not reach " + host);
      },
    });
  }

  function isAcceptedPayload(payload) {
    if (!payload || typeof payload !== "object") return false;

    const status = payload.status_msg || payload.status || payload.state || payload.submission?.status;
    if (status === "Accepted" || status === "AC" || String(status).toLowerCase() === "accepted") {
      return true;
    }
    if (payload.status_code === 10 || payload.statusCode === 10) {
      return true;
    }
    // Nested GraphQL-ish shapes
    if (payload.data && typeof payload.data === "object") {
      return isAcceptedPayload(payload.data);
    }
    return false;
  }

  function extractSlug(payload, requestUrl) {
    if (payload?.question_title_slug) return payload.question_title_slug;
    if (payload?.question_slug) return payload.question_slug;
    if (payload?.slug) return payload.slug;

    const fromUrl = String(requestUrl || "").match(/\/problems\/([^/?#]+)/);
    if (fromUrl) return fromUrl[1];

    return currentSlug();
  }

  function extractSubmissionUrl(payload) {
    if (payload?.submission_url) return payload.submission_url;
    const id = payload?.submission_id || payload?.submissionId;
    if (id) return `https://leetcode.com/submissions/detail/${id}/`;
    return page.location.href;
  }

  function maybeReportFromPayload(payload, requestUrl, source) {
    if (!isAcceptedPayload(payload)) {
      const status = payload?.status_msg || payload?.status || payload?.state;
      if (status && /pending|started|judging/i.test(String(status))) {
        log("Submission still running:", status);
      }
      return;
    }

    const slug = extractSlug(payload, requestUrl);
    log("Detected Accepted payload for", slug, "from", source);
    reportSolve(slug, extractSubmissionUrl(payload), source);
  }

  function shouldInspectUrl(url) {
    const value = String(url || "");
    // Relative paths like /submissions/detail/123/check/ are common.
    return /submit|submission|\/check\/|graphql/i.test(value);
  }

  function inspectResponseBody(bodyText, requestUrl, source) {
    if (!bodyText) return;
    try {
      const payload = JSON.parse(bodyText);
      maybeReportFromPayload(payload, requestUrl, source);
    } catch {
      // Non-JSON responses are ignored.
    }
  }

  // --- Hook page fetch (must use unsafeWindow so we see LeetCode's own calls) ---
  const originalFetch = page.fetch.bind(page);
  page.fetch = async function duelcsFetch(...args) {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (shouldInspectUrl(requestUrl)) {
        const clone = response.clone();
        clone
          .text()
          .then((text) => inspectResponseBody(text, requestUrl, "fetch:" + requestUrl))
          .catch(() => undefined);
      }
    } catch {
      // ignore
    }
    return response;
  };

  // --- Hook XHR too (some LeetCode paths still use it) ---
  const OriginalXHR = page.XMLHttpRequest;
  function PatchedXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = "";

    const originalOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      requestUrl = String(url || "");
      return originalOpen.call(this, method, url, ...rest);
    };

    xhr.addEventListener("load", function () {
      if (!shouldInspectUrl(requestUrl)) return;
      try {
        inspectResponseBody(xhr.responseText, requestUrl, "xhr:" + requestUrl);
      } catch {
        // ignore
      }
    });

    return xhr;
  }
  page.XMLHttpRequest = PatchedXHR;

  function reportCurrentManually() {
    const slug = currentSlug();
    if (!slug) {
      alert("Open a LeetCode problem page first.");
      return;
    }
    reportSolve(slug, page.location.href, "manual-menu");
  }

  GM_registerMenuCommand("Configure duelcs", configure);
  GM_registerMenuCommand("Test duelcs host connection", testConnection);
  GM_registerMenuCommand("Manually report current problem as Accepted", reportCurrentManually);

  log(
    "Userscript loaded. host=",
    hostUrl() || "(not set)",
    "token=",
    playerToken() ? playerToken().slice(0, 8) + "…" : "(not set)",
    "slug=",
    currentSlug() || "(none)",
  );

  if (!hostUrl() || !playerToken()) {
    log("Not configured yet. Tampermonkey menu → Configure duelcs.");
  }
})();
