import { headers } from 'next/headers';
import { whopsdk } from '@/lib/whop-sdk';
import { DashboardClient } from './DashboardClient';

export default async function DashboardCompanyPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  // Verify user token from Whop
  const headersList = await headers();
  const { userId } = await whopsdk.verifyUserToken(headersList);

  // Fetch company and user data
  const [company, user] = await Promise.all([
    whopsdk.companies.retrieve(companyId),
    whopsdk.users.retrieve(userId),
  ]);

  return (
    <DashboardClient
      companyId={companyId}
      userId={userId}
      companyName={company.title || companyId}
      userName={user.name || user.username || 'User'}
    />
  );
}
