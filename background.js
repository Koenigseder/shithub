// Fetches uptime data from mrshu's GitHub status page, caches it for 1 hour.

const CACHE_KEY = 'shithub_uptime';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const INCIDENTS_URL =
  'https://mrshu.github.io/github-statuses/parsed/incidents.jsonl';
const WINDOWS_URL =
  'https://mrshu.github.io/github-statuses/parsed/downtime_windows.csv';

// ---------- helpers ----------

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const headers = lines.shift().split(',');
  return lines.map((line) => {
    const cols = line.split(',');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function clipInterval(start, end, rangeStart, rangeEnd) {
  const s = Math.max(start.getTime(), rangeStart.getTime());
  const e = Math.min(end.getTime(), rangeEnd.getTime());
  if (e <= s) return null;
  return [new Date(s), new Date(e)];
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0]);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur[0] <= last[1]) {
      last[1] = new Date(Math.max(last[1].getTime(), cur[1].getTime()));
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

function minutesBetween(start, end) {
  return Math.max(0, Math.ceil(end.getTime() / 60000) - Math.floor(start.getTime() / 60000));
}

function getDayStartUTC(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// ---------- compute uptime ----------

async function fetchUptime() {
  const [incidentsText, windowsText] = await Promise.all([
    fetch(INCIDENTS_URL).then((r) => r.text()),
    fetch(WINDOWS_URL).then((r) => r.text()),
  ]);

  const windows = parseCSV(windowsText);

  const now = new Date();
  const today = getDayStartUTC(now);
  const rangeStart = new Date(today);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 89);
  const rangeEnd = new Date(today);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const intervals = [];
  windows.forEach((row) => {
    if (!row.downtime_start || !row.downtime_end) return;
    const start = new Date(row.downtime_start);
    const end = new Date(row.downtime_end);
    if (isNaN(start) || isNaN(end)) return;
    const impact = row.impact || 'none';
    if (impact === 'maintenance') return; // maintenance doesn't count as downtime
    const clipped = clipInterval(start, end, rangeStart, rangeEnd);
    if (clipped) intervals.push(clipped);
  });

  const merged = mergeIntervals(intervals);
  const downtimeMinutes = merged.reduce(
    (sum, [s, e]) => sum + minutesBetween(s, e),
    0,
  );
  const totalMinutes = 90 * 24 * 60;
  const uptime = Math.max(0, 1 - downtimeMinutes / totalMinutes);

  // Extract incident count in last 90 days from incidents.jsonl
  let incidentCount = 0;
  try {
    const lines = incidentsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const since = rangeStart.getTime();
    incidentCount = lines.filter((line) => {
      try {
        const inc = JSON.parse(line);
        const d = inc.downtime_start
          ? new Date(inc.downtime_start)
          : new Date(inc.published_at);
        return d.getTime() >= since;
      } catch {
        return false;
      }
    }).length;
  } catch (_) {}

  return {
    uptime,
    uptimePercent: (uptime * 100).toFixed(2),
    incidentCount,
    fetchedAt: Date.now(),
  };
}

// ---------- message handler ----------

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'GET_UPTIME') return false;

  chrome.storage.local.get([CACHE_KEY], async (result) => {
    const cached = result[CACHE_KEY];
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      sendResponse({ ok: true, data: cached });
      return;
    }

    try {
      const data = await fetchUptime();
      chrome.storage.local.set({ [CACHE_KEY]: data });
      sendResponse({ ok: true, data });
    } catch (err) {
      // Return stale data if available, otherwise error
      if (cached) {
        sendResponse({ ok: true, data: cached, stale: true });
      } else {
        sendResponse({ ok: false, error: String(err) });
      }
    }
  });

  return true; // keep channel open for async response
});
