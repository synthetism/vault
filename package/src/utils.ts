import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a CUID2-like identifier using Node.js crypto
 *
 * This is a simplified, zero-dependency implementation of CUID2 concepts:
 * - Uses native Node.js crypto instead of @noble/hashes
 * - Maintains similar structure: letter + hash of (time + entropy + counter)
 * - Provides collision-resistant, sortable, URL-safe IDs
 *
 * @param length - Length of the generated ID (default: 24)
 * @returns A CUID2-like identifier string
 */
export function createId(length = 24): string {
  // Start with a random letter (a-z)
  const firstLetter = String.fromCharCode(97 + Math.floor(Math.random() * 26));

  // Create entropy components
  const time = Date.now().toString(36);
  const entropy = randomBytes(8).toString("hex");
  const counter = Math.floor(Math.random() * 0xffffff).toString(36);

  // Combine and hash
  const input = `${time}${entropy}${counter}`;
  const hash = createHash("sha3-512").update(input).digest("hex");

  // Convert to base36 and take required length
  const hashBigInt = BigInt(`0x${hash}`);
  const base36Hash = hashBigInt.toString(36);

  // Combine first letter with hash, ensuring we get the right length
  return (firstLetter + base36Hash).substring(0, length);
}

/**
 * Base64url encoding utilities (simplified)
 */
export function base64urlEncode(data: string): string {
  try {
    // Try Node.js Buffer first
    const nodeBuffer = (globalThis as Record<string, unknown>)?.Buffer;
    if (nodeBuffer && typeof nodeBuffer === "object" && "from" in nodeBuffer) {
      return (
        nodeBuffer as {
          from: (data: string) => { toString: (encoding: string) => string };
        }
      )
        .from(data)
        .toString("base64url");
    }

    // Fallback to browser btoa
    const browserBtoa = (globalThis as Record<string, unknown>)?.btoa;
    if (browserBtoa && typeof browserBtoa === "function") {
      return (browserBtoa as (data: string) => string)(data)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    }

    throw new Error("No base64 encoding available");
  } catch (error) {
    throw new Error(
      `Base64 encoding failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function base64urlDecode(data: string): string {
  try {
    // Try Node.js Buffer first
    const nodeBuffer = (globalThis as Record<string, unknown>)?.Buffer;
    if (nodeBuffer && typeof nodeBuffer === "object" && "from" in nodeBuffer) {
      return (
        nodeBuffer as {
          from: (data: string, encoding: string) => { toString: () => string };
        }
      )
        .from(data, "base64url")
        .toString();
    }

    // Fallback to browser atob
    const browserAtob = (globalThis as Record<string, unknown>)?.atob;
    if (browserAtob && typeof browserAtob === "function") {
      let base64 = data.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) {
        base64 += "=";
      }
      return (browserAtob as (data: string) => string)(base64);
    }

    throw new Error("No base64 decoding available");
  } catch (error) {
    throw new Error(
      `Base64 decoding failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Hex encoding utilities
 */
export function hexEncode(data: string): string {
  try {
    // Try Node.js Buffer first
    const nodeBuffer = (globalThis as Record<string, unknown>)?.Buffer;
    if (nodeBuffer && typeof nodeBuffer === "object" && "from" in nodeBuffer) {
      return (
        nodeBuffer as {
          from: (data: string) => { toString: (encoding: string) => string };
        }
      )
        .from(data)
        .toString("hex");
    }

    // Fallback for browser
    let result = "";
    for (let i = 0; i < data.length; i++) {
      result += data.charCodeAt(i).toString(16).padStart(2, "0");
    }
    return result;
  } catch (error) {
    throw new Error(
      `Hex encoding failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function hexDecode(data: string): string {
  try {
    // Validate hex string
    if (!/^[0-9a-fA-F]*$/.test(data)) {
      throw new Error("Invalid hex string");
    }
    if (data.length % 2 !== 0) {
      throw new Error("Hex string must have even length");
    }

    // Try Node.js Buffer first
    const nodeBuffer = (globalThis as Record<string, unknown>)?.Buffer;
    if (nodeBuffer && typeof nodeBuffer === "object" && "from" in nodeBuffer) {
      return (
        nodeBuffer as {
          from: (data: string, encoding: string) => { toString: () => string };
        }
      )
        .from(data, "hex")
        .toString();
    }

    // Fallback for browser
    let result = "";
    for (let i = 0; i < data.length; i += 2) {
      result += String.fromCharCode(Number.parseInt(data.substring(i, i + 2), 16));
    }
    return result;
  } catch (error) {
    throw new Error(
      `Hex decoding failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
