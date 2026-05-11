// ---------- 1. Rename GitHub → ShitHub ----------

function renameGitHub() {
  // Walk all text nodes and replace "GitHub" with "ShitHub"
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        // Skip script / style content
        const tag = node.parentElement?.tagName?.toLowerCase();
        if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;
        return node.nodeValue && node.nodeValue.includes('GitHub')
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP;
      },
    },
  );

  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  nodes.forEach((node) => {
    node.nodeValue = node.nodeValue.replace(/GitHub/g, 'ShitHub');
  });

  // Also fix title
  document.title = document.title.replace(/GitHub/g, 'ShitHub');

  // Fix aria-labels and alt attributes
  document
    .querySelectorAll('[aria-label*="GitHub"], [alt*="GitHub"], [title*="GitHub"]')
    .forEach((el) => {
      if (el.hasAttribute('aria-label'))
        el.setAttribute('aria-label', el.getAttribute('aria-label').replace(/GitHub/g, 'ShitHub'));
      if (el.hasAttribute('alt'))
        el.setAttribute('alt', el.getAttribute('alt').replace(/GitHub/g, 'ShitHub'));
      if (el.hasAttribute('title'))
        el.setAttribute('title', el.getAttribute('title').replace(/GitHub/g, 'ShitHub'));
    });
}

// Run on initial load
renameGitHub();

// Re-run when GitHub's SPA updates the DOM
const renameObserver = new MutationObserver(() => renameGitHub());
renameObserver.observe(document.body, {
  childList: true,
  subtree: true,
  characterData: false, // avoid loops — we only watch structure changes
});

// ---------- 2. Uptime badge ----------

function getUptimeColor(pct) {
  const p = parseFloat(pct);
  if (p >= 99.9) return '#2da44e'; // green
  if (p >= 99.0) return '#d97706'; // amber
  return '#cf222e'; // red
}

function createBadge(data) {
  const existing = document.getElementById('shithub-uptime-badge');
  if (existing) existing.remove();

  const { uptimePercent, incidentCount, stale } = data;
  const color = getUptimeColor(uptimePercent);

  const badge = document.createElement('a');
  badge.id = 'shithub-uptime-badge';
  badge.href = 'https://mrshu.github.io/github-statuses/';
  badge.target = '_blank';
  badge.rel = 'noreferrer noopener';
  badge.title = `ShitHub real uptime (last 90 days) — ${incidentCount} incident${incidentCount === 1 ? '' : 's'}${stale ? ' · data may be stale' : ''}`;

  badge.innerHTML = `
    <span class="shithub-badge-icon">💩</span>
    <span class="shithub-badge-label">Uptime</span>
    <span class="shithub-badge-value" style="background:${color}">${uptimePercent}%</span>
  `;

  document.body.appendChild(badge);
}

function loadUptime() {
  chrome.runtime.sendMessage({ type: 'GET_UPTIME' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[ShitHub] Could not reach background worker:', chrome.runtime.lastError.message);
      return;
    }
    if (response?.ok && response.data) {
      createBadge({ ...response.data, stale: response.stale });
    }
  });
}

loadUptime();
