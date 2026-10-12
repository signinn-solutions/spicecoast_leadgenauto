import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import config from '../config/env.js';
import {
  seedDefaultUsers,
  getUserByEmail,
  verifyUserPassword,
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../services/userService.js';

test('seedDefaultUsers creates admin@signinn.in as superadmin and admin@thespicecoast.com as user', async () => {
  await seedDefaultUsers();

  const superadmin = getUserByEmail('admin@signinn.in');
  assert.ok(superadmin, 'admin@signinn.in must exist');
  assert.equal(superadmin.role, 'superadmin');
  assert.equal(superadmin.status, 'active');
  assert.ok(await verifyUserPassword('Admin@Signinn123', superadmin.password_hash));

  const spicecoastUser = getUserByEmail('admin@thespicecoast.com');
  assert.ok(spicecoastUser, 'admin@thespicecoast.com must exist');
  assert.equal(spicecoastUser.role, 'user');
  assert.equal(spicecoastUser.status, 'active');
  assert.ok(await verifyUserPassword('SpiceCoast_Admin_c3031b5744c12df9!', spicecoastUser.password_hash));

  // Running seedDefaultUsers again should be idempotent and not duplicate
  await seedDefaultUsers();
  const all = getAllUsers();
  const signinnCount = all.filter((u) => u.email.toLowerCase() === 'admin@signinn.in').length;
  assert.equal(signinnCount, 1, 'Only 1 admin@signinn.in should exist');
});

test('Superadmin API role-based access control gates user management and metrics', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  try {
    // 1. Sign in as SpiceCoast regular user (admin@thespicecoast.com)
    const userLoginResp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@thespicecoast.com',
        password: 'SpiceCoast_Admin_c3031b5744c12df9!',
      }),
    });
    assert.equal(userLoginResp.status, 200);
    const userCookie = userLoginResp.headers.get('set-cookie').split(';')[0];
    const userData = await userLoginResp.json();
    assert.equal(userData.user.role, 'user');

    // Regular user attempting to access /api/admin/users must be blocked with 403
    const blockedUsersResp = await fetch(`${base}/api/admin/users`, {
      headers: { cookie: userCookie },
    });
    assert.equal(blockedUsersResp.status, 403, 'Regular user must be forbidden from superadmin endpoints');

    // 2. Sign in as Superadmin (admin@signinn.in)
    const adminLoginResp = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@signinn.in',
        password: 'Admin@Signinn123',
      }),
    });
    assert.equal(adminLoginResp.status, 200);
    const adminCookie = adminLoginResp.headers.get('set-cookie').split(';')[0];
    const adminData = await adminLoginResp.json();
    assert.equal(adminData.user.role, 'superadmin');

    // Superadmin accessing /api/admin/users succeeds with 200
    const adminUsersResp = await fetch(`${base}/api/admin/users`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(adminUsersResp.status, 200);
    const usersList = await adminUsersResp.json();
    assert.ok(Array.isArray(usersList.users));

    // Superadmin accessing /api/admin/system/health succeeds with 200
    const healthResp = await fetch(`${base}/api/admin/system/health`, {
      headers: { cookie: adminCookie },
    });
    assert.equal(healthResp.status, 200);
    const healthData = await healthResp.json();
    assert.ok(healthData.system);
    assert.ok(healthData.integrations);
    assert.ok(healthData.quotas);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
