// ==UserScript==
// @name         duelcs — LeetCode lockout reporter
// @namespace    https://github.com/duelcs/duelcs
// @version      0.1.0
// @description  Report Accepted LeetCode submissions to a friend-hosted duelcs match
// @author       duelcs
// @match        https://leetcode.com/*
// @match        https://leetcode.cn/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_HOST = "duelcs_host_url";
  const STORAGE_TOKEN = "duelcs_player_token";

  function currentSlug() {
    const match = window.location.pathname.match(/\/problems\/([^/]+)/);
    return match ? match[1] : null;
  }

  function configure() {
    const host = prompt("duelcs host URL (example: http://100.64.0.2:3737)", GM_getValue(STORAGE_HOST, ""));
    if (host === null) {
      return;
    }
    const token = prompt("Your duelcs player token (from terminal)", GM_getValue(STORAGE_TOKEN, ""));
    if (token === null) {
      return;
    }
    GM_setValue(STORAGE_HOST, host.trim().replace(/\/$/, ""));
    GM_setValue(STORAGE_TOKEN, token.trim());
    alert("duelcs settings saved.");
  }

  GM_registerMenuCommand("Configure duelcs", configure);

  const reported = new Set();

  function reportSolve(slug, submissionUrl) {
    if (reported.has(slug)) {
      return;
    }
    const host = GM_getValue(STORAGE_HOST, "");
    const token = GM_getValue(STORAGE_TOKEN, "");
    if (!host || !token) {
      console.warn("[duelcs] Missing host URL or token. Use Tampermonkey → duelcs → Configure duelcs.");
      return;
    }

    GM_xmlhttpRequest({
      method: "POST",
      url: `${host.replace(/\/$/, "")}/solve`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        token,
        slug,
        submissionUrl: submissionUrl || undefined,
        reportedAt: Date.now(),
      }),
      onload(response) {
        if (response.status >= 200 && response.status < 300) {
          reported.add(slug);
          console.info(`[duelcs] Reported Accepted on ${slug}`);
          return;
        }
        console.warn(`[duelcs] Host rejected solve report (${response.status}):`, response.responseText);
      },
      onerror() {
        console.warn("[duelcs] Could not reach host. Is Tailscale up and duelcs host running?");
      },
    });
  }

  function maybeReportFromPayload(payload, slugOverride) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    const status = payload.status_msg || payload.status || payload.state || payload.submission?.status;
    const slug = slugOverride || payload.question_slug || payload.slug || currentSlug();
    if (!slug) {
      return;
    }

    const accepted =
      status === "Accepted" ||
      status === "AC" ||
      payload.status_code === 10 ||
      payload.statusCode === 10;

    if (!accepted) {
      return;
    }

    const submissionUrl =
      payload.submission_url ||
      (payload.submission_id ? `https://leetcode.com/submissions/detail/${payload.submission_id}/` : window.location.href);

    reportSolve(slug, submissionUrl);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (/leetcode\.(com|cn)/.test(requestUrl) && /submit|submission|graphql|check/i.test(requestUrl)) {
        const clone = response.clone();
        clone
          .json()
          .then((payload) => maybeReportFromPayload(payload, currentSlug()))
          .catch(() => undefined);
      }
    } catch {
      // Ignore parse errors — LeetCode changes response shapes often.
    }
    return response;
  };

  let domTimer = null;
  const observer = new MutationObserver(() => {
    const slug = currentSlug();
    if (!slug || reported.has(slug)) {
      return;
    }
    if (!document.body?.innerText.includes("Accepted")) {
      return;
    }
    clearTimeout(domTimer);
    domTimer = setTimeout(() => {
      if (document.body?.innerText.includes("Accepted")) {
        reportSolve(slug, window.location.href);
      }
    }, 500);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  if (!GM_getValue(STORAGE_HOST, "") || !GM_getValue(STORAGE_TOKEN, "")) {
    console.info("[duelcs] Not configured yet. Tampermonkey menu → Configure duelcs.");
  }
})();
