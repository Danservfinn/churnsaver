export default async function ExperiencePage({
  params,
}: {
  params: Promise<{ experienceId: string }>;
}) {
  const { experienceId } = await params;

  return (
    <main style={{ padding: 16 }}>
      <h1>Experience {experienceId}</h1>
      <p>This route is Whop iframe compatible and will auto-resize when embedded.</p>
    </main>
  );
}