import { MainLayout } from '@/components/layouts/MainLayout';

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
