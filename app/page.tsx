"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Product, ProductsResponse } from "@/lib/types";
import { CATEGORIES } from "@/lib/types";

const PAGE_SIZE = 20;

export default function Home() {
  const [category, setCategory] = useState<string>(""); // "" = all
  const [products, setProducts] = useState<Product[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);

  // A token that increments whenever the filter resets, so an in-flight request
  // from a previous filter can't append stale rows to the new list.
  const requestId = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (opts: { reset?: boolean }) => {
      if (loading) return;
      // For non-reset (append) loads, stop if there's nothing more.
      if (!opts.reset && !hasMore) return;

      const myRequestId = opts.reset ? ++requestId.current : requestId.current;
      setLoading(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        qs.set("limit", String(PAGE_SIZE));
        if (category) qs.set("category", category);
        const activeCursor = opts.reset ? null : cursor;
        if (activeCursor) qs.set("cursor", activeCursor);

        const res = await fetch(`/api/products?${qs.toString()}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Request failed (${res.status})`);
        }
        const data: ProductsResponse = await res.json();

        // Ignore responses from a superseded filter.
        if (myRequestId !== requestId.current) return;

        setProducts((prev) =>
          opts.reset ? data.products : [...prev, ...data.products]
        );
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
      } catch (err) {
        if (myRequestId === requestId.current) {
          setError((err as Error).message);
        }
      } finally {
        if (myRequestId === requestId.current) setLoading(false);
      }
    },
    [category, cursor, hasMore, loading]
  );

  // Reset and load whenever the category filter changes.
  useEffect(() => {
    setProducts([]);
    setCursor(null);
    setHasMore(true);
    loadPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Infinite scroll: load the next page when the sentinel enters the viewport.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadPage({ reset: false });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadPage]);

  async function insertRandom() {
    setInserting(true);
    setError(null);
    try {
      const res = await fetch("/api/products/insert-random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      if (!res.ok) throw new Error(`Insert failed (${res.status})`);
      // We intentionally do NOT refetch — the point of the demo is that you can
      // keep scrolling and the new rows never appear mid-list or cause dupes.
      // Reload from the top to see them appear at the top.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInserting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Keyset Product Browser</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cursor pagination over ~200k products, newest first. Consistent under
          concurrent inserts.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <button
          onClick={insertRandom}
          disabled={inserting}
          className="ml-auto rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {inserting ? "Inserting…" : "Insert 5 random (demo)"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.category} ·{" "}
                {new Date(p.created_at).toLocaleString()}
              </div>
            </div>
            <div className="ml-4 shrink-0 font-mono text-sm">
              ${Number(p.price).toFixed(2)}
            </div>
          </li>
        ))}
      </ul>

      <div ref={sentinelRef} className="h-px" />

      <div className="mt-4 flex flex-col items-center gap-2">
        {products.length > 0 && (
          <p className="text-sm font-medium text-gray-600">
            Showing {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        )}

        {loading && <p className="text-sm text-gray-500">Loading…</p>}

        {!loading && hasMore && (
          <button
            onClick={() => loadPage({ reset: false })}
            className="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Load more
          </button>
        )}

        {!loading && !hasMore && products.length > 0 && (
          <p className="text-sm text-gray-400">— End of list —</p>
        )}

        {!loading && products.length === 0 && (
          <p className="text-sm text-gray-400">No products found.</p>
        )}
      </div>
    </main>
  );
}
