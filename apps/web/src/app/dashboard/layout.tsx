import { SidebarLayout } from '@/components/layouts/SidebarLayout';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SidebarLayout>{children}</SidebarLayout>;
}









