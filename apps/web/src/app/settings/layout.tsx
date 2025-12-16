import { MainLayout } from '@/components/layouts/MainLayout';

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
