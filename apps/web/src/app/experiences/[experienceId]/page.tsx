export default function ExperiencePage({
  params,
}: {
  params: { experienceId: string };
}) {
  return (
    <main style={{ padding: 16 }}>
      <h1>Experience {params.experienceId}</h1>
      <p>This route is Whop iframe compatible and will auto-resize when embedded.</p>
    </main>
  );
}