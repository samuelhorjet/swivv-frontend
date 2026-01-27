"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  TransactionMessage,
  VersionedTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import * as anchor from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { useProgram } from "../../hooks/useProgram";
import {
  SEED_GLOBAL_CONFIG,
  SEED_POOL,
  SEED_POOL_VAULT,
} from "../../utils/contants";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

// --- TYPE FOR BALANCES ---
type TokenBalance = {
  mint: string;
  amount: number;
  decimals: number;
};

export default function AdminPage() {
  const { program, connection } = useProgram();
  const { publicKey, sendTransaction } = useWallet();

  // App State
  const [activeTab, setActiveTab] = useState("create");
  const [loading, setLoading] = useState(false);
  const [protocolInitialized, setProtocolInitialized] = useState<
    boolean | null
  >(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [treasuryAddress, setTreasuryAddress] = useState<string>("");
  const [protocolFee, setProtocolFee] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  // --- NEW: Treasury Balances State (Array) ---
  const [treasuryBalances, setTreasuryBalances] = useState<TokenBalance[]>([]);

  // Forms
  const [poolName, setPoolName] = useState("");
  const [mintAddress, setMintAddress] = useState("");
  const [durationSeconds, setDurationSeconds] = useState(300);
  const [startDelay, setStartDelay] = useState(0);
  const [accuracyBuffer, setAccuracyBuffer] = useState(500);
  const [metadata, setMetadata] = useState("BTC/USDC");

  // Config Forms
  const [newFee, setNewFee] = useState("");
  const [newTreasury, setNewTreasury] = useState("");
  const [newAdmin, setNewAdmin] = useState("");

  // --- 1. AUTO-LOAD LAST USED MINT (Convenience only) ---
  useEffect(() => {
    const saved = localStorage.getItem("swiv_last_mint");
    if (saved) setMintAddress(saved);
  }, []);

  const handleMintChange = (val: string) => {
    setMintAddress(val);
    localStorage.setItem("swiv_last_mint", val);
  };

  // --- HELPER: Send Versioned Transaction ---
  const sendVersionedTx = useCallback(
    async (instruction: TransactionInstruction) => {
      if (!publicKey || !connection) throw new Error("Wallet not connected");

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();

      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: blockhash,
        instructions: [instruction],
      }).compileToV0Message();

      const transaction = new VersionedTransaction(messageV0);
      const signature = await sendTransaction(transaction, connection);

      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      if (confirmation.value.err) throw new Error("Transaction failed");

      return signature;
    },
    [publicKey, connection, sendTransaction],
  );

  // 2. Check Protocol Status
  useEffect(() => {
    if (!program || !publicKey) return;

    const checkStatus = async () => {
      setLoading(true);
      try {
        const [configPda] = PublicKey.findProgramAddressSync(
          [SEED_GLOBAL_CONFIG],
          program.programId,
        );

        const configAccount =
          await program.account.globalConfig.fetch(configPda);

        setProtocolInitialized(true);
        setTreasuryAddress(configAccount.treasuryWallet.toBase58());
        setProtocolFee(configAccount.protocolFeeBps.toNumber());
        setIsPaused(configAccount.paused);
        setIsAdmin(configAccount.admin.toBase58() === publicKey.toBase58());
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        if (
          errMsg.includes("Account does not exist") ||
          errMsg.includes("AccountNotInitialized")
        ) {
          setProtocolInitialized(false);
        } else {
          console.error("Error fetching config:", error);
        }
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [program, publicKey]);

  // --- 3. AUTO-SCAN TREASURY BALANCES (The Fix) ---
  useEffect(() => {
    if (activeTab === "treasury" && treasuryAddress && connection) {
      const fetchAllBalances = async () => {
        try {
          const pubkey = new PublicKey(treasuryAddress);

          // Fetch ALL token accounts owned by the treasury
          const accounts = await connection.getParsedTokenAccountsByOwner(
            pubkey,
            { programId: TOKEN_PROGRAM_ID },
          );

          const foundBalances: TokenBalance[] = accounts.value
            .map((item) => {
              const info = item.account.data.parsed.info;
              return {
                mint: info.mint,
                amount: info.tokenAmount.uiAmount || 0,
                decimals: info.tokenAmount.decimals,
              };
            })
            .filter((b) => b.amount > 0); // Only show tokens with balance > 0

          setTreasuryBalances(foundBalances);
        } catch (e) {
          console.error("Error fetching treasury balances:", e);
        }
      };
      fetchAllBalances();
    }
  }, [activeTab, treasuryAddress, connection]);

  // --- ACTIONS ---

  const initializeProtocol = async () => {
    if (!program || !publicKey) return;
    try {
      setLoading(true);
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );

      const ix = await program.methods
        .initializeProtocol(new anchor.BN(300))
        .accountsPartial({
          admin: publicKey,
          treasuryWallet: publicKey,
          systemProgram: SystemProgram.programId,
          globalConfig: configPda,
        })
        .instruction();

      await sendVersionedTx(ix);
      alert("Success! Reloading...");
      window.location.reload();
    } catch (error) {
      console.error(error);
      alert("Initialization Failed.");
    } finally {
      setLoading(false);
    }
  };

  const createPool = async () => {
    if (!program || !publicKey) return;
    try {
      setLoading(true);
      const startTime = Math.floor(Date.now() / 1000) + Number(startDelay);
      const endTime = startTime + Number(durationSeconds);
      const poolNameBytes = Buffer.from(poolName);

      const [poolPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL, poolNameBytes],
        program.programId,
      );
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [SEED_POOL_VAULT, poolPda.toBuffer()],
        program.programId,
      );

      if (!mintAddress) {
        alert("Please provide a Token Mint Address");
        return;
      }

      const mintPubkey = new PublicKey(mintAddress);
      const adminAta = await getAssociatedTokenAddress(mintPubkey, publicKey);

      // Fix: Scale buffer to match 6 decimals
      const scaledBuffer = new anchor.BN(accuracyBuffer * 1_000_000);

      const ix = await program.methods
        .createPool(
          poolName,
          metadata,
          new anchor.BN(startTime),
          new anchor.BN(endTime),
          scaledBuffer,
          new anchor.BN(1000),
        )
        .accountsPartial({
          globalConfig: PublicKey.findProgramAddressSync(
            [SEED_GLOBAL_CONFIG],
            program.programId,
          )[0],
          pool: poolPda,
          poolVault: vaultPda,
          tokenMint: mintPubkey,
          admin: publicKey,
          adminTokenAccount: adminAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .instruction();

      await sendVersionedTx(ix);
      alert(`Pool "${poolName}" created successfully!`);
    } catch (error) {
      console.error("Pool Creation Error:", error);
      alert("Failed to create pool.");
    } finally {
      setLoading(false);
    }
  };

  const updateConfig = async () => {
    if (!program || !publicKey) return;
    try {
      setLoading(true);
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );

      const newTreasuryKey = newTreasury ? new PublicKey(newTreasury) : null;
      const newFeeBn = newFee ? new anchor.BN(newFee) : null;

      const ix = await program.methods
        .updateConfig(newTreasuryKey, newFeeBn)
        .accountsPartial({
          admin: publicKey,
          globalConfig: configPda,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      await sendVersionedTx(ix);
      alert("Config updated!");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Update failed.");
    } finally {
      setLoading(false);
    }
  };

  const togglePause = async () => {
    if (!program || !publicKey) return;
    try {
      setLoading(true);
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );
      const ix = await program.methods
        .setPause(!isPaused)
        .accountsPartial({
          admin: publicKey,
          globalConfig: configPda,
        })
        .instruction();

      await sendVersionedTx(ix);
      setIsPaused(!isPaused);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const transferAdmin = async () => {
    if (!program || !publicKey || !newAdmin) return;
    try {
      setLoading(true);
      const [configPda] = PublicKey.findProgramAddressSync(
        [SEED_GLOBAL_CONFIG],
        program.programId,
      );
      const ix = await program.methods
        .transferAdmin(new PublicKey(newAdmin))
        .accountsPartial({
          currentAdmin: publicKey,
          globalConfig: configPda,
        })
        .instruction();

      await sendVersionedTx(ix);
      alert("Admin transferred!");
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert("Transfer failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey)
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
        <WalletMultiButton />
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="flex justify-between items-center mb-10 border-b border-gray-700 pb-4">
        <h1 className="text-2xl font-bold">Swiv Privacy: Admin</h1>
        <div className="flex gap-4">
          <Link
            href="/admin/pools"
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded text-sm transition"
          >
            View All Pools
          </Link>
          <WalletMultiButton />
        </div>
      </header>

      <main className="max-w-4xl mx-auto space-y-8">
        {protocolInitialized === false ? (
          <div className="bg-yellow-900/30 border border-yellow-600 p-8 rounded text-center">
            <h2 className="text-2xl font-bold mb-4">Welcome to Swiv Privacy</h2>
            <button
              onClick={initializeProtocol}
              disabled={loading}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-8 py-3 rounded font-bold transition"
            >
              {loading ? "Initializing..." : "Initialize Protocol"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex border-b border-gray-700 mb-6">
              {["create", "config", "management", "treasury"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-6 py-3 font-medium capitalize ${
                    activeTab === tab
                      ? "border-b-2 border-blue-500 text-blue-400"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {!isAdmin && (
              <div className="bg-red-900/50 border border-red-500 p-4 rounded text-center">
                ⛔ ACCESS DENIED: View Only Mode
              </div>
            )}

            {activeTab === "create" && isAdmin && (
              <section className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-6">Create Pool</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-gray-400">
                        Pool Name
                      </label>
                      <input
                        type="text"
                        className="w-full bg-gray-700 rounded p-2"
                        value={poolName}
                        onChange={(e) => setPoolName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400">
                        Metadata
                      </label>
                      <input
                        type="text"
                        className="w-full bg-gray-700 rounded p-2"
                        value={metadata}
                        onChange={(e) => setMetadata(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400">
                        Mint Address
                      </label>
                      <input
                        type="text"
                        className="w-full bg-gray-700 rounded p-2"
                        value={mintAddress}
                        onChange={(e) => handleMintChange(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400">
                          Delay (s)
                        </label>
                        <input
                          type="number"
                          className="w-full bg-gray-700 rounded p-2"
                          value={startDelay}
                          onChange={(e) =>
                            setStartDelay(Number(e.target.value))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400">
                          Duration (s)
                        </label>
                        <input
                          type="number"
                          className="w-full bg-gray-700 rounded p-2"
                          value={durationSeconds}
                          onChange={(e) =>
                            setDurationSeconds(Number(e.target.value))
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400">
                        Accuracy Buffer
                      </label>
                      <input
                        type="number"
                        className="w-full bg-gray-700 rounded p-2"
                        value={accuracyBuffer}
                        onChange={(e) =>
                          setAccuracyBuffer(Number(e.target.value))
                        }
                      />
                    </div>
                    <button
                      onClick={createPool}
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded mt-2"
                    >
                      {loading ? "Creating..." : "Create Pool"}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "config" && isAdmin && (
              <section className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-6">
                <div className="grid grid-cols-2 gap-4 text-sm bg-gray-900 p-4 rounded">
                  <div>
                    <span className="text-gray-500">Current Fee:</span>{" "}
                    <span className="text-white ml-2">
                      {protocolFee} bps ({protocolFee / 100}%)
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Current Treasury:</span>{" "}
                    <span className="text-white ml-2 text-xs">
                      {treasuryAddress}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400">
                      New Protocol Fee (bps)
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-700 rounded p-2 mt-1"
                      value={newFee}
                      onChange={(e) => setNewFee(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400">
                      New Treasury Address
                    </label>
                    <input
                      type="text"
                      className="w-full bg-gray-700 rounded p-2 mt-1"
                      value={newTreasury}
                      onChange={(e) => setNewTreasury(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={updateConfig}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded"
                >
                  Update Config
                </button>
              </section>
            )}

            {activeTab === "management" && isAdmin && (
              <section className="bg-gray-800 p-6 rounded-lg shadow-lg space-y-8">
                <div className="border-b border-gray-700 pb-6">
                  <h3 className="font-bold mb-4">Emergency Controls</h3>
                  <div className="flex items-center justify-between bg-gray-900 p-4 rounded">
                    <div>
                      <p className="font-bold">
                        Protocol State:{" "}
                        <span
                          className={
                            isPaused ? "text-red-500" : "text-green-500"
                          }
                        >
                          {isPaused ? "PAUSED" : "ACTIVE"}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Pausing stops all new bets.
                      </p>
                    </div>
                    <button
                      onClick={togglePause}
                      className={`px-4 py-2 rounded font-bold ${
                        isPaused ? "bg-green-600" : "bg-red-600"
                      }`}
                    >
                      {isPaused ? "Resume Protocol" : "Pause Protocol"}
                    </button>
                  </div>
                </div>
                <div>
                  <h3 className="font-bold mb-4 text-red-400">
                    Danger Zone: Transfer Ownership
                  </h3>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      className="flex-1 bg-gray-700 rounded p-2"
                      placeholder="New Admin Pubkey"
                      value={newAdmin}
                      onChange={(e) => setNewAdmin(e.target.value)}
                    />
                    <button
                      onClick={transferAdmin}
                      disabled={!newAdmin}
                      className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded"
                    >
                      Transfer
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === "treasury" && isAdmin && (
              <section className="bg-gray-800 p-6 rounded-lg shadow-lg text-center">
                <h2 className="text-xl font-semibold mb-4">
                  Treasury Vault Assets
                </h2>
                <div className="space-y-4">
                  {treasuryBalances.length === 0 ? (
                    <div className="bg-gray-900 p-6 rounded-lg">
                      <p className="text-gray-400">
                        No assets found or loading...
                      </p>
                      <p className="text-xs text-gray-600 mt-2">
                        {treasuryAddress}
                      </p>
                    </div>
                  ) : (
                    treasuryBalances.map((bal, idx) => (
                      <div
                        key={idx}
                        className="bg-gray-900 p-6 rounded-lg inline-block min-w-75 mx-2"
                      >
                        <p className="text-gray-400 text-sm mb-2">
                          Balance (Mint: {bal.mint.slice(0, 4)}...
                          {bal.mint.slice(-4)})
                        </p>
                        <p className="text-4xl font-bold text-green-400">
                          {bal.amount.toLocaleString()}{" "}
                          <span className="text-lg text-gray-500">Tokens</span>
                        </p>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-6">
                  These are all tokens currently held by the Treasury Wallet.
                </p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
