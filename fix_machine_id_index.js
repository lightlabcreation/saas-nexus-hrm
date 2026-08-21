const db = require('./config/db');

async function fixIndexes() {
  try {
    console.log('Fetching indexes for table employees...');
    const [indexes] = await db.execute('SHOW INDEX FROM employees');
    console.log('Current indexes on employees:', indexes.map(i => ({ Key_name: i.Key_name, Column_name: i.Column_name, Non_unique: i.Non_unique })));

    // Check if machine_id unique index exists
    const machineIndex = indexes.find(i => i.Key_name === 'machine_id' && i.Non_unique === 0);
    if (machineIndex) {
      console.log('Dropping global UNIQUE constraint on machine_id...');
      await db.execute('ALTER TABLE employees DROP INDEX machine_id');
      console.log('Dropped global machine_id index.');
    }

    // Check if email unique index exists on employees
    const emailIndex = indexes.find(i => i.Key_name === 'email' && i.Non_unique === 0);
    if (emailIndex) {
      console.log('Dropping global UNIQUE constraint on email in employees...');
      await db.execute('ALTER TABLE employees DROP INDEX email');
      console.log('Dropped global email index from employees.');
    }

    // Add compound unique index on (company_id, machine_id)
    const [updatedIndexes] = await db.execute('SHOW INDEX FROM employees');
    const hasCompanyMachine = updatedIndexes.some(i => i.Key_name === 'unique_company_machine');
    if (!hasCompanyMachine) {
      console.log('Adding UNIQUE KEY unique_company_machine (company_id, machine_id)...');
      try {
        await db.execute('ALTER TABLE employees ADD UNIQUE KEY unique_company_machine (company_id, machine_id)');
        console.log('Added unique_company_machine index.');
      } catch (e) {
        console.log('Could not add compound unique:', e.message);
        await db.execute('ALTER TABLE employees ADD INDEX idx_company_machine (company_id, machine_id)');
      }
    }

    // Add compound unique index on (company_id, custom_id)
    const hasCompanyCustom = updatedIndexes.some(i => i.Key_name === 'unique_company_custom');
    if (!hasCompanyCustom) {
      console.log('Adding UNIQUE KEY unique_company_custom (company_id, custom_id)...');
      try {
        await db.execute('ALTER TABLE employees ADD UNIQUE KEY unique_company_custom (company_id, custom_id)');
        console.log('Added unique_company_custom index.');
      } catch (e) {
        console.log('Could not add compound custom unique:', e.message);
      }
    }

    console.log('Successfully updated employees table multi-tenant indexes!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixIndexes();
