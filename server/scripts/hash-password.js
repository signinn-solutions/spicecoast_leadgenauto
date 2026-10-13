import readline from 'node:readline';
import { Writable } from 'node:stream';
import { hashPassword } from '../middleware/dashboardAuth.js';

let hidden = false;
const output = new Writable({ write(chunk, encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const prompt = readline.createInterface({ input: process.stdin, output, terminal: true });
process.stdout.write('Admin password (at least 8 characters; input is hidden): ');
hidden = true;
prompt.question('', async (password) => {
  hidden = false;
  prompt.close();
  if (password.length < 8 || password.length > 1024) {
    console.error('\nPassword must be between 8 and 1024 characters.');
    process.exitCode = 1;
    return;
  }
  console.log(`\nStore this in your server secret configuration:\nADMIN_PASSWORD_HASH=${await hashPassword(password)}`);
});
