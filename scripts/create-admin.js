const readline = require('readline');
const bcrypt = require('bcryptjs');

const { initializeDatabase, get, run, db } = require('../src/config/db');

function ask(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(promptText) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('Password entry requires an interactive terminal.'));
  }

  process.stdout.write(promptText);
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let password = '';

    function finish(error) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(password);
      }
    }

    function onData(character) {
      if (character === '\u0003') {
        finish(new Error('Password entry cancelled.'));
        return;
      }

      if (character === '\r' || character === '\n') {
        finish();
        return;
      }

      if (character === '\u007f' || character === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }

      if (character >= ' ') {
        password += character;
        process.stdout.write('*');
      }
    }

    process.stdin.on('data', onData);
  });
}

async function main() {
  await initializeDatabase();

  const existingAdmin = await get('SELECT username FROM administrators LIMIT 1;');
  if (existingAdmin) {
    throw new Error(`An administrator account already exists (${existingAdmin.username}). Refusing to overwrite it.`);
  }

  const username = await ask('Admin username: ');
  const password = await askHidden('Admin password (at least 12 characters): ');

  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) {
    throw new Error('Username must be 3-64 characters using letters, numbers, dot, underscore, or hyphen.');
  }

  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters long.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await run('BEGIN IMMEDIATE;');
  try {
    const adminCreatedWhilePrompting = await get('SELECT username FROM administrators LIMIT 1;');
    if (adminCreatedWhilePrompting) {
      throw new Error('An administrator account was created while this setup was in progress. No account was added.');
    }

    await run(
      'INSERT INTO administrators (username, password_hash) VALUES (?, ?);',
      [username, passwordHash]
    );
    await run('COMMIT;');
  } catch (error) {
    await run('ROLLBACK;');
    throw error;
  }

  console.log(`Administrator account created for ${username}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    db.close();
  });
