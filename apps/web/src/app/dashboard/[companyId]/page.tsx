import { DashboardWrapper } from './DashboardWrapper';

export default async function DashboardCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return <DashboardWrapper companyId={companyId} />;
}
