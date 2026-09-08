#!/usr/bin/env node
/**
 * Mints a Xero access token locally, using the authorization-code flow with
 * PKCE.
 *
 * ## Why this exists
 *
 * This server runs in bearer-token mode: the caller performs the OAuth
 * exchange and passes a token in, so the server holds no credentials at rest
 * (CLAUDE.md, "prefer to hold nothing"). That is the right shape, and it
 * leaves an obvious gap — nobody can obtain a token to pass. This closes it.
 *
 * ## Why PKCE, and what that buys
 *
 * The Xero app backing this is a "Mobile or desktop" app, which has **no
 * client secret**. An MCP server running on someone's machine is a public
 * client, and a secret shipped to a public client is not a secret. So there is
 * nothing in this file that can leak, which is the point of the app type.
 *
 * ## What this does NOT do
 *
 * It writes nothing. No token file, no .env, no keychain entry. It prints to
 * stdout and exits, so the only copy of the token is wherever you choose to
 * put it.
 *
 * That is deliberate. A helper that wrote a token to disk would create exactly
 * the artefact this repo's design avoids: a credential at rest, one
 * `git add -A` away from being committed. The 30-minute expiry is the accepted
 * cost of that choice — re-run this when it lapses.
 *
 * ## Usage
 *
 *   XERO_CLIENT_ID=<your app's client id> node scripts/mint-token.mjs
 *
 * Register http://localhost:5173/callback as a redirect URI on the app first.
 * Override the port with PORT if 5173 is taken.
 */
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";

const CLIENT_ID = process.env.XERO_CLIENT_ID;
const PORT = Number(process.env.PORT ?? 5173);
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

/*
 * The scopes this server needs, and only those.
 *
 * `offline_access` yields a refresh token, which this script prints so a
 * caller can renew without re-consenting. The server never sees it — renewal
 * is the caller's job by design.
 *
 * Note what is absent: `accounting.journals.read`. Connections created on or
 * after 29 April 2026 use granular scopes and that scope does not exist for
 * them, so GET /Journals is unavailable and Superannuation Payable has to be
 * read through BankTransactions. Adding it here produces an invalid_scope
 * error, not a journals feed.
 *
 * Payroll scopes are absent too, because no Payroll AU tool exists yet. They
 * arrive with the first one.
 */
const SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "accounting.settings.read",
  "accounting.contacts.read",
  "accounting.transactions.read",
  "accounting.reports.read",
].join(" ");

if (!CLIENT_ID) {
  console.error(
    [
      "XERO_CLIENT_ID is not set.",
      "",
      "Create a 'Mobile or desktop' app at https://developer.xero.com/app/manage,",
      `add ${REDIRECT_URI} as a redirect URI, then re-run with:`,
      "",
      "  XERO_CLIENT_ID=<client id> node scripts/mint-token.mjs",
      "",
      "There is no client secret for a PKCE app. If you were given one, you",
      "created the wrong app type.",
    ].join("\n"),
  );
  process.exit(1);
}

const base64url = (buffer) => buffer.toString("base64url");
const verifier = base64url(randomBytes(64));
const challenge = base64url(createHash("sha256").update(verifier).digest());
const state = base64url(randomBytes(16));

const authoriseUrl =
  "https://login.xero.com/identity/connect/authorize?" +
  new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

/** Exchanges the authorization code. No client secret is sent — PKCE proves it. */
async function exchange(code) {
  const response = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Token exchange failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json();
}

/** Lists the organisations the new token can reach. */
async function readConnections(accessToken) {
  const response = await fetch("https://api.xero.com/connections", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Reading /connections failed (${response.status}): ${await response.text()}`,
    );
  }
  return response.json();
}

function report(tokens, tenants) {
  const lines = [
    "",
    `Access token (expires in ${tokens.expires_in ?? "?"} seconds):`,
    "",
    tokens.access_token,
    "",
  ];

  if (tokens.refresh_token) {
    lines.push(
      "Refresh token. Keep it out of the repo. The server never reads it —",
      "renewal is the caller's job, by design:",
      "",
      tokens.refresh_token,
      "",
    );
  }

  lines.push(`Authorised for ${tenants.length} organisation(s):`, "");
  for (const tenant of tenants) {
    lines.push(`  ${tenant.tenantId}  ${tenant.tenantName}`);
  }

  lines.push(
    "",
    "To use it, export the access token printed above:",
    "",
    "  export XERO_CLIENT_BEARER_TOKEN=<access token>",
    "",
    tenants.length > 1
      ? "More than one organisation is authorised, so every tool call needs a\ntenantId. The list-tenants tool shows them at any time."
      : "One organisation is authorised, so tenantId is optional on tool calls.",
    "",
    "Nothing was written to disk. Re-run this script when the token expires.",
  );

  console.log(lines.join("\n"));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/callback") {
    response.writeHead(404).end("Not found");
    return;
  }

  const failure = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  const finish = (message, exitCode) => {
    response.writeHead(exitCode === 0 ? 200 : 400, {
      "Content-Type": "text/plain",
    });
    response.end(message);
    server.close();
    process.exitCode = exitCode;
  };

  if (failure) {
    finish(`Xero returned an error: ${failure}. Nothing was saved.`, 1);
    console.error(`\nXero returned an error: ${failure}`);
    return;
  }

  // Guards against a callback that did not originate from this run.
  if (returnedState !== state) {
    finish("State mismatch, so this callback was ignored.", 1);
    console.error("\nState mismatch. Ignoring the callback and exiting.");
    return;
  }

  if (!code) {
    finish("No authorization code in the callback.", 1);
    return;
  }

  try {
    const tokens = await exchange(code);
    const tenants = await readConnections(tokens.access_token);
    finish("Token minted. Return to your terminal — you can close this tab.", 0);
    report(tokens, tenants);
  } catch (thrown) {
    finish(`Failed: ${thrown.message}`, 1);
    console.error(`\n${thrown.message}`);
  }
});

server.on("error", (thrown) => {
  if (thrown.code === "EADDRINUSE") {
    console.error(
      [
        `Port ${PORT} is already in use, so the redirect cannot be received.`,
        "Free it, or re-run on another port and register that redirect URI on",
        "the app:",
        "",
        "  PORT=5174 XERO_CLIENT_ID=<client id> node scripts/mint-token.mjs",
      ].join("\n"),
    );
    process.exit(1);
  }
  throw thrown;
});

server.listen(PORT, () => {
  console.log(
    [
      "Open this URL to authorise, then come back here:",
      "",
      authoriseUrl,
      "",
      `Waiting for the redirect on ${REDIRECT_URI} ...`,
    ].join("\n"),
  );
});
