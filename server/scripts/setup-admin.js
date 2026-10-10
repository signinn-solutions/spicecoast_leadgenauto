import { hasUsers, createUser, findUserByEmail, issueSetup } from '../services/accessService.js';
import { closeStorage } from '../services/storageService.js';
const email = process.argv[2];
if (!email) {
  console.error('Usage: npm run admin:setup -- admin@example.com');
  process.exitCode = 1;
} else {
  try {
    const existing = findUserByEmail(email);
    if (existing && existing.role !== 'super_admin') throw new Error('This account is not a super admin. Change its role from an existing super admin dashboard.');
    if (!existing && hasUsers()) throw new Error('A workspace already exists. Create users from its super admin dashboard.');
    const {
      setup
    } = existing ? {
      setup: issueSetup(existing.id)
    } : createUser({
      email,
      name: 'Super administrator',
      role: 'super_admin',
      dailyLeadLimit: -1
    });
    console.log('One-time activation (24 hours). Open the app, then use this fragment on its URL:');
    console.log('#activate=' + setup.token + '&email=' + encodeURIComponent(email));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    closeStorage();
  }
}
