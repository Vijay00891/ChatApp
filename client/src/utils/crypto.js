/**
 * Cryptographic utilities for End-to-End Encryption (E2EE)
 * Using Web Crypto API (ECDH P-256 and AES-256-GCM)
 */

let indexedDbAvailable = true;

/**
 * Checks if IndexedDB is available and working.
 * @returns {boolean}
 */
export function isIndexedDbAvailable() {
  return indexedDbAvailable;
}

/**
 * Helper to open the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open("chat_e2ee", 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("keys")) {
          db.createObjectStore("keys", { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => {
        resolve(e.target.result);
      };
      request.onerror = (e) => {
        reject(e.target.error || new Error("Failed to open IndexedDB"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates an ECDH key pair for key exchange.
 * Named curve: P-256.
 *usages: ["deriveKey"]
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
 */
export async function generateKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true, // extractable
    ["deriveKey"]
  );
  return keyPair;
}

/**
 * Exports a public CryptoKey to JWK (JSON Web Key) format.
 * @param {CryptoKey} publicKey 
 * @returns {Promise<JsonWebKey>}
 */
export async function exportPublicKey(publicKey) {
  return await window.crypto.subtle.exportKey("jwk", publicKey);
}

/**
 * Imports a JWK public key back into a CryptoKey object.
 * @param {JsonWebKey} jwk 
 * @returns {Promise<CryptoKey>}
 */
export async function importPublicKey(jwk) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "ECDH",
      namedCurve: "P-256"
    },
    true, // extractable
    [] // usages for public key
  );
}

/**
 * Derives a shared AES-256-GCM key using my private key and their public key.
 * @param {CryptoKey} myPrivateKey 
 * @param {CryptoKey} theirPublicKeyCryptoKey 
 * @returns {Promise<CryptoKey>} AES-256-GCM key
 */
export async function deriveSharedKey(myPrivateKey, theirPublicKeyCryptoKey) {
  return await window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: theirPublicKeyCryptoKey
    },
    myPrivateKey,
    {
      name: "AES-GCM",
      length: 256
    },
    false, // extractable (do not allow exporting derived shared key)
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts plaintext using AES-256-GCM shared key.
 * Generates a fresh 12-byte IV for every message.
 * @param {CryptoKey} sharedKey 
 * @param {string} plaintext 
 * @returns {Promise<{ciphertext: string, iv: string}>} base64 encoded strings
 */
export async function encryptMessage(sharedKey, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    sharedKey,
    encoded
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv)
  };
}

/**
 * Decrypts ciphertext using AES-256-GCM shared key.
 * @param {CryptoKey} sharedKey 
 * @param {string} ciphertextBase64 
 * @param {string} ivBase64 
 * @returns {Promise<string>} plaintext, or error string if fails
 */
export async function decryptMessage(sharedKey, ciphertextBase64, ivBase64) {
  try {
    const ciphertext = base64ToArrayBuffer(ciphertextBase64);
    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64));
    
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      sharedKey,
      ciphertext
    );

    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.error("Decryption failed:", err);
    return "🔒 Unable to decrypt";
  }
}

/**
 * Helper to convert an ArrayBuffer to a Base64 string.
 * @param {ArrayBuffer} buffer 
 * @returns {string} Base64
 */
export function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Helper to convert a Base64 string to an ArrayBuffer.
 * @param {string} base64 
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Stores the private key in IndexedDB (with sessionStorage fallback).
 * @param {CryptoKey} privateKey 
 * @returns {Promise<void>}
 */
export async function storePrivateKey(privateKey) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      store.put({ id: "myPrivateKey", key: privateKey });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error || new Error("Failed to write key to IndexedDB"));
    });
    indexedDbAvailable = true;
  } catch (err) {
    console.warn("IndexedDB unavailable, falling back to sessionStorage:", err);
    indexedDbAvailable = false;
    const jwk = await window.crypto.subtle.exportKey("jwk", privateKey);
    window.sessionStorage.setItem("myPrivateKeyJWK", JSON.stringify(jwk));
  }
}

/**
 * Retrieves the private key from IndexedDB (with sessionStorage fallback).
 * @returns {Promise<CryptoKey|null>}
 */
export async function getPrivateKey() {
  if (!indexedDbAvailable) {
    return await retrieveFromSessionStorage();
  }

  try {
    const db = await openDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readonly");
      const store = tx.objectStore("keys");
      const request = store.get("myPrivateKey");
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error || new Error("Failed to get key from IndexedDB"));
    });
    
    if (result && result.key) {
      return result.key;
    }
    return null;
  } catch (err) {
    console.warn("IndexedDB read failed, trying sessionStorage fallback:", err);
    indexedDbAvailable = false;
    return await retrieveFromSessionStorage();
  }
}

/**
 * Helper to retrieve private key from sessionStorage.
 * @returns {Promise<CryptoKey|null>}
 */
async function retrieveFromSessionStorage() {
  const jwkStr = window.sessionStorage.getItem("myPrivateKeyJWK");
  if (!jwkStr) return null;
  try {
    const jwk = JSON.parse(jwkStr);
    return await window.crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "ECDH",
        namedCurve: "P-256"
      },
      true, // extractable
      ["deriveKey"]
    );
  } catch (err) {
    console.error("Failed to import private key from sessionStorage:", err);
    return null;
  }
}

/**
 * Saves my public key JWK to localStorage.
 * @param {JsonWebKey} jwk 
 */
export function savePublicKeyJWK(jwk) {
  window.localStorage.setItem("myPublicKeyJWK", JSON.stringify(jwk));
}

/**
 * Retrieves my public key JWK from localStorage.
 * @returns {JsonWebKey|null}
 */
export function getPublicKeyJWK() {
  const jwkStr = window.localStorage.getItem("myPublicKeyJWK");
  if (!jwkStr) return null;
  try {
    return JSON.parse(jwkStr);
  } catch {
    return null;
  }
}

/**
 * Clears both public and private keys from IndexedDB, localStorage and sessionStorage.
 * @returns {Promise<void>}
 */
export async function clearKeys() {
  window.localStorage.removeItem("myPublicKeyJWK");
  window.sessionStorage.removeItem("myPrivateKeyJWK");
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("keys", "readwrite");
      const store = tx.objectStore("keys");
      store.delete("myPrivateKey");
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error || new Error("Failed to delete key from IndexedDB"));
    });
  } catch (err) {
    console.warn("Could not delete private key from IndexedDB:", err);
  }
}
