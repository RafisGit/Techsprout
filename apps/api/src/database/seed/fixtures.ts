export const SEED_ROLES = [
  {
    name: 'student',
    description: 'Enrolled student with standard course access',
  },
  {
    name: 'admin',
    description: 'System administrator with full privileges',
  },
];

export const SEED_USERS = [
  {
    name: 'TechSprout Admin',
    username: 'admin',
    email: 'admin@techsprout.edu',
    phone: '01700000001',
    password: 'AdminPassword123!',
    role: 'admin',
    isVerified: true,
  },
  {
    name: 'Test Student',
    username: 'student',
    email: 'student@techsprout.edu',
    phone: '01700000002',
    password: 'StudentPassword123!',
    role: 'student',
    isVerified: true,
  },
];
