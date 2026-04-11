/**
 * clobCredentialClient — Browser-side CLOB API credential derivation.
 *
 * Derives Polymarket CLOB API credentials (apiKey, apiSecret, passphrase)
 * directly from the user's browser, bypassing server-side geo-blocking.
 *
 * Uses the same EIP-712 ClobAuth signature pattern as the backend,
 * but calls Polymarket endpoints from the user's residential IP.
 */

import { privateKeyToAccount } from "viem/accounts";

const CLOB_BASE = "https://clob.polymarket.com";

export interface ClobApiCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
}

/** Build EIP-712 ClobAuth headers for L1 authentication */
async function buildClobAuthHeaders(
  tradingKey: `0x${string}`,
  nonce = 0,
): Promise<Record<string, string>> {
  const account = privateKeyToAccount(tradingKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const domain = {
    name: "ClobAuthDomain" as const,
    version: "1" as const,
    chainId: 137,
  };

  const types = {
    ClobAuth: [
      { name: "address", type: "address" },
      { name: "timestamp", type: "string" },
      { name: "nonce", type: "uint256" },
      { name: "message", type: "string" },
    ],
  } as const;

  const message = {
    address: account.address,
    timestamp,
    nonce: BigInt(nonce),
    message: "This message attests that I control the given wallet",
  };

  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: "ClobAuth",
    message,
  });

  return {
    POLY_ADDRESS: account.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: nonce.toString(),
  };
}

/**
 * Derive CLOB API credentials from the user's browser.
 * Pattern: try POST /auth/api-key (create), fallback GET /auth/derive-api-key (retrieve).
 */
export async function deriveClobCredentials(
  tradingKey: `0x${string}`,
): Promise<{ credentials: ClobApiCredentials | null; error?: string }> {
  try {
    // Step 1: Try POST /auth/api-key (create new credentials)
    const createHeaders = await buildClobAuthHeaders(tradingKey, 0);
    console.log("[clobCredentialClient] POST /auth/api-key from browser");

    const createRes = await fetch(`${CLOB_BASE}/auth/api-key`, {
      method: "POST",
      headers: createHeaders,
    });

    const createBody = await createRes.text();
    console.log(`[clobCredentialClient] POST /auth/api-key status=${createRes.status} body=${createBody.substring(0, 500)}`);

    if (createRes.ok) {
      try {
        const data = JSON.parse(createBody);
        console.log("[clobCredentialClient] POST response field names:", Object.keys(data));
        const apiKey = data.apiKey || data.key;
        if (apiKey) {
          console.log("[clobCredentialClient] Created new CLOB credentials via POST, apiKey prefix:", apiKey.substring(0, 8));
          return {
            credentials: {
              apiKey,
              apiSecret: data.secret || data.apiSecret,
              passphrase: data.passphrase,
            },
          };
        }
        console.warn("[clobCredentialClient] POST 200 but no apiKey/key field found in:", Object.keys(data));
      } catch (parseErr) {
        console.error("[clobCredentialClient] POST response JSON parse failed:", parseErr);
      }
    }

    // Step 2: Fallback to GET /auth/derive-api-key
    console.log(`[clobCredentialClient] POST returned ${createRes.status}, trying GET /auth/derive-api-key`);

    const deriveHeaders = await buildClobAuthHeaders(tradingKey, 0);
    const deriveRes = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
      method: "GET",
      headers: deriveHeaders,
    });

    const deriveBody = await deriveRes.text();
    console.log(`[clobCredentialClient] GET /auth/derive-api-key status=${deriveRes.status} body=${deriveBody.substring(0, 500)}`);

    if (deriveRes.ok) {
      try {
        const data = JSON.parse(deriveBody);
        console.log("[clobCredentialClient] GET response field names:", Object.keys(data));
        const apiKey = data.apiKey || data.key;
        if (apiKey) {
          console.log("[clobCredentialClient] Retrieved existing CLOB credentials via GET, apiKey prefix:", apiKey.substring(0, 8));
          return {
            credentials: {
              apiKey,
              apiSecret: data.secret || data.apiSecret,
              passphrase: data.passphrase,
            },
          };
        }
        console.warn("[clobCredentialClient] GET 200 but no apiKey/key field found in:", Object.keys(data));
      } catch (parseErr) {
        console.error("[clobCredentialClient] GET response JSON parse failed:", parseErr);
      }
    }

    return {
      credentials: null,
      error: `Credential derivation failed: POST(${createRes.status}) GET(${deriveRes.status}): ${deriveBody.substring(0, 200)}`,
    };
  } catch (err) {
    console.error("[clobCredentialClient] derivation error:", err);
    return {
      credentials: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
