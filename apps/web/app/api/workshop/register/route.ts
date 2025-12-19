import { NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
        ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        : {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        };

    initializeApp({
        credential: cert(serviceAccount),
    });
}

const db = getFirestore();

export async function POST(req: Request) {
    try {
        const { email } = await req.json();

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return NextResponse.json(
                { ok: false, error: 'Invalid email address' },
                { status: 400 }
            );
        }

        // Check if already registered
        const existingRegistration = await db
            .collection('workshop-registrations')
            .where('email', '==', email.toLowerCase())
            .limit(1)
            .get();

        if (!existingRegistration.empty) {
            return NextResponse.json(
                { ok: true, message: 'Already registered' },
                { status: 200 }
            );
        }

        // Save registration
        await db.collection('workshop-registrations').add({
            email: email.toLowerCase(),
            registeredAt: new Date().toISOString(),
            workshopDate: '2025-12-23T20:00:00',
            locale: req.headers.get('accept-language')?.split(',')[0] || 'hr',
            userAgent: req.headers.get('user-agent') || '',
        });

        // TODO: Send confirmation email with workshop link
        // For now, we'll just store the registration
        // You can add email sending logic here later

        return NextResponse.json(
            { ok: true, message: 'Registration successful' },
            { status: 201 }
        );
    } catch (error: any) {
        console.error('Workshop registration error:', error);
        return NextResponse.json(
            { ok: false, error: error.message || 'Registration failed' },
            { status: 500 }
        );
    }
}

// Get all registrations (admin only - you can add authentication here)
export async function GET(req: Request) {
    try {
        // TODO: Add admin authentication check here

        const registrations = await db
            .collection('workshop-registrations')
            .orderBy('registeredAt', 'desc')
            .get();

        const data = registrations.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        return NextResponse.json({
            ok: true,
            count: data.length,
            registrations: data,
        });
    } catch (error: any) {
        console.error('Error fetching registrations:', error);
        return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
        );
    }
}
