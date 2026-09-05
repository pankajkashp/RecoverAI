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
    <div className="rounded-2xl border border-border/70 bg-card/85 backdrop-blur-md p-4.5 shadow-sm space-y-3.5">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search payment ID, customer ref, or failure reason..."
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="w-full pl-8.5 pr-3 py-1.5 text-xs rounded-lg border border-border/80 bg-background text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-indigo-500/50 focus-visible:border-indigo-500/50 transition-colors"
          />
        </div>

        {/* Reset Filter Action */}
        {isFiltered && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5 self-end md:self-auto px-2.5 py-1.5 rounded-lg border border-border/80 hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="h-3 w-3"
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Payment Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value })}
            className="w-full text-xs rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-indigo-500/50 transition-colors cursor-pointer"
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Failure Category
          </label>
          <select
            value={filters.failureCategory}
            onChange={(e) => onFilterChange({ failureCategory: e.target.value })}
            className="w-full text-xs rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-indigo-500/50 transition-colors cursor-pointer"
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
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Worthiness Decision
          </label>
          <select
            value={filters.recoveryWorthiness}
            onChange={(e) =>
              onFilterChange({ recoveryWorthiness: e.target.value })
            }
            className="w-full text-xs rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-indigo-500/50 transition-colors cursor-pointer"
          >
            <option value="">All Decisions</option>
            <option value="RECOVER">RECOVER</option>
            <option value="REVIEW">REVIEW</option>
            <option value="DO_NOT_RECOVER">DO_NOT_RECOVER</option>
          </select>
        </div>

        {/* Recovery Status */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Recovery Status
          </label>
          <select
            value={filters.recoveryStatus}
            onChange={(e) => onFilterChange({ recoveryStatus: e.target.value })}
            className="w-full text-xs rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-foreground focus-visible:outline-none focus-visible:ring-1.5 focus-visible:ring-indigo-500/50 transition-colors cursor-pointer"
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
