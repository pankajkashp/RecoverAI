"use client";

export interface FilterState {
  search: string;
  status: string;
  failureCategory: string;
  recoveryWorthiness: string;
  recoveryStatus: string;
}

interface PaymentFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onReset: () => void;
}

export function PaymentFilters({
  filters,
  onFilterChange,
  onReset,
}: PaymentFiltersProps) {
  const isFiltered =
    Boolean(filters.search) ||
    Boolean(filters.status) ||
    Boolean(filters.failureCategory) ||
    Boolean(filters.recoveryWorthiness) ||
    Boolean(filters.recoveryStatus);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs space-y-3">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search payment ID, customer ref, or failure reason..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          />
        </div>

        {/* Reset Filter Action */}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 self-end md:self-auto"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Dropdown Filters Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-border/40">
        {/* Payment Status */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Payment Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Statuses</option>
            <option value="FAILED">Failed</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        {/* Failure Category */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Failure Category
          </label>
          <select
            value={filters.failureCategory}
            onChange={(e) => onFilterChange({ failureCategory: e.target.value })}
            className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Categories</option>
            <option value="INSUFFICIENT_FUNDS">Insufficient Funds</option>
            <option value="NETWORK">Network / Timeout</option>
            <option value="AUTHENTICATION">Authentication</option>
            <option value="CARD">Card Invalidation</option>
            <option value="BANK">Bank Switch</option>
            <option value="PROVIDER">Provider Error</option>
            <option value="CUSTOMER_ACTION_REQUIRED">Customer Action</option>
            <option value="TEMPORARY">Temporary</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </div>

        {/* Recovery Worthiness */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Worthiness Decision
          </label>
          <select
            value={filters.recoveryWorthiness}
            onChange={(e) =>
              onFilterChange({ recoveryWorthiness: e.target.value })
            }
            className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Decisions</option>
            <option value="RECOVER">RECOVER</option>
            <option value="REVIEW">REVIEW</option>
            <option value="DO_NOT_RECOVER">DO_NOT_RECOVER</option>
          </select>
        </div>

        {/* Recovery Status */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
            Recovery Status
          </label>
          <select
            value={filters.recoveryStatus}
            onChange={(e) => onFilterChange({ recoveryStatus: e.target.value })}
            className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All Outcomes</option>
            <option value="SUCCESSFUL">Successful</option>
            <option value="FAILED">Failed</option>
            <option value="RECOMMENDED">Recommended</option>
            <option value="ATTEMPTED">Attempted</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>
    </div>
  );
}
