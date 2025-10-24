export default function DashboardCompanyPage({
  params,
}: {
  params: { companyId: string };
}) {
  return (
    <main style={{ padding: 16 }}>
      <h1>Dashboard for Company {params.companyId}</h1>
      <p>This route is Whop iframe compatible and will auto-resize when embedded.</p>
      <p>Dev tip: append <code>?embed=1</code> to the URL to simulate iframe embedding.</p>
    </main>
  );
}