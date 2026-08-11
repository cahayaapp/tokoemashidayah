export const state = {
  user: null,
  profile: null,
  store: null,
  goldRates: null,
  currentRoute: 'dashboard',
  routeCleanup: null,
  sidebarOpen: false
};

export function setSession({ user, profile, store, goldRates }) {
  state.user = user || null;
  state.profile = profile || null;
  state.store = store || null;
  state.goldRates = goldRates || null;
}

export function clearSession() {
  if (typeof state.routeCleanup === 'function') state.routeCleanup();
  state.user = null;
  state.profile = null;
  state.store = null;
  state.goldRates = null;
  state.routeCleanup = null;
}

export function hasRole(...roles) {
  return Boolean(state.profile?.active && roles.includes(state.profile.role));
}

export function canManage() { return hasRole('owner', 'admin'); }
export function canOperate() { return hasRole('owner', 'admin', 'cashier'); }
export function canAudit() { return hasRole('owner', 'admin', 'auditor'); }
