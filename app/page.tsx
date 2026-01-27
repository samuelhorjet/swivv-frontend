"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useProgram } from "../hooks/useProgram"; // Adjust path if needed based on your folder structure
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { SwivPrivacy } from "../idl/swiv_privacy";

type Pool = IdlAccounts<SwivPrivacy>["pool"];

const formatDate = (unixTs: number) => {
  const date = new Date(unixTs * 1000);
  return (
    date.toLocaleDateString() +
    " " +
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
};

export default function Home() {
  const { program, connection } = useProgram();
  const [pools, setPools] = useState<{ publicKey: PublicKey; account: Pool }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!program || !connection) return;

    const fetchPools = async () => {
      try {
        const discriminator = await program.coder.accounts.memcmp("pool");
        const rawAccounts = await connection.getProgramAccounts(
          program.programId,
          {
            filters: [
              { memcmp: { offset: 0, bytes: discriminator.bytes as string } },
            ],
          },
        );

        const decodedPools: { publicKey: PublicKey; account: Pool }[] = [];

        for (const raw of rawAccounts) {
          try {
            const account = program.coder.accounts.decode(
              "pool",
              raw.account.data,
            );
            decodedPools.push({ publicKey: raw.pubkey, account: account });
          } catch {
            /* skip zombies */
          }
        }

        // Sort: Active & Newest first
        const sorted = decodedPools.sort((a, b) => {
          // First priority: Is it active?
          const now = Date.now() / 1000;
          const aActive = a.account.endTime.toNumber() > now;
          const bActive = b.account.endTime.toNumber() > now;
          if (aActive && !bActive) return -1;
          if (!aActive && bActive) return 1;
          // Second priority: Start time
          return (
            b.account.startTime.toNumber() - a.account.startTime.toNumber()
          );
        });

        setPools(sorted);
      } catch (error) {
        console.error("Error fetching pools:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPools();
  }, [program, connection]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* NAVBAR */}
      <nav className="border-b border-gray-800 p-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-bold text-lg">
            S
          </div>
          <span className="text-xl font-bold tracking-tight">Swiv Privacy</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="text-gray-400 hover:text-white text-sm"
          >
            Admin Access
          </Link>
          <WalletMultiButton />
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="py-20 text-center px-4">
        <h1 className="text-5xl font-extrabold mb-6 bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-purple-500">
          Predict with True Privacy
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Place bets on crypto prices without revealing your position. Powered
          by Solana and MagicBlock TEEs for cryptographic secrecy.
        </p>
      </section>

      {/* POOLS GRID */}
      <main className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Active Markets
        </h2>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-64 bg-gray-800 rounded-xl animate-pulse"
              ></div>
            ))}
          </div>
        ) : pools.length === 0 ? (
          <div className="text-center py-20 bg-gray-800/50 rounded-xl border border-gray-700">
            <p className="text-gray-400">
              No active pools found at the moment.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map((item) => {
              const account = item.account;
              const now = Date.now() / 1000;
              const isEnded = account.endTime.toNumber() < now;
              const isResolved = account.isResolved;

              return (
                <Link
                  key={item.publicKey.toBase58()}
                  href={`/pools/${account.name}`} // Navigate to User Detail Page
                  className="group block"
                >
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 h-full transition hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-900/20 relative overflow-hidden">
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      {isResolved ? (
                        <span className="bg-gray-700 text-gray-300 text-xs font-bold px-2 py-1 rounded">
                          CLOSED
                        </span>
                      ) : isEnded ? (
                        <span className="bg-yellow-900 text-yellow-500 text-xs font-bold px-2 py-1 rounded">
                          ENDED
                        </span>
                      ) : (
                        <span className="bg-green-900 text-green-400 text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>{" "}
                          LIVE
                        </span>
                      )}
                    </div>

                    <h3 className="text-2xl font-bold mb-1 group-hover:text-blue-400 transition">
                      {account.name}
                    </h3>
                    <p className="text-gray-400 text-sm mb-6 h-10 line-clamp-2">
                      {account.metadata || "Predict the outcome."}
                    </p>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Liquidity</span>
                        <span className="font-mono text-white">
                          {(
                            account.vaultBalance.toNumber() / 1_000_000
                          ).toLocaleString()}{" "}
                          USDC
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Ends</span>
                        <span
                          className={isEnded ? "text-red-400" : "text-white"}
                        >
                          {formatDate(account.endTime.toNumber())}
                        </span>
                      </div>
                    </div>

                    <div className="mt-6 pt-6 border-t border-gray-700">
                      <button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg">
                        {isEnded ? "View Results" : "Place Bet"}
                      </button>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
