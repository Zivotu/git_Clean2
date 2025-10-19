// apps/web/app/api/jwt/route.ts
import { NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const userId = data?.userId
    const role = data?.role ?? 'user'

    if (!userId) {
      return NextResponse.json(
        { ok: false, error: 'Missing userId in request body' },
        { status: 400 }
      )
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return NextResponse.json(
        { ok: false, error: 'JWT_SECRET not configured' },
        { status: 500 }
      )
    }

    const signOptions: jwt.SignOptions = {
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: process.env.JWT_ISSUER || 'thesara-api',
    }
    if (process.env.JWT_AUDIENCE) {
      signOptions.audience = process.env.JWT_AUDIENCE
    }

    const token = jwt.sign({ sub: userId, role }, secret, signOptions)

    return NextResponse.json({ ok: true, token })
  } catch (err: any) {
    console.error('JWT sign error:', err)
    return NextResponse.json(
      { ok: false, error: err.message || 'Failed to sign token' },
      { status: 500 }
    )
  }
}
