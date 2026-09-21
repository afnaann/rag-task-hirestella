/**
 * Placeholder home page.
 * 
 * Phase 1: This page is intentionally minimal — just enough for `npm run build`
 * to succeed. The portfolio UI and chat widget are deferred to Phase 2.
 */
export default function HomePage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Portfolio — Phase 1 Placeholder</h1>
      <p>
        Ingestion pipeline is ready. Run <code>npm run ingest</code> to build
        the vector store.
      </p>
      <p>
        The portfolio UI and chat widget will be added in Phase 2.
      </p>
    </main>
  );
}
