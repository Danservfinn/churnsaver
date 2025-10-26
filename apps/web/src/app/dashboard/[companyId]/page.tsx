export default async function DashboardCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return (
    <main style={{ padding: 16 }}>
      <h1>Dashboard for Company {companyId}</h1>
      <p>This route is Whop iframe compatible and will auto-resize when embedded.</p>
      <p>Dev tip: append <code>?embed=1</code> to the URL to simulate iframe embedding.</p>
    </main>
  );
}