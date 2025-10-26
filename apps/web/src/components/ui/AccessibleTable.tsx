import React, { forwardRef, TableHTMLAttributes, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { AccessibilityUtils } from '@/lib/accessibility';
import { getAriaAttributes } from '@/lib/accessibilityConfig';

interface AccessibleTableProps extends TableHTMLAttributes<HTMLTableElement> {
  caption?: string;
  description?: string;
  sortable?: boolean;
  onSort?: (column: string, direction: 'asc' | 'desc') => void;
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  selectable?: boolean;
  onSelect?: (selectedRows: string[]) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
  };
}

interface AccessibleTableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  scope?: 'col' | 'row' | 'colgroup' | 'rowgroup';
  headers?: string;
  abbr?: string;
  sortable?: boolean;
  onSort?: (direction: 'asc' | 'desc') => void;
  sortDirection?: 'asc' | 'desc';
  selected?: boolean;
  selectable?: boolean;
  onSelect?: (selected: boolean) => void;
}

interface AccessibleTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  selectable?: boolean;
}

/**
 * Accessible Table component with WCAG 2.1 compliance
 * 
 * @component
 * @example
 * ```tsx
 * <AccessibleTable 
 *   caption="User accounts"
 *   description="List of all user accounts with their status"
 *   sortable
 *   onSort={handleSort}
 * >
 *   <thead>
 *     <tr>
 *       <AccessibleTableCell scope="col" sortable>Name</AccessibleTableCell>
 *       <AccessibleTableCell scope="col" sortable>Email</AccessibleTableCell>
 *     </tr>
 *   </thead>
 *   <tbody>
 *     <tr>
 *       <td>John Doe</td>
 *       <td>john@example.com</td>
 *     </tr>
 *   </tbody>
 * </AccessibleTable>
 * ```
 */
