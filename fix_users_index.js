const db = require('./config/db');

async function checkUsers() {
  try {
    const [indexes] = await db.execute('SHOW INDEX FROM users');
    console.log('Users indexes:', indexes.map(i => ({ Key_name: i.Key_name, Column_name: i.Column_name, Non_unique: i.Non_unique })));

    // Check if email has global unique index on users
    const emailIndex = indexes.find(i => i.Key_name === 'email' && i.Non_unique === 0);
    if (emailIndex) {
      console.log('Dropping global UNIQUE constraint on email in users...');
      await db.execute('ALTER TABLE users DROP INDEX email');
      console.log('Dropped global email index from users.');
      // Add compound unique index on (company_id, email) or index
      console.log('Adding UNIQUE KEY unique_company_user_email (company_id, email)...');
      try {
        await db.execute('ALTER TABLE users ADD UNIQUE KEY unique_company_user_email (company_id, email)');
        console.log('Added unique_company_user_email.');
      } catch(e) {
        console.log('Could not add compound unique:', e.message);
        await db.execute('ALTER TABLE users ADD INDEX idx_company_email (company_id, email)');
      }
    }

    console.log('Users table verified.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkUsers();
