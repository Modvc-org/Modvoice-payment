import CryptoJS from 'crypto-js';

const GLOBAL_SECRET = import.meta.env.GLOBAL_ENCRYPTION_KEY || import.meta.env.VITE_GLOBAL_ENCRYPTION_KEY || 'MODVC_GLOBAL_FALLBACK_SECRET_2026_DO_NOT_USE_IN_PROD';

export function encryptApiKey(plainText: string): string {
    if (!plainText) return '';
    return CryptoJS.AES.encrypt(plainText, GLOBAL_SECRET).toString();
}

export function decryptApiKey(cipherText: string): string {
    if (!cipherText) return '';
    try {
        const bytes = CryptoJS.AES.decrypt(cipherText, GLOBAL_SECRET);
        return bytes.toString(CryptoJS.enc.Utf8);
    } catch (e) {
        console.error("Failed to decrypt API key", e);
        return '';
    }
}
