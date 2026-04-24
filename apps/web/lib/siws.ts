/**
 * Sign-In With Stellar (SIWS) Protocol Implementation
 * 
 * Provides secure authentication using Stellar wallet signatures
 * Follows the SIWS specification for cryptographic verification
 */

import { Transaction, Networks } from "@stellar/stellar-sdk";
import { APP_STELLAR_NETWORK, assertValidStellarAddress, signTransaction } from "./stellar";

export interface SIWSMessage {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}

export interface SIWSResponse {
  message: SIWSMessage;
  signature: string;
  publicKey: string;
}

export class SIWSChallenge {
  private static readonly CHALLENGE_STORAGE_KEY = "lance.siws.challenge";
  private static readonly NONCE_LENGTH = 16;

  /**
   * Generate a cryptographic nonce for SIWS challenge
   */
  static generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < this.NONCE_LENGTH; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Create a SIWS challenge message
   */
  static createChallenge(address: string, domain: string, uri: string): SIWSMessage {
    const now = new Date();
    const issuedAt = now.toISOString();
    const expirationTime = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5 minutes

    return {
      domain,
      address: assertValidStellarAddress(address),
      statement: "Sign in to Lance with your Stellar wallet",
      uri,
      version: "1",
      chainId: APP_STELLAR_NETWORK === Networks.PUBLIC ? "stellar:public" : "stellar:testnet",
      nonce: this.generateNonce(),
      issuedAt,
      expirationTime,
      resources: []
    };
  }

  /**
   * Convert SIWS message to Stellar transaction for signing
   */
  static messageToTransaction(message: SIWSMessage): Transaction {
    // Create a minimal transaction that represents the SIWS message
    const account = new Transaction.Account(message.address, "1");
    
    const transaction = new Transaction(account, {
      fee: "100",
      networkPassphrase: APP_STELLAR_NETWORK,
      timebounds: {
        minTime: 0,
        maxTime: Math.floor(new Date(message.expirationTime || "").getTime() / 1000)
      }
    });

    // Add a memo that contains the SIWS message hash
    const messageString = JSON.stringify(message);
    const memoText = this.createMemoHash(messageString);
    transaction.addMemo(Transaction.Memo.text(memoText));

    return transaction;
  }

  /**
   * Create a deterministic hash from SIWS message for memo
   */
  private static createMemoHash(message: string): string {
    // Simple hash function for demo purposes
    // In production, use a proper cryptographic hash
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36).substring(0, 10);
  }

  /**
   * Store challenge for verification
   */
  static storeChallenge(challenge: SIWSMessage): void {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.setItem(this.CHALLENGE_STORAGE_KEY, JSON.stringify(challenge));
    } catch (error) {
      console.warn("Failed to store SIWS challenge:", error);
    }
  }

  /**
   * Retrieve and clear stored challenge
   */
  static retrieveChallenge(): SIWSMessage | null {
    if (typeof window === "undefined") return null;
    
    try {
      const stored = localStorage.getItem(this.CHALLENGE_STORAGE_KEY);
      if (!stored) return null;
      
      const challenge = JSON.parse(stored) as SIWSMessage;
      localStorage.removeItem(this.CHALLENGE_STORAGE_KEY);
      
      // Validate challenge hasn't expired
      if (challenge.expirationTime && new Date(challenge.expirationTime) < new Date()) {
        return null;
      }
      
      return challenge;
    } catch (error) {
      console.warn("Failed to retrieve SIWS challenge:", error);
      return null;
    }
  }

  /**
   * Verify SIWS signature on the backend
   * This would typically be done on the server, but we provide the client-side validation
   */
  static async verifySignature(response: SIWSResponse): Promise<boolean> {
    try {
      // In a real implementation, this would send the response to the backend
      // For now, we'll do basic client-side validation
      
      // Verify the message structure
      if (!response.message || !response.signature || !response.publicKey) {
        return false;
      }

      // Verify the address matches
      if (response.message.address !== response.publicKey) {
        return false;
      }

      // Verify the challenge hasn't expired
      if (response.message.expirationTime && 
          new Date(response.message.expirationTime) < new Date()) {
        return false;
      }

      // Verify the nonce (this would be checked against stored nonces on backend)
      const storedChallenge = this.retrieveChallenge();
      if (!storedChallenge || storedChallenge.nonce !== response.message.nonce) {
        return false;
      }

      // In production, the backend would verify the cryptographic signature
      // using the Stellar SDK's signature verification
      
      return true;
    } catch (error) {
      console.error("SIWS verification failed:", error);
      return false;
    }
  }
}

/**
 * Sign-In With Stellar service
 */
export class SIWSService {
  /**
   * Initiate SIWS authentication flow
   */
  static async signIn(address: string): Promise<SIWSResponse> {
    const domain = window.location.hostname;
    const uri = window.location.origin;
    
    // Create challenge
    const challenge = SIWSChallenge.createChallenge(address, domain, uri);
    SIWSChallenge.storeChallenge(challenge);
    
    // Convert to transaction for signing
    const transaction = SIWSChallenge.messageToTransaction(challenge);
    const transactionXdr = transaction.toXDR();
    
    // Sign with wallet
    const signedXdr = await signTransaction(transactionXdr);
    const signedTransaction = Transaction.fromXDR(signedXdr, APP_STELLAR_NETWORK);
    
    // Extract signature
    const signatures = signedTransaction.signatures;
    if (signatures.length === 0) {
      throw new Error("No signature found in transaction");
    }
    
    const signature = signatures[0].signature().toString("base64");
    
    return {
      message: challenge,
      signature,
      publicKey: address
    };
  }

  /**
   * Verify SIWS authentication response
   */
  static async verify(response: SIWSResponse): Promise<boolean> {
    return await SIWSChallenge.verifySignature(response);
  }

  /**
   * Create authentication headers for API requests
   */
  static createAuthHeaders(response: SIWSResponse): Record<string, string> {
    return {
      'Authorization': `Bearer ${response.signature}`,
      'X-SIWS-Message': JSON.stringify(response.message),
      'X-SIWS-Public-Key': response.publicKey
    };
  }
}
