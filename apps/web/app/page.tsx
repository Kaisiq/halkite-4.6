export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
      }}
    >
      <section
        style={{
          width: "min(900px, 100%)",
          border: "1px solid rgba(156, 176, 197, 0.18)",
          background: "var(--panel)",
          borderRadius: "24px",
          padding: "32px",
          backdropFilter: "blur(18px)",
          boxShadow: "0 20px 80px rgba(0, 0, 0, 0.35)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "var(--accent)",
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontSize: "0.75rem",
            fontWeight: 700,
          }}
        >
          MVP Shell
        </p>
        <h1 style={{ margin: "16px 0 12px", fontSize: "clamp(2.5rem, 6vw, 5rem)" }}>
          NEXUS
        </h1>
        <p style={{ margin: 0, fontSize: "1.125rem", color: "var(--muted)", maxWidth: "60ch" }}>
          Workspace is bootstrapped. Frontend concept work comes next: five presentation
          directions, graph views, simulation flow, and report storytelling.
        </p>
      </section>
    </main>
  );
}
