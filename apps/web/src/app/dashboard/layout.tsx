// Note: MainLayout/WhopAppLayout is provided by WhopClientWrapper at root level
// This layout just passes children through without additional wrapping

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}










