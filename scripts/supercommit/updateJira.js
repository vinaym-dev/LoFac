// Node 20+, ESM. Uses global fetch.
const asJson = async (res) => {
    const text = await res.text();
    try { return JSON.parse(text || "{}"); } catch { return { raw: text }; }
};

const authHeader = (email, token) =>
    "Basic " + Buffer.from(`${email}:${token}`).toString("base64");

// Map STATUS tokens -> your Jira board statuses (from your screenshot)
export const statusMap = {
    Analyze: "Analyze and Size",
    AnalyzeAndSize: "Analyze and Size",
    Build: "Build",
    ValidateTest: "Validate Test",
    EndToEndTest: "End to End Testing",
    RegressionTest: "Regression Testing",
    CertifyRelease: "Certify and Release",
};

// [fix] small helper: normalized base url and basic fetch with retries for 429/5xx
function cleanBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}

async function jiraFetch(baseUrl, path, headers, init = {}) {
    const url = `${cleanBase(baseUrl)}${path}`;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const res = await fetch(url, { ...init, headers });
        if (res.ok) return res;

        // retry on 429/5xx
        if (res.status === 429 || res.status >= 500) {
            if (attempt < maxRetries) {
                const ra = Number(res.headers.get("retry-after"));
                const waitMs = Number.isFinite(ra) ? ra * 1000 : 400 * (attempt + 1);
                console.warn(`[Jira] ${res.status} ${res.statusText} → retrying in ${waitMs}ms`);
                await new Promise(r => setTimeout(r, waitMs));
                continue;
            }
        }
        return res; // give back error for caller to handle/log body
    }
}

/**
 * Transition a Jira issue to the status indicated by `statusToken`.
 */
export async function updateJiraStatus({
    baseUrl,          // e.g. https://<your>.atlassian.net
    email,            // Jira user email
    token,            // Jira API token
    issueKey,         // e.g. PEB-4
    statusToken,      // e.g. "Build" (from commit)
    dryRun = false,
}) {
    if (!baseUrl || !email || !token) throw new Error("Jira credentials missing.");
    if (!issueKey) throw new Error("issueKey missing.");
    if (!statusToken) {
        console.log("[Jira] No STATUS token provided; skipping transition.");
        return { skipped: true };
    }

    // [fix] normalize token and apply mapping
    const desired = String(statusToken).trim();
    const targetStatus = statusMap[desired] || desired; // allow direct status names too

    const headers = {
        Authorization: authHeader(email, token),
        Accept: "application/json",
        "Content-Type": "application/json",
    };

    // 1) Get current status (optional, just for logs)
    {
        const res = await jiraFetch(baseUrl, `/rest/api/3/issue/${encodeURIComponent(issueKey)}?fields=status`, headers);
        if (!res?.ok) {
            const body = res ? await asJson(res) : {};
            console.warn(`[Jira] Could not read current status (${res?.status ?? "n/a"}).`, body);
        } else {
            const info = await res.json();
            console.log(`[Jira] ${issueKey} current status: ${info?.fields?.status?.name}`);
        }
    }

    // 2) Get available transitions
    const tRes = await jiraFetch(baseUrl, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`, headers);
    if (!tRes?.ok) {
        const body = tRes ? await asJson(tRes) : {};
        throw new Error(`[Jira] transitions fetch failed: ${tRes?.status ?? "n/a"} ${JSON.stringify(body)}`);
    }
    const tJson = await tRes.json();
    const transitions = tJson?.transitions || [];

    // Try to match by target status name (case-insensitive), then by transition name
    const lower = targetStatus.toLowerCase();
    const match =
        transitions.find(t => (t.to?.name || "").trim().toLowerCase() === lower) ||
        transitions.find(t => (t.name || "").trim().toLowerCase() === lower);

    if (!match) {
        const available = transitions.map(t => `id=${t.id} name="${t.name}" → to="${t.to?.name}"`).join(", ");
        console.warn(`[Jira] No transition found to "${targetStatus}". Available: ${available || "none"}`);
        return { skipped: true, reason: "no-transition" };
    }

    console.log(`[Jira] Will transition via "${match.name}" → "${match.to?.name}" (id=${match.id}). target="${targetStatus}"`);

    if (dryRun) {
        console.log("[Jira] dryRun=true, skipping POST /transitions");
        return { dryRun: true, transitionId: match.id, to: match.to?.name };
    }

    // 3) Apply transition
    const postRes = await jiraFetch(
        baseUrl,
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
        headers,
        { method: "POST", body: JSON.stringify({ transition: { id: match.id } }) }
    );

    if (!postRes?.ok) {
        const body = postRes ? await asJson(postRes) : {};
        throw new Error(`[Jira] transition POST failed: ${postRes?.status ?? "n/a"} ${JSON.stringify(body)}`);
    }

    console.log(`[Jira] Transition applied to "${match.to?.name}"`);
    return { ok: true, to: match.to?.name, transitionId: match.id };
}