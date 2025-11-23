import 'dotenv/config';
import { notifyReports } from '../src/notifier.js';

async function main() {
    console.log('Sending test email...');
    try {
        await notifyReports('Test Email from Thesara', 'This is a test email to verify the configuration.');
        console.log('Test email sent successfully (check your inbox).');
    } catch (err) {
        console.error('Failed to send test email:', err);
    }
}

main();
