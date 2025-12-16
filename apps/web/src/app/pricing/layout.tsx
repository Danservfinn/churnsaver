import { MainLayout } from '@/components/layouts/MainLayout';

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MainLayout>{children}</MainLayout>;
}
