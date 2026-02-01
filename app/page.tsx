"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useProgram } from "../hooks/useProgram";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PoolWithAddress } from "../types/swiv";
import { BN } from "@coral-xyz/anchor";

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
  const [pools, setPools] = useState<PoolWithAddress[]>([]);
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

        const decodedPools: PoolWithAddress[] = [];
        for (const raw of rawAccounts) {
          try {
            const account = program.coder.accounts.decode(
              "pool",
              raw.account.data,
            );
            decodedPools.push({ publicKey: raw.pubkey, account: account });
          } catch {
            /* skip */
          }
        }

        const sorted = decodedPools.sort((a, b) => {
          const nowBN = new BN(Math.floor(Date.now() / 1000));

          const getScore = (p: typeof a) => {
            const ended = p.account.endTime.lt(nowBN);
            if (!ended) return 0; // Top Priority
            if (ended && !p.account.weightFinalized) return 1; // Second Priority
            return 2; // Last Priority
          };

          const scoreA = getScore(a);
          const scoreB = getScore(b);

          if (scoreA !== scoreB) return scoreA - scoreB;

          // Tie-breaker: Newest Start Time first
          if (b.account.startTime.gt(a.account.startTime)) return 1;
          if (a.account.startTime.gt(b.account.startTime)) return -1;
          return 0;
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

      <section className="py-20 text-center px-4">
        <h1 className="text-5xl font-extrabold mb-6 bg-clip-text text-transparent bg-linear-to-r from-blue-400 to-purple-500">
          Predict with True Privacy
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Place bets on crypto prices without revealing your position.
        </p>
      </section>

      <main className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
          Markets
        </h2>

        {loading ? (
          <div className="text-center">Loading markets...</div>
        ) : pools.length === 0 ? (
          <div className="text-center py-20 bg-gray-800/50 rounded-xl border border-gray-700">
            <p className="text-gray-400">No active pools found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pools.map((item) => {
              const account = item.account;
              const endTimeNum = Number(account.endTime.toString());
              const now = Date.now() / 1000;
              const isEnded = endTimeNum < now;
              const isResolved = account.isResolved;
              const isFinalized = account.weightFinalized;

              return (
                <Link
                  key={item.publicKey.toBase58()}
                  href={`/pools/${item.publicKey.toBase58()}`}
                  className="group block"
                >
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 h-full transition hover:border-blue-500 hover:shadow-2xl hover:shadow-blue-900/20 relative overflow-hidden">
                    <div className="absolute top-4 right-4">
                      {isFinalized ? (
                        <span className="bg-gray-700 text-gray-300 text-xs font-bold px-2 py-1 rounded">
                          CLOSED
                        </span>
                      ) : isResolved ? (
                        <span className="bg-purple-900 text-purple-300 text-xs font-bold px-2 py-1 rounded">
                          RESOLVED
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
                    <p className="text-gray-400 text-sm mb-4 h-10 line-clamp-2">
                      {account.metadata}
                    </p>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Buffer</span>
                        <span className="text-yellow-500 font-mono">
                          ±{(Number(account.maxAccuracyBuffer.toString()) / 1_000_000).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 6
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Liquidity</span>
                        <span className="font-mono text-white">
                          {(
                            Number(account.vaultBalance.toString()) / 1e6
                          ).toLocaleString()}{" "}
                          USDC
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Ends</span>
                        <span
                          className={isEnded ? "text-red-400" : "text-white"}
                        >
                          {formatDate(endTimeNum)}
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
