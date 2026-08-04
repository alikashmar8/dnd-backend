export enum UserRole {
  CUSTOMER = 'customer',
  DRIVER = 'driver',

  // Management / dispatch tier
  SUPERADMIN = 'superadmin',
  KITCHEN_HEAD = 'kitchen_head',
  WAREHOUSE_HEAD = 'warehouse_head',
  DRIVER_HEAD = 'driver_head',

  // Execution / operational tier
  KITCHEN_STAFF = 'kitchen_staff',
  WAREHOUSE_STAFF = 'warehouse_staff',
}
