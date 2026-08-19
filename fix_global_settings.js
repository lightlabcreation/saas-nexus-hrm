const db = require('./config/db');

async function main() {
    const defaultNotifs = {
        emailNewCompany: true,
        emailCompanyRequest: true,
        emailPlanRenewalRequest: true,
        systemNewLogin: true,
        systemCompanyExpiry: true,
        systemExpiry3Day: true,
        systemExpiry1Day: true,
        systemLowStorage: false,
        digestFrequency: 'daily'
    };
    
    await db.execute('UPDATE global_settings SET notifications = ?', [JSON.stringify(defaultNotifs)]);
    console.log('Reset notifications in DB');
    process.exit(0);
}
main();
