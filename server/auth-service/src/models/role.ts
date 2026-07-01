export const ROLE_WEIGHTS = {
  admin: 100,
  business_admin: 80,
  business_staff: 60,
  standard_customer: 10,
} as const;

export type Role = keyof typeof ROLE_WEIGHTS;

export const hasRequiredRole = (
  userRole: Role,
  requiredRole: Role,
): boolean => {
  const currentUserRoleWeight = ROLE_WEIGHTS[userRole] || 0;
  const requiredRoleWeight = ROLE_WEIGHTS[requiredRole] || Infinity;

  return currentUserRoleWeight >= requiredRoleWeight;
};
