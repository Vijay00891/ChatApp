import { useState, useEffect, useCallback } from 'react';
import { getPrivateKey, importPublicKey, deriveSharedKey, encryptMessage, decryptMessage } from '../utils/crypto';
import { usersAPI } from '../lib/api';

/**
 * Custom hook that manages End-to-End Encryption (E2EE) state per conversation pair.
 * @param {string} currentUserId 
 * @param {string} contactUserId 
 */
const useE2EE = (currentUserId, contactUserId) => {
  const [sharedKey, setSharedKey] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    if (!currentUserId || !contactUserId) {
      Promise.resolve().then(() => {
        if (active) {
          setSharedKey(null);
          setIsReady(false);
          setError(null);
        }
      });
      return;
    }

    async function initSharedKey() {
      try {
        Promise.resolve().then(() => {
          if (active) {
            setIsReady(false);
            setError(null);
          }
        });

        // 1. Get my private key from IndexedDB via getPrivateKey()
        const myPrivateKey = await getPrivateKey();
        if (!myPrivateKey) {
          if (active) setError("Keys not initialized");
          return;
        }

        // 2. Fetch contact's public key: GET /api/users/:contactUserId/public-key
        let theirPublicKeyJWK;
        try {
          const res = await usersAPI.getPublicKey(contactUserId);
          theirPublicKeyJWK = res.data.publicKey;
        } catch (err) {
          if (err.response?.status === 404) {
            if (active) setError("This contact hasn't set up encryption yet");
          } else {
            if (active) setError("Failed to fetch contact's public key");
          }
          return;
        }

        if (!theirPublicKeyJWK) {
          if (active) setError("This contact hasn't set up encryption yet");
          return;
        }

        // 3. Import contact's public key JWK: importPublicKey(jwk)
        const contactPublicKey = await importPublicKey(theirPublicKeyJWK);

        // 4. Derive shared key: deriveSharedKey(myPrivateKey, contactPublicKey)
        const key = await deriveSharedKey(myPrivateKey, contactPublicKey);

        if (active) {
          setSharedKey(key);
          setIsReady(true);
        }
      } catch (err) {
        console.error("Failed to initialize E2EE shared key:", err);
        if (active) setError("Encryption setup failed");
      }
    }

    initSharedKey();

    return () => {
      active = false;
    };
  }, [currentUserId, contactUserId]);

  const encrypt = useCallback(async (plaintext) => {
    if (!isReady || !sharedKey) {
      throw new Error("Encryption not ready");
    }
    return await encryptMessage(sharedKey, plaintext);
  }, [isReady, sharedKey]);

  const decrypt = useCallback(async (ciphertext, iv) => {
    if (!isReady || !sharedKey) {
      return "[Encryption not ready]";
    }
    return await decryptMessage(sharedKey, ciphertext, iv);
  }, [isReady, sharedKey]);

  return { sharedKey, isReady, error, encrypt, decrypt };
};

export default useE2EE;
