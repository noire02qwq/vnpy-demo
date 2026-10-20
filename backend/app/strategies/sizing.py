"""百分比仓位:预算基数由 entry_basis 决定,股数恒受现金硬约束,下取整。"""

import math


def budget_amount(base: float, entry_pct: float) -> float:
    return base * entry_pct / 100.0


def plan_shares(base: float, entry_pct: float, price: float, cash: float, entry_basis: str) -> int:
    if price <= 0 or entry_pct <= 0:
        return 0
    budget = budget_amount(base, entry_pct)
    return min(math.floor(budget / price), math.floor(cash / price))