const AccessibleTable = forwardRef<HTMLTableElement, AccessibleTableProps>(
  ({ 
    className, 
    children, 
    caption,
    description,
    sortable = false,
    onSort,
    sortColumn,
    sortDirection,
    selectable = false,
    onSelect,
    pagination,
    ...props 
  }, ref) => {
    const [selectedRows, setSelectedRows] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(pagination?.currentPage || 1);

    const tableId = React.useId();
    const captionId = `${tableId}-caption`;
    const descriptionId = `${tableId}-description`;

    const baseClasses = 'min-w-full divide-y divide-gray-200 dark:divide-gray-700';
    const classes = cn(baseClasses, className);

    // Build ARIA attributes
    const ariaProps: any = {
      role: 'table',
      'aria-labelledby': caption ? captionId : undefined,
      'aria-describedby': description ? descriptionId : undefined,
      'aria-rowcount': undefined, // Will be set dynamically
      'aria-multiselectable': selectable ? true : undefined
    };

    // Handle row selection
    const handleRowSelect = (rowId: string, selected: boolean) => {
      let newSelectedRows: string[];
      
      if (selected) {
        newSelectedRows = [...selectedRows, rowId];
      } else {
        newSelectedRows = selectedRows.filter(id => id !== rowId);
      }
      
      setSelectedRows(newSelectedRows);
      
      if (onSelect) {
        onSelect(newSelectedRows);
      }
    };

    // Handle select all
    const handleSelectAll = (selected: boolean) => {
      const table = ref?.current;
      if (!table) return;
      
      const rows = table.querySelectorAll('tbody tr[data-row-id]');
      const rowIds = Array.from(rows).map(row => row.getAttribute('data-row-id')!);
      
      if (selected) {
        setSelectedRows(rowIds);
      } else {
        setSelectedRows([]);
      }
      
      if (onSelect) {
        onSelect(selected ? rowIds : []);
      }
    };

    // Handle column sorting
    const handleColumnSort = (column: string) => {
      if (!sortable || !onSort) return;
      
      const newDirection = 
        sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
      
      onSort(column, newDirection);
    };

    // Handle pagination
    const handlePageChange = (page: number) => {
      setCurrentPage(page);
      
      if (pagination) {
        pagination.onPageChange(page);
      }
    };

    // Count rows for aria-rowcount
    useEffect(() => {
      const table = ref?.current;
      if (table) {
        const tbody = table.querySelector('tbody');
        if (tbody) {
          const rows = tbody.querySelectorAll('tr').length;
          ariaProps['aria-rowcount'] = rows;
        }
      }
    }, [children, ref]);

    return (
      <div className="relative">
        <table
          className={classes}
          ref={ref}
          {...ariaProps}
          {...props}
        >
          {/* Table Caption */}
          {(caption || description) && (
            <caption className="sr-only">
              {caption && (
                <div id={captionId} className="text-lg font-semibold">
                  {caption}
                </div>
              )}
              {description && (
                <div id={descriptionId} className="text-sm text-gray-600 mt-1">
                  {description}
                </div>
              )}
            </caption>
          )}
          
          {children}
        </table>
        
        {/* Table Navigation */}
        {pagination && (
          <nav
            className="flex items-center justify-between px-6 py-3 border-t border-gray-200 dark:border-gray-700"
            aria-label="Table navigation"
            role="navigation"
          >
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Showing {((currentPage - 1) * 10) + 1} to {Math.min(currentPage * 10, pagination.totalPages * 10)} of {pagination.totalPages * 10} results
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Previous page"
              >
                Previous
              </button>
              
              <span className="px-3 py-1 text-sm text-gray-700 dark:text-gray-300">
                Page {currentPage} of {pagination.totalPages}
              </span>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === pagination.totalPages}
                className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </div>
    );
  }
);

AccessibleTable.displayName = 'AccessibleTable';

// Accessible Table Cell component
export const AccessibleTableCell = forwardRef<HTMLTableCellElement, AccessibleTableCellProps>(
  ({ 
    className, 
    scope, 
    headers, 
    abbr, 
    sortable = false, 
    onSort, 
    sortDirection, 
    selected, 
    selectable, 
    onSelect, 
    children, 
    ...props 
  }, ref) => {
    const isHeader = scope === 'col' || scope === 'row';
    const cellId = React.useId();
    
    const baseClasses = isHeader 
      ? "px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
      : "px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white";
    
    const classes = cn(baseClasses, className, {
      'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700': sortable,
      'bg-blue-50 dark:bg-blue-900': selected
    });

    // Build ARIA attributes
    const ariaProps: any = {
      role: isHeader ? 'columnheader' : 'gridcell',
      'aria-sort': sortable && sortDirection 
        ? sortDirection === 'asc' ? 'ascending' : 'descending'
        : sortable ? 'none' : undefined,
      'aria-selected': selected,
      'aria-describedby': props['aria-describedby']
    };

    if (scope) {
      ariaProps.scope = scope;
    }
    
    if (headers) {
      ariaProps.headers = headers;
    }
    
    if (abbr) {
      ariaProps.abbr = abbr;
    }

    const handleClick = () => {
      if (sortable && onSort) {
        const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        onSort(newDirection);
      }
      
      if (selectable && onSelect) {
        onSelect(!selected);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    };

    return (
      <th
        className={classes}
        ref={ref}
        tabIndex={sortable || selectable ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...ariaProps}
        {...props}
      >
        <div className="flex items-center space-x-2">
          {children}
          
          {sortable && (
            <span className="inline-flex flex-col space-y-1" aria-hidden="true">
              <svg
                className={cn(
                  "w-3 h-3 text-gray-400",
                  sortDirection === 'asc' ? "text-blue-600" : ""
                )}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                  clipRule="evenodd"
                />
              </svg>
              <svg
                className={cn(
                  "w-3 h-3 text-gray-400",
                  sortDirection === 'desc' ? "text-blue-600" : ""
                )}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
          )}
        </div>
      </th>
    );
  }
);

AccessibleTableCell.displayName = 'AccessibleTableCell';

// Accessible Table Row component
export const AccessibleTableRow = forwardRef<HTMLTableRowElement, AccessibleTableRowProps>(
  ({ 
    className, 
    selected, 
    onSelect, 
    selectable, 
    children, 
    ...props 
  }, ref) => {
    const rowId = React.useId();
    
    const baseClasses = "hover:bg-gray-50 dark:hover:bg-gray-700";
    const classes = cn(baseClasses, className, {
      'bg-blue-50 dark:bg-blue-900': selected
    });

    // Build ARIA attributes
    const ariaProps: any = {
      role: 'row',
      'aria-selected': selected,
      'data-row-id': selectable ? rowId : undefined
    };

    const handleClick = () => {
      if (selectable && onSelect) {
        onSelect(!selected);
      }
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick();
      }
    };

    return (
      <tr
        className={classes}
        ref={ref}
        tabIndex={selectable ? 0 : -1}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        {...ariaProps}
        {...props}
      >
        {children}
      </tr>
    );
  }
);

AccessibleTableRow.displayName = 'AccessibleTableRow';

export { AccessibleTable, AccessibleTableCell, AccessibleTableRow };
export default AccessibleTable;