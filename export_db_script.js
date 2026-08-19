const mysqldump = require('mysqldump');
const path = require('path');

console.log('Starting database export directly to SQL file...');

mysqldump({
    connection: {
        host: '127.0.0.1',
        user: 'root',
        password: '',
        database: 'hrmattendencesaas',
    },
    dumpToFile: path.join(__dirname, '..', 'hrmattendencesaas_backup.sql'),
})
.then(() => {
    console.log('Database export completed successfully! The SQL file is ready.');
    process.exit(0);
})
.catch((err) => {
    console.error('Error during database export:', err);
    process.exit(1);
});
