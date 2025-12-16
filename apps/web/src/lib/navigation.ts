import {
  Home,
  LayoutDashboard,
  CreditCard,
  Settings,
  MessageSquare,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If true, href will be modified to include companyId when available */
  useCompanyId?: boolean;
}

/**
 * Centralized navigation configuration - single source of truth
 * Used by TopToolbar and any other navigation components
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    icon: Home,
  },
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    useCompanyId: true,
  },
  {
    label: 'Messages',
    href: '/messages',
    icon: MessageSquare,
  },
  {
    label: 'Pricing',
    href: '/pricing',
    icon: CreditCard,
  },
  {
    label: 'Configuration',
    href: '/settings',
    icon: Settings,
  },
];

/**
 * Get the navigation href, optionally injecting companyId for dashboard routes
 */
export function getNavHref(item: NavItem, companyId?: string | null): string {
  if (item.useCompanyId && companyId) {
    return `${item.href}/${companyId}`;
  }
  return item.href;
}

/**
 * Check if a navigation item is active based on current pathname
 */
export function isNavActive(item: NavItem, pathname: string, companyId?: string | null): boolean {
  const href = getNavHref(item, companyId);

  if (href === '/') {
    return pathname === '/';
  }

  // Dashboard special case: match base dashboard or company-specific
  if (item.href === '/dashboard') {
    return pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  }

  return pathname.startsWith(href);
}
